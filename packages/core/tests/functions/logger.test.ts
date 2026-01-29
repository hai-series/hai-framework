/**
 * =============================================================================
 * @hai/core - Logger 测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  configureLogger,
  createLogger,
  getLogger,
  getLogLevel,
  resetLogger,
  setLogLevel,
} from '../../src/functions/core-function-logger.node.js'

describe('core-function-logger (Node.js)', () => {
  beforeEach(() => {
    resetLogger()
  })

  describe('createLogger()', () => {
    it('应创建 Logger 实例', () => {
      const logger = createLogger()
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.trace).toBe('function')
      expect(typeof logger.fatal).toBe('function')
    })

    it('应创建带名称的 Logger', () => {
      const logger = createLogger({ name: 'test-logger' })
      expect(logger).toBeDefined()
    })

    it('应创建带上下文的 Logger', () => {
      const logger = createLogger({ context: { service: 'api' } })
      expect(logger).toBeDefined()
    })

    it('应创建指定级别的 Logger', () => {
      const logger = createLogger({ level: 'debug' })
      expect(logger).toBeDefined()
    })

    it('应创建指定格式的 Logger', () => {
      const jsonLogger = createLogger({ format: 'json' })
      expect(jsonLogger).toBeDefined()

      const prettyLogger = createLogger({ format: 'pretty' })
      expect(prettyLogger).toBeDefined()
    })
  })

  describe('getLogger()', () => {
    it('应返回单例 Logger', () => {
      const logger1 = getLogger()
      const logger2 = getLogger()
      expect(logger1).toBe(logger2)
    })

    it('应在 resetLogger 后返回新实例', () => {
      const logger1 = getLogger()
      resetLogger()
      const logger2 = getLogger()
      expect(logger1).not.toBe(logger2)
    })
  })

  describe('setLogLevel() / getLogLevel()', () => {
    it('应设置并获取日志级别', () => {
      setLogLevel('debug')
      expect(getLogLevel()).toBe('debug')

      setLogLevel('warn')
      expect(getLogLevel()).toBe('warn')

      setLogLevel('info')
      expect(getLogLevel()).toBe('info')
    })
  })

  describe('configureLogger()', () => {
    it('应配置日志级别', () => {
      configureLogger({ level: 'error' })
      expect(getLogLevel()).toBe('error')
    })

    it('应配置多个选项', () => {
      configureLogger({
        level: 'debug',
        format: 'json',
        context: { app: 'test' },
      })
      expect(getLogLevel()).toBe('debug')
    })
  })

  describe('child logger', () => {
    it('应创建子 Logger', () => {
      const logger = createLogger({ name: 'parent' })
      const childLogger = logger.child({ requestId: '123' })
      expect(childLogger).toBeDefined()
      expect(typeof childLogger.info).toBe('function')
    })

    it('子 Logger 应继承父 Logger 的方法', () => {
      const logger = createLogger()
      const childLogger = logger.child({ userId: '456' })
      expect(typeof childLogger.debug).toBe('function')
      expect(typeof childLogger.child).toBe('function')
    })
  })

  describe('日志方法调用', () => {
    it('应能调用所有日志方法', () => {
      const logger = createLogger({ format: 'json' })

      // 这些调用不应抛出错误
      expect(() => logger.trace('trace message')).not.toThrow()
      expect(() => logger.debug('debug message')).not.toThrow()
      expect(() => logger.info('info message')).not.toThrow()
      expect(() => logger.warn('warn message')).not.toThrow()
      expect(() => logger.error('error message')).not.toThrow()
      expect(() => logger.fatal('fatal message')).not.toThrow()
    })

    it('应支持带上下文的日志', () => {
      const logger = createLogger({ format: 'json' })

      expect(() => logger.info('message', { key: 'value' })).not.toThrow()
      expect(() => logger.error('error', { error: new Error('test') })).not.toThrow()
    })
  })
})
