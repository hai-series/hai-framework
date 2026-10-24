/**
 * =============================================================================
 * @h-ai/core - Logger 测试（Browser）
 * =============================================================================
 */

import log from 'loglevel'
import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.logger (browser)', () => {
  it('observes filtered, redacted browser records and releases the listener', () => {
    const records: { level: string, context: Readonly<Record<string, unknown>> }[] = []
    const logger = core.logger.create({ name: 'browser-observer', level: 'warn' })
    const stop = core.logger.observe(record => records.push(record))
    try {
      logger.debug('Not collected')
      logger.error('Browser error', { authorization: 'Bearer private-token' })
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ level: 'error', context: { authorization: '[REDACTED]' } })
      stop()
      logger.error('After stop')
      expect(records).toHaveLength(1)
    }
    finally { stop() }
  })
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

  it.each([false, true])('browser 实际 JSON 输出保留异常并应用默认/路径脱敏：redact=%s', (redactDiagnostic) => {
    const cause = Object.assign(new Error('Connection lost'), { privateKey: 'cause-private-key' })
    const child = Object.assign(new TypeError('Provider rejected'), { endpoint: 'https://child-user:child-pass@example.com/?token=child-token' })
    const error = Object.assign(new AggregateError([child], 'Startup failed', { cause }), {
      password: 'own-password',
      token: 'own-token',
      authorization: 'Bearer own-authorization',
      apiKey: 'own-api-key',
      context: { customerId: 'customer-private', requestId: 'request-1', endpoint: 'https://user:pass@example.com/?token=query-token#access_token=fragment-token' },
    })
    cause.cause = error
    const descriptors = Object.getOwnPropertyDescriptors(error)
    const redact = redactDiagnostic ? ['error.message', 'error.stack', 'error.cause.message', 'error.errors[0].message', 'error.context.customerId'] : []

    const writes: string[] = []
    core.logger.configure({ level: 'info', format: 'json', redact })
    const logger = core.logger.create({ name: 'browser-error-diagnostic', format: 'json' })
    const rawLogger = log.getLogger('browser-error-diagnostic')
    const originalError = rawLogger.error
    rawLogger.error = (...args: unknown[]) => writes.push(args.map(value => String(value)).join(' '))
    try {
      logger.error('Error diagnostic fixture', { error })
    }
    finally {
      rawLogger.error = originalError
      core.logger.configure({ level: 'info', format: 'pretty', redact: [] })
    }
    expect(writes).toHaveLength(1)
    const output = writes[0] ?? ''
    const record: unknown = JSON.parse(output)
    expect(record).toMatchObject({
      level: 'error',
      msg: 'Error diagnostic fixture',
      error: {
        name: 'AggregateError',
        message: redactDiagnostic ? '[REDACTED]' : 'Startup failed',
        stack: redactDiagnostic ? '[REDACTED]' : error.stack,
        cause: { name: 'Error', message: redactDiagnostic ? '[REDACTED]' : 'Connection lost', stack: cause.stack, privateKey: '[REDACTED]', cause: '[Circular]' },
        errors: [{ name: 'TypeError', message: redactDiagnostic ? '[REDACTED]' : 'Provider rejected', stack: child.stack, endpoint: 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]' }],
        password: '[REDACTED]',
        token: '[REDACTED]',
        authorization: '[REDACTED]',
        apiKey: '[REDACTED]',
        context: { customerId: redactDiagnostic ? '[REDACTED]' : 'customer-private', requestId: 'request-1', endpoint: 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]#access_token=[REDACTED]' },
      },
    })
    for (const secret of ['own-password', 'own-token', 'own-authorization', 'own-api-key', 'cause-private-key', 'child-user', 'child-pass', 'child-token', 'query-token', 'fragment-token'])
      expect(output).not.toContain(secret)
    if (redactDiagnostic)
      expect(output).not.toContain('customer-private')
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(descriptors)
    expect(error.message).toBe('Startup failed')
    expect(error.context.customerId).toBe('customer-private')
    expect(cause.cause).toBe(error)
  })
})
