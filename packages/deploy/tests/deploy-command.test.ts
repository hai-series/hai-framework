/**
 * =============================================================================
 * @h-ai/deploy - 命令执行器测试
 * =============================================================================
 *
 * 验证命令以 command+args 数组执行、退出码判定与敏感信息脱敏。
 * 使用跨平台可用的 node 可执行文件，避免依赖 docker/podman。
 */

import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { maskSecrets, runCommand } from '../src/container/deploy-command.js'

describe('maskSecrets', () => {
  it('替换敏感片段为掩码', () => {
    expect(maskSecrets('token=abc123 rest', ['abc123'])).toBe('token=*** rest')
  })

  it('无 secrets 时原样返回', () => {
    expect(maskSecrets('plain text', [])).toBe('plain text')
    expect(maskSecrets('plain text', undefined)).toBe('plain text')
  })
})

describe('runCommand', () => {
  it('成功命令返回退出码 0 与 stdout', async () => {
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("hello")'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.code).toBe(0)
      expect(result.data.stdout).toBe('hello')
    }
  })

  it('非零退出码返回 REMOTE_COMMAND_FAILED', async () => {
    const result = await runCommand(process.execPath, ['-e', 'process.exit(3)'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('hai:deploy:018')
    }
  })

  it('无法启动的命令返回失败', async () => {
    const result = await runCommand('hai-nonexistent-binary-xyz', ['--version'])
    expect(result.success).toBe(false)
  })
})
