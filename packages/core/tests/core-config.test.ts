/**
 * =============================================================================
 * @h-ai/core - 配置管理测试
 * =============================================================================
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ConfigErrorCode, core } from '../src/index.js'

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

  // =========================================================================
  // load
  // =========================================================================

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

  it('load 文件不存在时应返回 FILE_NOT_FOUND', () => {
    const result = core.config.load('app', join(tempDir, 'nonexistent.yml'), schema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.FILE_NOT_FOUND)
    }
  })

  it('load 无效 YAML 应返回 PARSE_ERROR', () => {
    // 使用未闭合的流映射语法触发解析器真正抛出错误
    writeFileSync(configPath, 'key: {unclosed\n', 'utf-8')
    const result = core.config.load('app', configPath, schema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.PARSE_ERROR)
    }
  })

  it('load schema 校验失败应返回 VALIDATION_ERROR', () => {
    writeFileSync(configPath, 'foo: 123\nbar: ok\n', 'utf-8')
    const strictSchema = z.object({ foo: z.number(), bar: z.number() })
    const result = core.config.load('app', configPath, strictSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.VALIDATION_ERROR)
    }
  })

  it('load 不带 schema 应该只做 YAML 解析', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    const result = core.config.load('app', configPath)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ foo: 'a', bar: 'b' })
    }
  })

  it('load 应该支持数组配置的环境变量插值', () => {
    process.env.FOO = 'x'
    // eslint-disable-next-line no-template-curly-in-string
    writeFileSync(configPath, 'items:\n  - ${FOO}\n  - fixed\n', 'utf-8')
    const arrSchema = z.object({ items: z.array(z.string()) })
    const result = core.config.load('app', configPath, arrSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ items: ['x', 'fixed'] })
    }
  })

  // =========================================================================
  // get / getOrThrow / has / keys / clear
  // =========================================================================

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

  it('get 未加载配置应返回 undefined', () => {
    expect(core.config.get('missing')).toBeUndefined()
  })

  it('getOrThrow 在未加载时应抛错', () => {
    expect(() => core.config.getOrThrow('missing')).toThrow()
  })

  it('clear 不传参应清除所有配置', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    const configPath2 = join(tempDir, 'app2.yml')
    writeFileSync(configPath2, 'foo: c\nbar: d\n', 'utf-8')

    core.config.load('app1', configPath, schema)
    core.config.load('app2', configPath2, schema)
    expect(core.config.keys()).toHaveLength(2)

    core.config.clear()
    expect(core.config.keys()).toHaveLength(0)
  })

  // =========================================================================
  // validate
  // =========================================================================

  it('validate 应该基于已加载配置进行校验', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')

    const looseSchema = z.any()
    core.config.load('app', configPath, looseSchema)

    const result = core.config.validate('app', schema)
    expect(result.success).toBe(true)
  })

  it('validate 应该在校验失败时返回 VALIDATION_ERROR', () => {
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

  it('validate 未加载配置应返回 NOT_LOADED', () => {
    const result = core.config.validate('missing', schema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.NOT_LOADED)
    }
  })

  // =========================================================================
  // reload
  // =========================================================================

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

  it('reload 未加载配置应返回 NOT_LOADED', () => {
    const result = core.config.reload('missing')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ConfigErrorCode.NOT_LOADED)
    }
  })

  // =========================================================================
  // watch / unwatch / isWatching
  // =========================================================================

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

  it('watch 未加载配置应立即回调错误', () => {
    let receivedError: { code: number } | undefined
    core.config.watch('nonexistent', (_cfg, error) => {
      receivedError = error
    })
    expect(receivedError).toBeDefined()
    expect(receivedError?.code).toBe(ConfigErrorCode.NOT_LOADED)
  })

  it('isWatching 应该正确反映监听状态', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    core.config.load('app', configPath, schema)

    expect(core.config.isWatching('app')).toBe(false)
    const unwatch = core.config.watch('app', () => {})
    expect(core.config.isWatching('app')).toBe(true)
    unwatch()
    expect(core.config.isWatching('app')).toBe(false)
  })

  it('unwatch 按名称应该停止特定监听', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    core.config.load('app', configPath, schema)
    core.config.watch('app', () => {})
    expect(core.config.isWatching('app')).toBe(true)

    core.config.unwatch('app')
    expect(core.config.isWatching('app')).toBe(false)
  })

  it('unwatch 不传参应该停止所有监听', () => {
    writeFileSync(configPath, 'foo: a\nbar: b\n', 'utf-8')
    const configPath2 = join(tempDir, 'app2.yml')
    writeFileSync(configPath2, 'foo: c\nbar: d\n', 'utf-8')

    core.config.load('app1', configPath, schema)
    core.config.load('app2', configPath2, schema)

    core.config.watch('app1', () => {})
    core.config.watch('app2', () => {})
    expect(core.config.isWatching('app1')).toBe(true)
    expect(core.config.isWatching('app2')).toBe(true)

    core.config.unwatch()
    expect(core.config.isWatching('app1')).toBe(false)
    expect(core.config.isWatching('app2')).toBe(false)
  })
})
