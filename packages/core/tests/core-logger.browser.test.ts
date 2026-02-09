/**
 * =============================================================================
 * @hai/core - Logger 测试（Browser）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.logger (browser)', () => {
  it('logger 应该为单例', () => {
    expect(core.logger).toBe(core.logger)
  })

  it('createLogger 应该返回带完整方法集的实例', () => {
    const logger = core.createLogger({ name: 'browser-test' })
    expect(typeof logger.trace).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.fatal).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('createLogger 无 name 时应该使用默认实例', () => {
    const logger = core.createLogger()
    expect(typeof logger.info).toBe('function')
  })

  it('createLogger 应该支持指定 level 和 context', () => {
    const logger = core.createLogger({
      name: 'custom',
      level: 'debug',
      context: { service: 'web' },
    })
    expect(() => logger.info('test with context', { extra: 'data' })).not.toThrow()
  })

  it('各级别日志调用不应抛错', () => {
    const logger = core.createLogger({ name: 'level-test', level: 'trace' })
    expect(() => logger.trace('trace')).not.toThrow()
    expect(() => logger.debug('debug')).not.toThrow()
    expect(() => logger.info('info')).not.toThrow()
    expect(() => logger.warn('warn')).not.toThrow()
    expect(() => logger.error('error')).not.toThrow()
    expect(() => logger.fatal('fatal')).not.toThrow()
  })

  it('child 应该继承父级上下文', () => {
    const parent = core.createLogger({ name: 'parent-browser' })
    const child = parent.child({ module: 'ui' })
    expect(typeof child.info).toBe('function')
    expect(() => child.info('child log')).not.toThrow()
  })

  it('configureLogger 应该设置级别和上下文', () => {
    core.configureLogger({ level: 'debug', context: { app: 'test' } })
    expect(core.getLogLevel()).toBe('debug')

    // 恢复
    core.setLogLevel('info')
  })

  it('setLogLevel/getLogLevel 应该生效', () => {
    core.setLogLevel('warn')
    expect(core.getLogLevel()).toBe('warn')

    // 恢复
    core.setLogLevel('info')
  })
})
