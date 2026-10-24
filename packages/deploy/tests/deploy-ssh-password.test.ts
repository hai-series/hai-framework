import type { CommandOptions } from '../src/container/deploy-command.js'
import type { SshConfig } from '../src/deploy-config.js'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { ok } from '@h-ai/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildScpUploadArgs, buildSshExecArgs, createSshExecutor } from '../src/container/deploy-ssh.js'
import { ProviderConfigSchema } from '../src/deploy-config.js'

const calls = vi.hoisted(() => [] as Array<{ command: string, args: string[], options: CommandOptions, helperFiles: string[] }>)
const preparation = vi.hoisted(() => ({ delayMs: 0, throws: false, outputs: [] as string[] }))
vi.mock('../src/container/deploy-command.js', async (original) => {
  const actual = await original<typeof import('../src/container/deploy-command.js')>()
  return {
    ...actual,
    runCommand: vi.fn(async (command: string, args: string[], options: CommandOptions = {}) => {
      const output = options.env?.HAI_DEPLOY_ASKPASS_OUTPUT
      if (output) {
        preparation.outputs.push(output)
        if (preparation.delayMs)
          await new Promise(resolve => setTimeout(resolve, preparation.delayMs))
        if (preparation.throws)
          throw new Error(options.secrets?.[0])
        writeFileSync(output, 'fixed test helper')
      }
      const helper = options.env?.SSH_ASKPASS
      const helperFiles = helper ? readdirSync(dirname(helper)).map(file => readFileSync(join(dirname(helper), file), 'utf8')) : []
      calls.push({ command, args, options, helperFiles })
      return ok({ code: 0, stdout: command === 'ssh' ? 'connected' : '', stderr: '', stdoutTruncated: false, stderrTruncated: false })
    }),
  }
})

const secret = ' 0019 中 "$value" '
function config(overrides: Partial<SshConfig> = {}): SshConfig {
  return { host: '127.0.0.1', port: 2222, username: 'deploy', strictHostKeyChecking: true, connectTimeoutSeconds: 5, ...overrides }
}
function parse(ssh: Record<string, unknown>) {
  return ProviderConfigSchema.safeParse({ type: 'docker-ssh', ssh: { host: '127.0.0.1', username: 'deploy', ...ssh }, expose: { hostPort: 3000 } })
}

beforeEach(() => {
  calls.splice(0)
  preparation.delayMs = 0
  preparation.throws = false
  preparation.outputs.splice(0)
})

describe('ssh password configuration', () => {
  it('保留密码的数字、空格及Unicode原值', () => {
    const result = parse({ auth: 'password', password: secret })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'docker-ssh') {
      expect(result.data.ssh?.auth).toBe('password')
      expect(result.data.ssh?.password).toBe(secret)
    }
  })

  it.each([undefined, ''])('显式密码方式缺少密码时拒绝 %s', (password) => {
    expect(parse({ auth: 'password', password }).success).toBe(false)
  })

  it.each(['a\nb', 'a\rb', 'a\0b', '中'.repeat(342)])('有效密码方式拒绝控制字符或超过readpass字节上限', (password) => {
    expect(parse({ auth: 'password', password }).success).toBe(false)
  })

  it('接受精确1023字节以及只含空格的非空密码', () => {
    expect(parse({ auth: 'password', password: '中'.repeat(341) }).success).toBe(true)
    expect(parse({ auth: 'password', password: '  ' }).success).toBe(true)
  })

  it('显式key忽略无效残留密码', () => {
    expect(parse({ auth: 'key', password: 'unused\nold' }).success).toBe(true)
  })

  it('省略认证方式且密码为空时保留默认key方式', () => {
    const args = buildSshExecArgs(config({ password: '' }), 'true')
    expect(args).toContain('BatchMode=yes')
    expect(args).not.toContain('PreferredAuthentications=password')
  })
})

