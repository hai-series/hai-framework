/**
 * =============================================================================
 * @h-ai/core - Logger 测试（Node.js）
 * =============================================================================
 */

import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'
import { createSerializationFixture } from './fixtures/serialization.js'

describe('core.logger (node)', () => {
  it('日志 JSON 上下文转为结构后再脱敏，stdout 与观察记录保持一致', async () => {
    const output: string[] = []
    const observed: Readonly<Record<string, unknown>>[] = []
    const detail = JSON.stringify({
      path: ['ldap', 'url'],
      password: 'encoded-secret',
      customerId: 'private-customer',
    })
    const input = {
      detail,
      items: '[{"field":"ldap.bindDn","token":"array-secret"}]',
      nested: { detail },
      error: new Error(detail, {
        cause: { detail },
      }),
      invalid: '{broken}',
      scalar: '42',
      text: 'ordinary text',
    }
    core.logger.configure({
      level: 'info',
      format: 'json',
      redact: [
        'detail.customerId',
        'nested.detail.customerId',
        'error.message.customerId',
        'error.cause.detail.customerId',
        'error.stack',
      ],
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string'
        ? chunk
        : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write)
    const stop = core.logger.observe(record => observed.push(record.context))
    try {
      core.logger.create({ name: 'json-context', format: 'json' }).info('JSON context', input)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    finally {
      stop()
      write.mockRestore()
      core.logger.configure({ format: 'pretty', redact: [] })
    }
    const expected = {
      detail: {
        path: ['ldap', 'url'],
        password: '[REDACTED]',
        customerId: '[REDACTED]',
      },
      items: [
        { field: 'ldap.bindDn', token: '[REDACTED]' },
      ],
      nested: {
        detail: {
          path: ['ldap', 'url'],
          password: '[REDACTED]',
          customerId: '[REDACTED]',
        },
      },
      invalid: '{broken}',
      scalar: '42',
      text: 'ordinary text',
    }
    expect(observed).toHaveLength(1)
    const expectedContext = {
      ...expected,
      error: {
        name: 'Error',
        message: expected.detail,
        cause: { detail: expected.detail },
        stack: '[REDACTED]',
      },
    }
    expect(observed[0]).toMatchObject(expectedContext)
    expect(JSON.parse(output.join('').trim())).toMatchObject(expectedContext)
    expect(input.detail).toBe(detail)
    expect(input.error.message).toBe(detail)
    expect(input.error.cause).toEqual({ detail })
    expect(output.join('')).not.toMatch(/encoded-secret|array-secret|private-customer/)
  })

  it('过大或过深的 JSON 上下文保留为文本，消息本身不转换', () => {
    const records: { message: string, context: Readonly<Record<string, unknown>> }[] = []
    const stop = core.logger.observe(record => records.push(record))
    const large = JSON.stringify({
      text: 'x'.repeat(65_536),
    })
    const deep = `${'['.repeat(40)}0${']'.repeat(40)}`
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      core.logger.create({ name: 'bounded-json-context', format: 'json' }).info('{"event":"failed"}', { large, deep })
    }
    finally {
      stop()
      write.mockRestore()
    }
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      message: '{"event":"failed"}',
      context: { large, deep },
    })
  })

  it('异常 JSON 的四重编码上限按各路径独立计算，超大或过深文本不展开', () => {
    const encoded = (layers: number): string => {
      let text = JSON.stringify({ visible: 'ready' })
      for (let depth = 1; depth < layers; depth++)
        text = JSON.stringify({ next: text })
      return text
    }
    const large = JSON.stringify({
      text: 'x'.repeat(65_536),
    })
    const deep = `${'['.repeat(40)}0${']'.repeat(40)}`
    const error = new Error(JSON.stringify({
      left: encoded(3),
      right: encoded(3),
      over: encoded(4),
    }), {
      cause: { large, deep },
    })
    const records: Readonly<Record<string, unknown>>[] = []
    const stop = core.logger.observe(record => records.push(record.context))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    core.logger.configure({
      redact: ['error.stack'],
    })
    try {
      core.logger.create({ name: 'bounded-error-json', format: 'json' }).info('Bounded error JSON', { error })
    }
    finally {
      stop()
      write.mockRestore()
      core.logger.configure({ redact: [] })
    }
    const expanded = {
      next: {
        next: { visible: 'ready' },
      },
    }
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      error: {
        message: {
          left: expanded,
          right: expanded,
          over: {
            next: {
              next: {
                next: encoded(1),
              },
            },
          },
        },
        cause: { large, deep },
      },
    })
  })

  it('序列化回归：stdout 和观察记录均不能被自定义 toJSON 带出凭据', async () => {
    const { input, serialize, readAccessor } = createSerializationFixture()
    const output: string[] = []
    const observed: string[] = []
    core.logger.configure({
      level: 'info',
      format: 'json',
      redact: ['payload.plain.customerId'],
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string'
        ? chunk
        : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write)
    const stop = core.logger.observe(record => observed.push(JSON.stringify(record)))
    try {
      core.logger.create({ name: 'serialization-regression', format: 'json' }).info('Serialization fixture', { payload: input })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    finally {
      stop()
      write.mockRestore()
      core.logger.configure({ format: 'pretty', redact: [] })
    }
    expect(observed).toHaveLength(1)
    for (const value of [
      output.join(''),
      observed.join(''),
    ]) {
      expect(value).toContain('sdk-visible')
      expect(value).toContain('2026-01-01T00:00:00.000Z')
      for (const secret of [
        'serialized-only-secret',
        'class-only-secret',
        'plain-only-secret',
        'customer-private',
      ])
        expect(value).not.toContain(secret)
    }
    expect(serialize).not.toHaveBeenCalled()
    expect(readAccessor).not.toHaveBeenCalled()
    expect(input.sdk.token).toBe('class-only-secret')
  })

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
    const logger = core.logger.create({
      name: 'ctx-test',
      context: { service: 'api' },
    })
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
    core.logger.configure({
      format: 'json',
      context: { env: 'test' },
    })
    expect(core.logger.getLevel()).toBe('info') // level 未变

    // 恢复
    core.logger.configure({ format: 'pretty' })
  })

  it('configureLogger 应该支持 redact 配置', () => {
    core.logger.configure({
      redact: ['password', 'secret'],
    })
    const logger = core.logger.create({ name: 'redact-test' })
    expect(() => logger.info('test', { password: '123', data: 'ok' })).not.toThrow()

    // 恢复
    core.logger.configure({ redact: [] })
  })

  it('logger 默认应脱敏敏感字段与 URL 凭证', async () => {
    const writes: string[] = []
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string'
        ? chunk
        : new TextDecoder().decode(chunk))
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
    const redact = redactDiagnostic
      ? [
          'error.message',
          'error.stack',
          'error.cause.message',
          'error.errors[0].message',
          'error.context.customerId',
        ]
      : []

    const writes: string[] = []
    core.logger.configure({ level: 'info', format: 'json', redact })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string'
        ? chunk
        : new TextDecoder().decode(chunk))
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
        cause: {
          name: 'Error',
          message: redactDiagnostic ? '[REDACTED]' : 'Connection lost',
          stack: cause.stack,
          privateKey: '[REDACTED]',
          cause: '[Circular]',
        },
        errors: [
          {
            name: 'TypeError',
            message: redactDiagnostic ? '[REDACTED]' : 'Provider rejected',
            stack: child.stack,
            endpoint: 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]',
          },
        ],
        password: '[REDACTED]',
        token: '[REDACTED]',
        authorization: '[REDACTED]',
        apiKey: '[REDACTED]',
        context: {
          customerId: redactDiagnostic ? '[REDACTED]' : 'customer-private',
          requestId: 'request-1',
          endpoint: 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]#access_token=[REDACTED]',
        },
      },
    })
    for (const secret of [
      'own-password',
      'own-token',
      'own-authorization',
      'own-api-key',
      'cause-private-key',
      'child-user',
      'child-pass',
      'child-token',
      'query-token',
      'fragment-token',
    ])
      expect(output).not.toContain(secret)
    if (redactDiagnostic)
      expect(output).not.toContain('customer-private')
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(descriptors)
    expect(error.message).toBe('Startup failed')
    expect(error.context.customerId).toBe('customer-private')
    expect(cause.cause).toBe(error)
  })
})
