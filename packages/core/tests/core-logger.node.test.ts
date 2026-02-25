/**
 * =============================================================================
 * @h-ai/core - Logger 测试（Node.js）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.logger (node)', () => {
  it('logger 应该为单例', () => {
    expect(core.logger).toBe(core.logger)
  })

  it('createLogger 应该返回带完整方法集的实例', () => {
    const logger = core.createLogger({ name: 'test-complete' })
    expect(typeof logger.trace).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.fatal).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('createLogger 应该支持各级别日志调用', () => {
    const logger = core.createLogger({ name: 'level-test', level: 'trace' })
    // 验证各级别调用不抛错
    expect(() => logger.trace('trace msg')).not.toThrow()
    expect(() => logger.debug('debug msg')).not.toThrow()
    expect(() => logger.info('info msg')).not.toThrow()
    expect(() => logger.warn('warn msg')).not.toThrow()
    expect(() => logger.error('error msg')).not.toThrow()
    expect(() => logger.fatal('fatal msg')).not.toThrow()
  })

  it('createLogger 应该支持带上下文的日志', () => {
    const logger = core.createLogger({ name: 'ctx-test', context: { service: 'api' } })
    expect(() => logger.info('with context', { requestId: 'req-123' })).not.toThrow()
  })

  it('child 应该继承父级并携带额外上下文', () => {
    const parent = core.createLogger({ name: 'parent' })
    const child = parent.child({ module: 'auth' })
    expect(typeof child.info).toBe('function')

    const grandChild = child.child({ subModule: 'jwt' })
    expect(typeof grandChild.info).toBe('function')
    expect(() => grandChild.info('deep child')).not.toThrow()
  })

  it('createLogger 应该支持 json 格式', () => {
    const logger = core.createLogger({ name: 'json-test', format: 'json' })
    expect(() => logger.info('json format')).not.toThrow()
  })

  it('configureLogger/setLogLevel/getLogLevel 应该生效', () => {
    core.configureLogger({ level: 'warn' })
    expect(core.getLogLevel()).toBe('warn')

    core.setLogLevel('error')
    expect(core.getLogLevel()).toBe('error')

    // 恢复
    core.setLogLevel('info')
  })

  it('configureLogger 应该支持设置 format 和 context', () => {
    core.configureLogger({ format: 'json', context: { env: 'test' } })
    expect(core.getLogLevel()).toBe('info') // level 未变

    // 恢复
    core.configureLogger({ format: 'pretty' })
  })

  it('configureLogger 应该支持 redact 配置', () => {
    core.configureLogger({ redact: ['password', 'secret'] })
    const logger = core.createLogger({ name: 'redact-test' })
    expect(() => logger.info('test', { password: '123', data: 'ok' })).not.toThrow()

    // 恢复
    core.configureLogger({ redact: [] })
  })

  it('configureLogger 后 createLogger 应该使用新配置', () => {
    core.configureLogger({ level: 'debug' })
    expect(core.getLogLevel()).toBe('debug')

    // createLogger 以新全局配置为准
    const logger = core.createLogger({ name: 'new-config-test' })
    expect(typeof logger.debug).toBe('function')
    expect(() => logger.debug('should work at debug level')).not.toThrow()

    // 恢复
    core.configureLogger({ level: 'info' })
  })
})
