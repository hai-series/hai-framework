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
import {
  config,
  isWatchingConfig,
  loadConfig,
  loadYaml,
  unwatchConfig,
  watchConfig,
} from '../../src/functions/core-function-config.js'

const testDir = join(process.cwd(), '.test-config')
const testFile = join(testDir, 'test.yml')

const TestSchema = z.object({
  name: z.string(),
  port: z.number(),
  debug: z.boolean().optional(),
})

describe('core-function-config', () => {
  beforeEach(() => {
    config.clear()
    unwatchConfig()
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    config.clear()
    unwatchConfig()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('loadYaml()', () => {
    it('应加载有效的 YAML 文件', () => {
      writeFileSync(testFile, 'name: test\nport: 3000')
      const result = loadYaml(testFile)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: 'test', port: 3000 })
      }
    })

    it('应返回文件不存在错误', () => {
      const result = loadYaml('/non/existent/file.yml')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(ConfigErrorCode.FILE_NOT_FOUND)
      }
    })

    it('应支持环境变量插值', () => {
      process.env.TEST_PORT = '8080'
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(testFile, 'name: test\nport: ${TEST_PORT}')
      const result = loadYaml(testFile)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: 'test', port: '8080' })
      }
      delete process.env.TEST_PORT
    })

    it('应支持环境变量默认值', () => {
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(testFile, 'name: ${UNDEFINED_VAR:default}\nport: 3000')
      const result = loadYaml(testFile)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: 'default', port: 3000 })
      }
    })

    it('应在缺少环境变量且无默认值时返回错误', () => {
      // eslint-disable-next-line no-template-curly-in-string
      writeFileSync(testFile, 'name: ${MISSING_VAR}\nport: 3000')
      const result = loadYaml(testFile)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(ConfigErrorCode.ENV_VAR_MISSING)
      }
    })
  })

  describe('loadConfig()', () => {
    it('应加载并验证配置', () => {
      writeFileSync(testFile, 'name: test\nport: 3000\ndebug: true')
      const result = loadConfig(testFile, TestSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('test')
        expect(result.data.port).toBe(3000)
        expect(result.data.debug).toBe(true)
      }
    })

    it('应在验证失败时返回错误', () => {
      writeFileSync(testFile, 'name: test\nport: invalid')
      const result = loadConfig(testFile, TestSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(ConfigErrorCode.VALIDATION_ERROR)
      }
    })
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

  describe('config.onChange()', () => {
    it('应注册变更监听器', () => {
      writeFileSync(testFile, 'name: v1\nport: 3000')
      config.load('app', testFile, TestSchema)

      let changedConfig: unknown = null
      config.onChange<z.infer<typeof TestSchema>>('app', (cfg) => {
        changedConfig = cfg
      })

      writeFileSync(testFile, 'name: v2\nport: 4000')
      config.reload('app')

      expect(changedConfig).toEqual({ name: 'v2', port: 4000 })
    })

    it('应返回取消监听函数', () => {
      writeFileSync(testFile, 'name: v1\nport: 3000')
      config.load('app', testFile, TestSchema)

      let callCount = 0
      const unsubscribe = config.onChange('app', () => {
        callCount++
      })

      config.reload('app')
      expect(callCount).toBe(1)

      unsubscribe()
      config.reload('app')
      expect(callCount).toBe(1) // 不再增加
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

  describe('watchConfig()', () => {
    it('应启用配置监听', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)

      const result = watchConfig('app')
      expect(result).toBe(true)
      expect(isWatchingConfig('app')).toBe(true)
    })

    it('应在配置未加载时返回 false', () => {
      const result = watchConfig('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('unwatchConfig()', () => {
    it('应停止指定配置的监听', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app', testFile, TestSchema)
      watchConfig('app')

      unwatchConfig('app')
      expect(isWatchingConfig('app')).toBe(false)
    })

    it('应停止所有配置的监听', () => {
      writeFileSync(testFile, 'name: app\nport: 3000')
      config.load('app1', testFile, TestSchema)
      config.load('app2', testFile, TestSchema)
      watchConfig('app1')
      watchConfig('app2')

      unwatchConfig()
      expect(isWatchingConfig('app1')).toBe(false)
      expect(isWatchingConfig('app2')).toBe(false)
    })
  })
})
