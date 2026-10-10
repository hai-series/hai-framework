import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'

afterEach(() => {
  core.config.clear()
  core.logger.configure({ level: 'info', format: 'json', redact: [] })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function captureOutput(): string[] {
  const writes: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    return true
  }) as typeof process.stdout.write)
  return writes
}

describe('已有 Node logger 应用 core 配置', () => {
  it('初始化前创建的默认、模块和嵌套子 logger 实际遵循 YAML 与 HAI 日志覆盖', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hai-logger-config-'))
    core.logger.configure({ level: 'info', format: 'pretty' })
    const original = core.logger
    const moduleLogger = original.child({ module: 'fixture', employeeId: 'module-private' })
    const nested = moduleLogger.child({ scope: 'nested' })
    const named = original.create({ name: 'early-module' })
    const output = captureOutput()
    try {
      writeFileSync(join(directory, '_core.yml'), `name: configured-app
logging:
  level: debug
  format: json
  context:
    deployment: configured
  redact:
    - employeeId
    - metadata.code
`)
      writeFileSync(join(directory, 'app.yml'), 'enabled: true\n')
      vi.stubEnv('HAI_CORE_LOGGING_LEVEL', 'warn')
      core.init({ configDir: directory })

      original.info('default-hidden')
      moduleLogger.info('module-hidden')
      named.info('named-hidden')
      nested.warn('nested-visible', { metadata: { code: 'call-private' } })
      named.warn('named-visible')

      const records: unknown[] = output.join('').trim().split('\n').map(line => JSON.parse(line))
      expect(records).toHaveLength(2)
      expect(records[0]).toMatchObject({
        level: 'warn',
        msg: 'nested-visible',
        deployment: 'configured',
        module: 'fixture',
        scope: 'nested',
        employeeId: '[REDACTED]',
        metadata: { code: '[REDACTED]' },
      })
      expect(records[1]).toMatchObject({ level: 'warn', name: 'early-module', deployment: 'configured', msg: 'named-visible' })
      expect(output.join('')).not.toContain('hidden')
      expect(output.join('')).not.toContain('call-private')
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('setLevel 改变实际输出，create 显式级别与本地上下文继续优先于全局', () => {
    core.logger.configure({ level: 'info', format: 'json', context: { source: 'global-before' } })
    const output = captureOutput()
    const inherited = core.logger.create({ name: 'inherited' }).child({ feature: 'child' })
    const explicit = core.logger.create({ name: 'explicit', level: 'debug', format: 'json', context: { source: 'local' } })
    core.logger.setLevel('error')
    inherited.warn('inherited-hidden')
    explicit.debug('explicit-debug')
    core.logger.configure({ context: { source: 'global-after' }, redact: ['employeeId'] })
    inherited.error('inherited-error', { employeeId: 'private-id' })
    explicit.info('explicit-info')

    const records: unknown[] = output.join('').trim().split('\n').map(line => JSON.parse(line))
    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({ msg: 'explicit-debug', level: 'debug', source: 'local' })
    expect(records[1]).toMatchObject({ msg: 'inherited-error', level: 'error', source: 'global-after', feature: 'child', employeeId: '[REDACTED]' })
    expect(records[2]).toMatchObject({ msg: 'explicit-info', level: 'info', source: 'local' })
    expect(output.join('')).not.toContain('inherited-hidden')
  })
})
