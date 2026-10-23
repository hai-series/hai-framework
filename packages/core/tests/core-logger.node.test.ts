/**
 * =============================================================================
 * @h-ai/core - Logger 测试（Node.js）
 * =============================================================================
 */

import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'

describe('core.logger (node)', () => {
  it('logger 应该为单例', () => {
    expect(core.logger).toBe(core.logger)
  })

  it('createLogger 应该返回带完整方法集的实例', () => {
    const logger = core.logger.create({ name: 'test-complete' })
    expect(typeof logger.trace).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.fatal).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('createLogger 应该支持各级别日志调用', () => {
    const logger = core.logger.create({ name: 'level-test', level: 'trace' })
    // 验证各级别调用不抛错
    expect(() => logger.trace('trace msg')).not.toThrow()
    expect(() => logger.debug('debug msg')).not.toThrow()
    expect(() => logger.info('info msg')).not.toThrow()
    expect(() => logger.warn('warn msg')).not.toThrow()
    expect(() => logger.error('error msg')).not.toThrow()
    expect(() => logger.fatal('fatal msg')).not.toThrow()
  })

  it('createLogger 应该支持带上下文的日志', () => {
    const logger = core.logger.create({ name: 'ctx-test', context: { service: 'api' } })
    expect(() => logger.info('with context', { requestId: 'req-123' })).not.toThrow()
  })

  it('child 应该继承父级并携带额外上下文', () => {
    const parent = core.logger.create({ name: 'parent' })
    const child = parent.child({ module: 'auth' })
    expect(typeof child.info).toBe('function')

    const grandChild = child.child({ subModule: 'jwt' })
    expect(typeof grandChild.info).toBe('function')
    expect(() => grandChild.info('deep child')).not.toThrow()
  })

  it('createLogger 应该支持 json 格式', () => {
    const logger = core.logger.create({ name: 'json-test', format: 'json' })
    expect(() => logger.info('json format')).not.toThrow()
  })

  it('configureLogger/setLogLevel/getLogLevel 应该生效', () => {
    core.logger.configure({ level: 'warn' })
    expect(core.logger.getLevel()).toBe('warn')

    core.logger.setLevel('error')
    expect(core.logger.getLevel()).toBe('error')

    // 恢复
    core.logger.setLevel('info')
  })

  it('configureLogger 应该支持设置 format 和 context', () => {
    core.logger.configure({ format: 'json', context: { env: 'test' } })
    expect(core.logger.getLevel()).toBe('info') // level 未变

    // 恢复
    core.logger.configure({ format: 'pretty' })
  })

  it('configureLogger 应该支持 redact 配置', () => {
    core.logger.configure({ redact: ['password', 'secret'] })
    const logger = core.logger.create({ name: 'redact-test' })
    expect(() => logger.info('test', { password: '123', data: 'ok' })).not.toThrow()

    // 恢复
    core.logger.configure({ redact: [] })
  })

  it('logger 默认应脱敏敏感字段与 URL 凭证', async () => {
    const writes: string[] = []
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write)

    try {
      const logger = core.logger
        .create({ name: 'default-redact-test', format: 'json' })
        .child({
          authorization: 'Bearer secret-token',
          baseUrl: 'https://user:pass@example.com/api/v1',
        })

      logger.info('sensitive payload', {
        nested: {
          apiV3Key: 'wechat-secret',
          privateKey: 'private-value',
        },
        email: 'test@example.com',
      })

      await new Promise(resolve => setTimeout(resolve, 0))
    }
    finally {
      writeSpy.mockRestore()
    }

    const output = writes.join('')
    expect(output).toContain('"authorization":"[REDACTED]"')
    expect(output).toContain('"baseUrl":"https://[REDACTED]:[REDACTED]@example.com/api/v1"')
    expect(output).toContain('"apiV3Key":"[REDACTED]"')
    expect(output).toContain('"privateKey":"[REDACTED]"')
    expect(output).toContain('"email":"test@example.com"')
  })

  it('configureLogger 后 createLogger 应该使用新配置', () => {
    core.logger.configure({ level: 'debug' })
    expect(core.logger.getLevel()).toBe('debug')

    // createLogger 以新全局配置为准
    const logger = core.logger.create({ name: 'new-config-test' })
    expect(typeof logger.debug).toBe('function')
    expect(() => logger.debug('should work at debug level')).not.toThrow()

    // 恢复
    core.logger.configure({ level: 'info' })
  })

  it.each([false, true])('node 实际 JSON 输出保留异常并应用默认/路径脱敏：redact=%s', async (redactDiagnostic) => {
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
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write)
    try {
      core.logger.create({ name: 'node-error-diagnostic', format: 'json' }).error('Error diagnostic fixture', { error })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    finally {
      writeSpy.mockRestore()
      core.logger.configure({ level: 'info', format: 'pretty', redact: [] })
    }
    const output = writes.join('')
    const line = output.split('\n').find(value => value.includes('"msg":"Error diagnostic fixture"'))
    expect(line).toBeDefined()
    if (!line)
      return
    const record: unknown = JSON.parse(line)
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
