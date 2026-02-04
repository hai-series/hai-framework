/**
 * =============================================================================
 * @hai/core - Logger 测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { logger } from '../../src/functions/core-function-logger.node.js'

describe('core-function-logger (Node.js)', () => {
  beforeEach(() => {
    logger.resetLogger()
  })

  describe('createLogger()', () => {
    it('应创建 Logger 实例', () => {
      const loggerInstance = logger.createLogger()
      expect(loggerInstance).toBeDefined()
      expect(typeof loggerInstance.info).toBe('function')
      expect(typeof loggerInstance.debug).toBe('function')
      expect(typeof loggerInstance.warn).toBe('function')
      expect(typeof loggerInstance.error).toBe('function')
      expect(typeof loggerInstance.trace).toBe('function')
      expect(typeof loggerInstance.fatal).toBe('function')
    })

    it('应创建带名称的 Logger', () => {
      const loggerInstance = logger.createLogger({ name: 'test-logger' })
      expect(loggerInstance).toBeDefined()
    })

    it('应创建带上下文的 Logger', () => {
      const loggerInstance = logger.createLogger({ context: { service: 'api' } })
      expect(loggerInstance).toBeDefined()
    })

    it('应创建指定级别的 Logger', () => {
      const loggerInstance = logger.createLogger({ level: 'debug' })
      expect(loggerInstance).toBeDefined()
    })

    it('应创建指定格式的 Logger', () => {
      const jsonLogger = logger.createLogger({ format: 'json' })
      expect(jsonLogger).toBeDefined()

      const prettyLogger = logger.createLogger({ format: 'pretty' })
      expect(prettyLogger).toBeDefined()
    })
  })

  describe('getLogger()', () => {
    it('应返回单例 Logger', () => {
      const logger1 = logger.getLogger()
      const logger2 = logger.getLogger()
      expect(logger1).toBe(logger2)
    })

    it('应在 resetLogger 后返回新实例', () => {
      const logger1 = logger.getLogger()
      logger.resetLogger()
      const logger2 = logger.getLogger()
      expect(logger1).not.toBe(logger2)
    })
  })

  describe('setLogLevel() / getLogLevel()', () => {
    it('应设置并获取日志级别', () => {
      logger.setLogLevel('debug')
      expect(logger.getLogLevel()).toBe('debug')

      logger.setLogLevel('warn')
      expect(logger.getLogLevel()).toBe('warn')

      logger.setLogLevel('info')
      expect(logger.getLogLevel()).toBe('info')
    })
  })

  describe('configureLogger()', () => {
    it('应配置日志级别', () => {
      logger.configureLogger({ level: 'error' })
      expect(logger.getLogLevel()).toBe('error')
    })

    it('应配置多个选项', () => {
      logger.configureLogger({
        level: 'debug',
        format: 'json',
        context: { app: 'test' },
      })
      expect(logger.getLogLevel()).toBe('debug')
    })
  })

  describe('child logger', () => {
    it('应创建子 Logger', () => {
      const loggerInstance = logger.createLogger({ name: 'parent' })
      const childLogger = loggerInstance.child({ requestId: '123' })
      expect(childLogger).toBeDefined()
      expect(typeof childLogger.info).toBe('function')
    })

    it('子 Logger 应继承父 Logger 的方法', () => {
      const loggerInstance = logger.createLogger()
      const childLogger = loggerInstance.child({ userId: '456' })
      expect(typeof childLogger.debug).toBe('function')
      expect(typeof childLogger.child).toBe('function')
    })
  })

  describe('日志方法调用', () => {
    it('应能调用所有日志方法', () => {
      const loggerInstance = logger.createLogger({ format: 'json' })

      // 这些调用不应抛出错误
      expect(() => loggerInstance.trace('trace message')).not.toThrow()
      expect(() => loggerInstance.debug('debug message')).not.toThrow()
      expect(() => loggerInstance.info('info message')).not.toThrow()
      expect(() => loggerInstance.warn('warn message')).not.toThrow()
      expect(() => loggerInstance.error('error message')).not.toThrow()
      expect(() => loggerInstance.fatal('fatal message')).not.toThrow()
    })

    it('应支持带上下文的日志', () => {
      const loggerInstance = logger.createLogger({ format: 'json' })

      expect(() => loggerInstance.info('message', { key: 'value' })).not.toThrow()
      expect(() => loggerInstance.error('error', { error: new Error('test') })).not.toThrow()
    })
  })
})
