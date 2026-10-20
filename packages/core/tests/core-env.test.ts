import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'

describe('core.config.loadEnvFiles', () => {
  let envDir: string
  beforeEach(() => {
    envDir = mkdtempSync(path.join(tmpdir(), 'hai-env-'))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(envDir, { recursive: true, force: true })
  })

  it('基础、环境、本机和进程环境按顺序覆盖，空值也能覆盖且不隐式修改进程', () => {
    writeFileSync(path.join(envDir, '.env'), 'HAI_ENV_TEST_VALUE=base\nHAI_ENV_TEST_EMPTY=base\nHAI_ENV_TEST_SHELL=base\n')
    writeFileSync(path.join(envDir, '.env.dev'), 'HAI_ENV_TEST_VALUE=dev\n')
    writeFileSync(path.join(envDir, '.env.local'), 'HAI_ENV_TEST_VALUE=private\nHAI_ENV_TEST_EMPTY=\n')
    vi.stubEnv('HAI_ENV_TEST_SHELL', 'shell')
    const result = core.config.loadEnvFiles({ envDir, mode: 'development' })
    expect(result).toMatchObject({ success: true, data: { HAI_ENV_TEST_VALUE: 'private', HAI_ENV_TEST_EMPTY: '', HAI_ENV_TEST_SHELL: 'shell' } })
    expect(process.env.HAI_ENV_TEST_VALUE).toBeUndefined()
  })

  it.each([['dev', 'development'], ['test', 'test'], ['prod', 'production']])('读取 %s 环境文件（%s）', (mode, alias) => {
    writeFileSync(path.join(envDir, '.env'), 'HAI_ENV_TEST_VALUE=base\n')
    writeFileSync(path.join(envDir, `.env.${mode}`), `HAI_ENV_TEST_VALUE=${mode}\n`)
    expect(core.config.loadEnvFiles({ envDir, mode: alias })).toMatchObject({ success: true, data: { HAI_ENV_TEST_VALUE: mode } })
  })

  it('不存在的文件可省略，模式名不能逃逸目录', () => {
    expect(core.config.loadEnvFiles({ envDir, mode: 'test' })).toMatchObject({ success: true, data: {} })
    const invalid = core.config.loadEnvFiles({ envDir, mode: '../private' })
    expect(invalid.success).toBe(false)
  })

  it('读取失败返回配置错误，不携带 dotenv 原始内容', () => {
    writeFileSync(path.join(envDir, '.env'), 'HAI_ENV_TEST_VALUE=private-test-value\n')
    mkdirSync(path.join(envDir, '.env.local'))
    const result = core.config.loadEnvFiles({ envDir, mode: 'test' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private-test-value')
  })
})
