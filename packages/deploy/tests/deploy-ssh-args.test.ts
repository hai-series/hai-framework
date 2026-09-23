/**
 * =============================================================================
 * @h-ai/deploy - SSH 参数构造测试
 * =============================================================================
 *
 * 验证 ssh / scp 参数以数组方式构造（不经 shell），远程命令作为单一参数传入，
 * 确保连接选项与主机密钥策略正确、避免命令注入。
 */

import type { SshConfig } from '../src/deploy-config.js'
import { describe, expect, it } from 'vitest'
import { buildScpUploadArgs, buildSshExecArgs } from '../src/container/deploy-ssh.js'

function makeSshConfig(overrides: Partial<SshConfig> = {}): SshConfig {
  return {
    host: '10.0.0.10',
    port: 22,
    username: 'deploy',
    strictHostKeyChecking: true,
    connectTimeoutSeconds: 10,
    ...overrides,
  }
}

describe('buildSshExecArgs', () => {
  it('包含批处理与超时选项', () => {
    const args = buildSshExecArgs(makeSshConfig(), 'true')
    expect(args).toContain('BatchMode=yes')
    expect(args).toContain('ConnectTimeout=10')
  })

  it('strictHostKeyChecking 为 true 时使用 accept-new', () => {
    const args = buildSshExecArgs(makeSshConfig({ strictHostKeyChecking: true }), 'true')
    expect(args).toContain('StrictHostKeyChecking=accept-new')
  })

  it('strictHostKeyChecking 为 false 时关闭校验', () => {
    const args = buildSshExecArgs(makeSshConfig({ strictHostKeyChecking: false }), 'true')
    expect(args).toContain('StrictHostKeyChecking=no')
  })

  it('提供 identityFile 时加入 -i 与 IdentitiesOnly', () => {
    const args = buildSshExecArgs(makeSshConfig({ identityFile: '/home/u/.ssh/id_ed25519' }), 'true')
    expect(args).toContain('-i')
    expect(args).toContain('/home/u/.ssh/id_ed25519')
    expect(args).toContain('IdentitiesOnly=yes')
  })

  it('提供 knownHostsFile 时加入 UserKnownHostsFile', () => {
    const args = buildSshExecArgs(makeSshConfig({ knownHostsFile: '/tmp/known' }), 'true')
    expect(args).toContain('UserKnownHostsFile=/tmp/known')
  })

  it('远程命令作为单一末尾参数传入（防注入）', () => {
    const remoteCommand = 'cd /opt && docker compose -p hai-demo up -d'
    const args = buildSshExecArgs(makeSshConfig(), remoteCommand)
    expect(args.at(-1)).toBe(remoteCommand)
    expect(args).toContain('deploy@10.0.0.10')
    expect(args).toContain('-p')
  })
})

describe('buildScpUploadArgs', () => {
  it('使用大写 -P 指定端口并拼接远程目标', () => {
    const args = buildScpUploadArgs(makeSshConfig({ port: 2222 }), '/local/image.tar', '/opt/hai/apps/demo/image.tar')
    expect(args).toContain('-P')
    expect(args).toContain('2222')
    expect(args).toContain('/local/image.tar')
    expect(args).toContain('deploy@10.0.0.10:/opt/hai/apps/demo/image.tar')
  })
})
