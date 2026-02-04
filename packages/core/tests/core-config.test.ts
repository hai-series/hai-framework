/**
 * =============================================================================
 * @hai/core - 配置管理测试
 * =============================================================================
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ConfigErrorCode, core } from '../src/core-index.node.js'

describe('core.config', () => {
  let tempDir: string
  let configPath: string

  const schema = z.object({
    foo: z.string(),
    bar: z.string(),
  })

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hai-core-'))
    configPath = join(tempDir, 'app.yml')
    core.config.clear()
  })

  afterEach(() => {
    core.config.clear()
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.FOO
  })

  it('load 应该读取并插值环境变量', () => {
    process.env.FOO = 'bar'
    writeFileSync(configPath, `foo: \${FOO}\nbar: \${BAR:default}\n`, 'utf-8')

    const result = core.config.load('app', configPath, schema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ foo: 'bar', bar: 'default' })
    }
  })

  it('load 应该在缺少环境变量时返回错误', () => {
    writeFileSync(configPath, `foo: \${MISSING}\nbar: ok\n`, 'utf-8')
    const result = core.config.load('app', configPath, schema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.ENV_VAR_MISSING)
    }
  })

  it('get/getOrThrow/has/keys/clear 应该正常工作', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')

    core.config.load('app', configPath, schema)
    expect(core.config.has('app')).toBe(true)
    expect(core.config.get('app')).toEqual({ foo: 'a', bar: 'b' })
    expect(core.config.getOrThrow('app')).toEqual({ foo: 'a', bar: 'b' })
    expect(core.config.keys()).toEqual(['app'])

    core.config.clear('app')
    expect(core.config.has('app')).toBe(false)
  })

  it('getOrThrow 在未加载时应抛错', () => {
    expect(() => core.config.getOrThrow('missing')).toThrow()
  })

  it('validate 应该基于已加载配置进行校验', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')

    const looseSchema = z.any()
    core.config.load('app', configPath, looseSchema)

    const result = core.config.validate('app', schema)
    expect(result.success).toBe(true)
  })

  it('validate 应该在校验失败时返回错误', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')

    const looseSchema = z.any()
    core.config.load('app', configPath, looseSchema)

    const strictSchema = z.object({ foo: z.number() })
    const result = core.config.validate('app', strictSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.VALIDATION_ERROR)
    }
  })

  it('reload 应该重新读取文件', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    core.config.load('app', configPath, schema)

    writeFileSync(configPath, 'foo: x\nbar: y\n', 'utf-8')
    const result = core.config.reload('app')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ foo: 'x', bar: 'y' })
    }
  })

  it('watch 应该监听变更并支持取消', async () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    core.config.load('app', configPath, schema)

    const updated = await new Promise<Record<string, string>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('watch timeout')), 1000)

      const unwatch = core.config.watch('app', (cfg, error) => {
        if (error)
          return
        clearTimeout(timeout)
        unwatch()
        resolve(cfg as Record<string, string>)
      })

      setTimeout(() => {
        writeFileSync(configPath, 'foo: c\nbar: d\n', 'utf-8')
      }, 50)
    })

    expect(updated).toEqual({ foo: 'c', bar: 'd' })
    expect(core.config.isWatching('app')).toBe(false)
  })
})
