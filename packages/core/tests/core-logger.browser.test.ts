/**
 * =============================================================================
 * @h-ai/core - Logger 测试（Browser）
 * =============================================================================
 */

import log from 'loglevel'
import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.logger (browser)', () => {
  it('logger 应该为单例', () => {
    expect(core.logger).toBe(core.logger)
  })

  it('createLogger 应该返回带完整方法集的实例', () => {
    const logger = core.logger.create({ name: 'browser-test' })
    expect(typeof logger.trace).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.fatal).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('createLogger 无 name 时应该使用默认实例', () => {
    const logger = core.logger.create()
    expect(typeof logger.info).toBe('function')
  })

  it('createLogger 应该支持指定 level 和 context', () => {
    const logger = core.logger.create({
      name: 'custom',
      level: 'debug',
      context: { service: 'web' },
    })
    expect(() => logger.info('test with context', { extra: 'data' })).not.toThrow()
  })

  it('各级别日志调用不应抛错', () => {
    const logger = core.logger.create({ name: 'level-test', level: 'trace' })
    expect(() => logger.trace('trace')).not.toThrow()
    expect(() => logger.debug('debug')).not.toThrow()
    expect(() => logger.info('info')).not.toThrow()
    expect(() => logger.warn('warn')).not.toThrow()
    expect(() => logger.error('error')).not.toThrow()
    expect(() => logger.fatal('fatal')).not.toThrow()
  })

  it('child 应该继承父级上下文', () => {
    const parent = core.logger.create({ name: 'parent-browser' })
    const child = parent.child({ module: 'ui' })
    expect(typeof child.info).toBe('function')
    expect(() => child.info('child log')).not.toThrow()
  })

  it('configureLogger 应该设置级别和上下文', () => {
    core.logger.configure({ level: 'debug', context: { app: 'test' } })
    expect(core.logger.getLevel()).toBe('debug')

    // 恢复
    core.logger.setLevel('info')
  })

  it('浏览器 logger 默认应脱敏敏感字段与 URL 凭证', () => {
    const logger = core.logger.create({ name: 'browser-redact-test' })
    const rawLogger = log.getLogger('browser-redact-test')
    const messages: string[] = []
    const originalInfo = rawLogger.info.bind(rawLogger)
    rawLogger.info = (...args: unknown[]) => {
      messages.push(args.map(arg => String(arg)).join(' '))
    }

    try {
      logger.info('browser sensitive payload', {
        authorization: 'Bearer secret-token',
        baseUrl: 'https://user:pass@example.com/api/v1',
        nested: { privateKey: 'private-value' },
        email: 'test@example.com',
      })
    }
    finally {
      rawLogger.info = originalInfo
    }

    const message = messages[0] ?? ''
    expect(message).toContain('"authorization":"[REDACTED]"')
    expect(message).toContain('"baseUrl":"https://[REDACTED]:[REDACTED]@example.com/api/v1"')
    expect(message).toContain('"privateKey":"[REDACTED]"')
    expect(message).toContain('"email":"test@example.com"')
  })

  it('setLogLevel/getLogLevel 应该生效', () => {
    core.logger.setLevel('warn')
    expect(core.logger.getLevel()).toBe('warn')

    // 恢复
    core.logger.setLevel('info')
  })
})
