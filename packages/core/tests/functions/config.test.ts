/**
 * =============================================================================
 * @hai/core - 配置管理测试
 * =============================================================================
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ConfigErrorCode } from '../../src/config/index.js'
import { config } from '../../src/functions/core-function-config.js'

const testDir = join(process.cwd(), '.test-config-config')
const testFile = join(testDir, 'test.yml')

const TestSchema = z.object({
  name: z.string(),
  port: z.number(),
  debug: z.boolean().optional(),
})

describe('core-function-config', () => {
  beforeEach(() => {
    config.clear()
    config.unwatch()
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    config.clear()
    config.unwatch()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('config.load()', () => {
    it('应加载配置到缓存', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      const result = config.load('app', testFile, TestSchema)
      expect(result.success).toBe(true)
      expect(config.has('app')).toBe(true)
    })
  })

  describe('config.get()', () => {
    it('应获取已加载的配置', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)
      const data = config.get<z.infer<typeof TestSchema>>('app')
      expect(data?.name).toBe('app')
      expect(data?.port).toBe(3000)
    })

    it('应在配置不存在时返回 undefined', () => {
      const data = config.get('nonexistent')
      expect(data).toBeUndefined()
    })
  })

  describe('config.getOrThrow()', () => {
    it('应获取已加载的配置', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)
      const data = config.getOrThrow<z.infer<typeof TestSchema>>('app')
      expect(data.name).toBe('app')
    })

    it('应在配置不存在时抛出错误', () => {
      expect(() => config.getOrThrow('nonexistent')).toThrow()
    })
  })

  describe('config.reload()', () => {
    it('应重新加载配置', () => {
      writeFileSync(testFile, 'name: v1\nport: 3000')
      config.load('app', testFile, TestSchema)

      writeFileSync(testFile, 'name: v2\nport: 4000')
      const result = config.reload('app')
      expect(result.success).toBe(true)

      const data = config.get<z.infer<typeof TestSchema>>('app')
      expect(data?.name).toBe('v2')
      expect(data?.port).toBe(4000)
    })

    it('应在配置未加载时返回错误', () => {
      const result = config.reload('nonexistent')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(ConfigErrorCode.NOT_LOADED)
      }
    })
  })

  describe('config.watch()', () => {
    it('应监听文件变更并自动重载', () => {
      writeFileSync(testFile, 'name: v1\nport: 3000')
      config.load('app', testFile, TestSchema)

      let reloadedConfig: unknown = null
      config.watch<z.infer<typeof TestSchema>>('app', (cfg, error) => {
        if (!error) {
          reloadedConfig = cfg
        }
      })

      writeFileSync(testFile, 'name: v2\nport: 4000')
      // 手动触发 reload 模拟文件变更
      config.reload('app')

      expect(reloadedConfig).toEqual({ name: 'v2', port: 4000 })
    })

    it('应返回取消监听函数', () => {
      writeFileSync(testFile, 'name: v1\nport: 3000')
      config.load('app', testFile, TestSchema)

      let callCount = 0
      const unwatch = config.watch('app', (cfg, error) => {
        if (!error) {
          callCount++
        }
      })

      // 手动触发 reload
      config.reload('app')
      expect(callCount).toBe(1)

      unwatch()
      config.reload('app')
      expect(callCount).toBe(1)
    })

    it('应在配置加载失败时通知错误', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)

      let receivedError: unknown = null
      config.watch('app', (cfg, error) => {
        receivedError = error
      })

      // 写入无效配置
      writeFileSync(testFile, 'invalid: yaml: content')
      const result = config.reload('app')
      expect(result.success).toBe(false)
      expect(receivedError).not.toBeNull()
    })
  })

  describe('config.has()', () => {
    it('应检查配置是否存在', () => {
      expect(config.has('app')).toBe(false)

      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)

      expect(config.has('app')).toBe(true)
    })
  })

  describe('config.clear()', () => {
    it('应清除指定配置', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)

      config.clear('app')
      expect(config.has('app')).toBe(false)
    })

    it('应清除所有配置', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app1', testFile, TestSchema)
      config.load('app2', testFile, TestSchema)

      config.clear()
      expect(config.keys()).toHaveLength(0)
    })
  })

  describe('config.keys()', () => {
    it('应返回所有已加载的配置名称', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app1', testFile, TestSchema)
      config.load('app2', testFile, TestSchema)

      const keys = config.keys()
      expect(keys).toContain('app1')
      expect(keys).toContain('app2')
    })
  })

  describe('config.unwatch()', () => {
    it('应停止指定配置的监听', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)
      config.watch('app', () => {})

      config.unwatch('app')
      // 无法直接验证是否停止，但不应抛出错误
    })

    it('应停止所有配置的监听', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app1', testFile, TestSchema)
      config.load('app2', testFile, TestSchema)
      config.watch('app1', () => {})
      config.watch('app2', () => {})

      config.unwatch()
      // 无法直接验证是否停止，但不应抛出错误
    })
  })
})