describe('ssh password execution boundary', () => {
  it('省略auth时由非空密码启用密码认证，密码不进入SSH或SCP参数', () => {
    for (const args of [buildSshExecArgs(config({ password: secret, identityFile: '/old/key' }), 'true'), buildScpUploadArgs(config({ password: secret }), '/local/file.tar', '/remote/file.tar')]) {
      expect(args).toContain('BatchMode=no')
      expect(args).toContain('PreferredAuthentications=password')
      expect(args).toContain('PubkeyAuthentication=no')
      expect(args).toContain('NumberOfPasswordPrompts=1')
      expect(args).not.toContain('-i')
      expect(args.join(' ')).not.toContain(secret)
      expect(args).toContain('StrictHostKeyChecking=accept-new')
    }
  })

  it('显式key忽略残留密码，不生成helper并保留原密钥参数', async () => {
    const ssh = createSshExecutor(config({ auth: 'key', password: secret, identityFile: '/chosen/key' }))
    expect((await ssh.exec('true')).success).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toContain('/chosen/key')
    expect(calls[0]?.args).toContain('BatchMode=yes')
    expect(calls[0]?.options.env?.SSH_ASKPASS).toBeUndefined()
  })

  it('仅向受控子进程环境传密码，自动纳入脱敏并回收无秘密helper', async () => {
    const ssh = createSshExecutor(config({ auth: 'password', password: secret }))
    expect((await ssh.exec('true', { secrets: ['existing-secret'], timeoutMs: 10_000 })).success).toBe(true)
    const call = calls.find(item => item.command === 'ssh')
    expect(call).toBeDefined()
    expect(call?.options.env?.HAI_DEPLOY_ASKPASS_PASSWORD).toBe(secret)
    expect(call?.options.env?.SSH_ASKPASS_REQUIRE).toBe('force')
    expect(call?.options.secrets).toEqual(expect.arrayContaining([secret, 'existing-secret']))
    expect(call?.options.timeoutMs).toBeGreaterThan(0)
    expect(call?.options.timeoutMs).toBeLessThanOrEqual(10_000)
    expect(call?.helperFiles.join('\n')).not.toContain(secret)
    expect(calls.every(item => !item.args.join(' ').includes(secret))).toBe(true)
    expect(call?.options.env?.SSH_ASKPASS && existsSync(call.options.env.SSH_ASKPASS)).toBe(false)
  })

  it('scp自动带同一密码脱敏边界且不把密码落在helper', async () => {
    const ssh = createSshExecutor(config({ password: secret }))
    expect((await ssh.upload('/local/file.tar', '/remote/file.tar')).success).toBe(true)
    const call = calls.find(item => item.command === 'scp')
    expect(call?.options.env?.HAI_DEPLOY_ASKPASS_PASSWORD).toBe(secret)
    expect(call?.options.secrets).toContain(secret)
    expect(call?.helperFiles.join('\n')).not.toContain(secret)
    expect(call?.options.env?.SSH_ASKPASS && existsSync(call.options.env.SSH_ASKPASS)).toBe(false)
  })

  it.skipIf(process.platform !== 'win32')('helper准备耗尽deadline后不再启动SSH并回收目录', async () => {
    preparation.delayMs = 100
    const ssh = createSshExecutor(config({ password: secret }))
    const result = await ssh.exec('true', { timeoutMs: 50 })
    expect(result).toMatchObject({ success: false, error: { ext: { commandExecution: { reason: 'timeout', localTermination: 'not-started' } } } })
    expect(calls.some(call => call.command === 'ssh')).toBe(false)
    for (const call of calls) {
      const output = call.options.env?.HAI_DEPLOY_ASKPASS_OUTPUT
      if (output)
        expect(existsSync(dirname(output))).toBe(false)
    }
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it.skipIf(process.platform !== 'win32')('helper准备异常不暴露秘密cause并关闭失败', async () => {
    preparation.throws = true
    const ssh = createSshExecutor(config({ password: secret }))
    const result = await ssh.exec('true', { timeoutMs: 10_000 })
    expect(result.success).toBe(false)
    expect(calls.some(call => call.command === 'ssh')).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(preparation.outputs.length).toBeGreaterThan(0)
    for (const output of preparation.outputs)
      expect(existsSync(dirname(output))).toBe(false)
  })
})
