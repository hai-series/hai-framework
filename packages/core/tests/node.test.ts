/**
 * =============================================================================
 * @hai/core - Node.js 专用测试
 * =============================================================================
 * 测试 Node.js 环境下的 core.xxx API
 */

import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { core } from '../src/core-index.node.js'

describe('core service (Node.js)', () => {
  describe('core.id - ID 生成', () => {
    it('should generate unique IDs', () => {
      const id1 = core.id.generate()
      const id2 = core.id.generate()
      expect(id1).not.toBe(id2)
      expect(id1.length).toBe(21)
    })

    it('should generate short IDs', () => {
      const shortId = core.id.short()
      expect(shortId.length).toBe(10)
    })

    it('should generate trace IDs with prefix', () => {
      const traceId = core.id.trace()
      expect(traceId).toMatch(/^trace-/)
    })

    it('should generate request IDs with prefix', () => {
      const reqId = core.id.request()
      expect(reqId).toMatch(/^req-/)
    })
  })

  describe('core.type - 类型检查', () => {
    it('isDefined should work correctly', () => {
      expect(core.type.isDefined(null)).toBe(false)
      expect(core.type.isDefined(undefined)).toBe(false)
      expect(core.type.isDefined(0)).toBe(true)
    })

    it('isObject should work correctly', () => {
      expect(core.type.isObject({})).toBe(true)
      expect(core.type.isObject(null)).toBe(false)
      expect(core.type.isObject([])).toBe(false)
    })
  })

  describe('core.object - 对象操作', () => {
    it('deepClone should create independent copy', () => {
      const original = { a: 1, nested: { b: 2 } }
      const cloned = core.object.deepClone(original)
      cloned.nested.b = 99
      expect(original.nested.b).toBe(2)
    })
  })
})

describe('core.logger - 日志 (Node.js)', () => {
  it('should create logger instance', () => {
    const logger = core.createLogger({ name: 'test' })
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
  })

  it('should get and set log level', () => {
    core.setLogLevel('debug')
    expect(core.getLogLevel()).toBe('debug')
    core.setLogLevel('info')
    expect(core.getLogLevel()).toBe('info')
  })

  it('should configure logger globally', () => {
    core.configureLogger({ level: 'warn' })
    expect(core.getLogLevel()).toBe('warn')
  })
})

describe('core.config - 配置管理 (Node.js)', () => {
  const testDir = join(process.cwd(), '.test-config-node')
  const testFile = join(testDir, 'test.yml')

  beforeEach(() => {
    core.config.clear()
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
  })

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('should load yaml config', () => {
    const yaml = `
name: test-app
port: 3000
`
    writeFileSync(testFile, yaml)
    const TestSchema = z.object({
      name: z.string(),
      port: z.number(),
    })

    const result = core.config.load('test', testFile, TestSchema)
    expect(result.success).toBe(true)

    // Windows / CI 场景下可能会出现文件已被提前清理的情况，避免 cleanup 抛错导致用例失败
    if (existsSync(testFile)) {
      unlinkSync(testFile)
    }
  })

  it('should load and validate config', () => {
    const yaml = `
name: my-app
port: 8080
`
    writeFileSync(testFile, yaml)
    const TestSchema = z.object({
      name: z.string(),
      port: z.number(),
    })

    const result = core.config.load('app', testFile, TestSchema)
    expect(result.success).toBe(true)

    const cfg = core.config.get('app')
    expect(cfg).toEqual({ name: 'my-app', port: 8080 })

    // Windows / CI 场景下可能会出现文件已被提前清理的情况，避免 cleanup 抛错导致用例失败
    if (existsSync(testFile)) {
      unlinkSync(testFile)
    }
  })

  it('should cache config after load', () => {
    const yaml = `value: cached`
    writeFileSync(testFile, yaml)
    const TestSchema = z.object({ value: z.string() })

    core.config.load('cached', testFile, TestSchema)
    expect(core.config.has('cached')).toBe(true)

    const cfg1 = core.config.get('cached')
    const cfg2 = core.config.get('cached')
    expect(cfg1).toBe(cfg2)

    // Windows / CI 场景下可能会出现文件已被提前清理的情况，避免 cleanup 抛错导致用例失败
    if (existsSync(testFile)) {
      unlinkSync(testFile)
    }
  })

  it('should return error for non-existent file', () => {
    const TestSchema = z.object({ name: z.string() })
    const result = core.config.load('missing', '/non/existent/file.yml', TestSchema)
    expect(result.success).toBe(false)
  })

  it('should interpolate environment variables', () => {
    process.env.TEST_VAR = 'env-value'
    const yaml = `
value: \${TEST_VAR}
withDefault: \${MISSING:default-value}
`
    writeFileSync(testFile, yaml)
    const TestSchema = z.object({
      value: z.string(),
      withDefault: z.string(),
    })

    const result = core.config.load('env', testFile, TestSchema)
    expect(result.success).toBe(true)

    const cfg = core.config.get('env')
    expect(cfg?.value).toBe('env-value')
    expect(cfg?.withDefault).toBe('default-value')

    delete process.env.TEST_VAR

    // Windows / CI 场景下可能会出现文件已被提前清理的情况，避免 cleanup 抛错导致用例失败
    if (existsSync(testFile)) {
      unlinkSync(testFile)
    }
  })
})
