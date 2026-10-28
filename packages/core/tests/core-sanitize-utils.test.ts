/**
 * =============================================================================
 * @h-ai/core - 脱敏工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.sanitize', () => {
  it.each(['secretKey', 'secret_key', 'passwordHash', 'password_hash', 'passwd'])('统一隐藏实际配置凭据 %s，普通字段保持可诊断', (key) => {
    const input = { [key]: 'sensitive-sentinel', publicKey: 'public-material', passwordPolicy: 'strict', tokenCount: 12 }
    expect(core.sanitize.sanitizeSensitiveFields(input)).toEqual({ ...input, [key]: '[REDACTED]' })
    expect(core.sanitize.sanitizeUrl(`https://example.test/?${key}=sensitive-sentinel&limit=10`)).not.toContain('sensitive-sentinel')
    expect(core.sanitize.sanitizeText(`${key}=sensitive-sentinel action=connect`)).toBe('[REDACTED] action=connect')
    expect(input[key]).toBe('sensitive-sentinel')
  })

  it('日志观察者同样隐藏嵌套支付密钥与异常中的密码摘要', () => {
    const records: unknown[] = []
    const stop = core.logger.observe(record => records.push(record))
    try {
      core.logger.error('Payment configuration rejected', { stripe: { secretKey: 'stripe-sentinel' }, error: new Error('passwordHash=hash-sentinel invalid') })
    }
    finally { stop() }
    expect(records).toHaveLength(1)
    const output = JSON.stringify(records)
    expect(output).not.toContain('stripe-sentinel')
    expect(output).not.toContain('hash-sentinel')
    expect(output).toContain('Payment configuration rejected')
  })

  it.each(['verificationCode', 'verification_code', 'verifyCode', 'otpCode', 'totpCode', 'smsCode', 'emailCode', 'captcha', 'captchaCode', 'oneTimeCode', 'twoFactorCode', 'reauthentication', 'x-hai-reauthentication', 'ticket'])('默认脱敏鉴别凭据字段 %s，保留普通业务code', (key) => {
    expect(core.sanitize.sanitizeSensitiveFields({ nested: { [key]: 'credential-sentinel', code: 'ORDER_ACCEPTED' } })).toEqual({ nested: { [key]: '[REDACTED]', code: 'ORDER_ACCEPTED' } })
    expect(core.sanitize.sanitizeUrl(`https://example.test/verify?${key}=credential-sentinel&code=ORDER_ACCEPTED`)).not.toContain('credential-sentinel')
  })

  it('uRL 参数按解码名称脱敏并保留重复项和普通参数', () => {
    const value = core.sanitize.sanitizeUrl('https://u:p@example.com/a?to%6ben=one&token=two&apiKey=three&limit=10#access_token=four&state=ok')
    expect(value).toBe('https://[REDACTED]:[REDACTED]@example.com/a?token=[REDACTED]&token=[REDACTED]&apiKey=[REDACTED]&limit=10#access_token=[REDACTED]&state=ok')
    expect(core.sanitize.sanitizeSensitiveFields({ endpoint: 'https://example.com/?API_KEY=value' }).endpoint)
      .toBe('https://example.com/?API_KEY=[REDACTED]')
  })

  it('uRL 自定义 matcher 与对象一致，非法地址不回显原值', () => {
    expect(core.sanitize.sanitizeUrl('https://example.com/?mail=a&limit=10#section', { matcher: ['mail'], replacement: '***' }))
      .toBe('https://example.com/?mail=***&limit=10#section')
    expect(core.sanitize.sanitizeUrl('https://user:secret@[')).toBe('(invalid url)')
  })

  it('sanitizeSensitiveFields 默认仅脱敏凭证类字段', () => {
    const input = {
      email: 'test@example.com',
      phone: '13800000000',
      password: 'secret-pass',
      profile: {
        token: 'jwt-token',
        nickname: 'Alice',
      },
    }

    expect(core.sanitize.sanitizeSensitiveFields(input)).toEqual({
      email: 'test@example.com',
      phone: '13800000000',
      password: '[REDACTED]',
      profile: {
        token: '[REDACTED]',
        nickname: 'Alice',
      },
    })
  })

  it('sanitizeSensitiveFields 应处理 URL 字段内嵌凭证与扩展敏感键名', () => {
    const input = {
      baseUrl: 'https://user:pass@example.com/api/v1',
      ldap: {
        url: 'ldap://admin:secret@ldap.example.com:389',
        bindPassword: 'bind-secret',
      },
      smtp: {
        pass: 'smtp-secret',
      },
      payment: {
        apiV3Key: 'wechat-secret',
        privateKey: 'private-value',
      },
    }

    expect(core.sanitize.sanitizeSensitiveFields(input)).toEqual({
      baseUrl: 'https://[REDACTED]:[REDACTED]@example.com/api/v1',
      ldap: {
        url: 'ldap://[REDACTED]:[REDACTED]@ldap.example.com:389',
        bindPassword: '[REDACTED]',
      },
      smtp: {
        pass: '[REDACTED]',
      },
      payment: {
        apiV3Key: '[REDACTED]',
        privateKey: '[REDACTED]',
      },
    })
  })

  it('sanitizeSensitiveFields 应支持模块自定义 matcher', () => {
    const input = {
      email: 'test@example.com',
      phone: '13800000000',
      profile: {
        nickname: 'Alice',
      },
    }

    expect(core.sanitize.sanitizeSensitiveFields(input, {
      matcher: /email|phone/i,
      replacement: '***',
    })).toEqual({
      email: '***',
      phone: '***',
      profile: {
        nickname: 'Alice',
      },
    })
  })

  it('sanitizeSensitiveFields 的数组 matcher 应兼容 camelCase 与 snake_case', () => {
    expect(core.sanitize.sanitizeSensitiveFields({ apiKey: 'test-key' }, {
      matcher: ['api_key'],
    })).toEqual({ apiKey: '[REDACTED]' })
  })

  it('sanitizeSensitiveFields 默认规则不应误伤 token/password 类配置项名称', () => {
    const input = {
      llm: {
        apiKey: 'sk-test-key',
        maxTokens: 2048,
        tokenRatio: 0.25,
      },
      password: {
        minLength: 8,
      },
      session: {
        refreshTokenMaxAge: 604800,
      },
      otp: {
        expiresIn: 300,
      },
      refreshToken: 'refresh-token',
    }

    expect(core.sanitize.sanitizeSensitiveFields(input)).toEqual({
      llm: {
        apiKey: '[REDACTED]',
        maxTokens: 2048,
        tokenRatio: 0.25,
      },
      password: {
        minLength: 8,
      },
      session: {
        refreshTokenMaxAge: 604800,
      },
      otp: {
        expiresIn: 300,
      },
      refreshToken: '[REDACTED]',
    })
  })

  it('sanitizeSensitiveFields 应保留循环引用结构', () => {
    const input: {
      token: string
      nested: { password: string }
      self?: unknown
    } = {
      token: 'jwt-token',
      nested: { password: 'secret-pass' },
    }

    input.self = input

    const sanitized = core.sanitize.sanitizeSensitiveFields(input)

    expect(sanitized).not.toBe(input)
    expect(sanitized.self).toBe(sanitized)
    expect(sanitized.token).toBe('[REDACTED]')
    expect(sanitized.nested.password).toBe('[REDACTED]')
  })

  it('空对象操作应正常工作', () => {
    expect(core.sanitize.sanitizeSensitiveFields({})).toEqual({})
  })

  it('原生异常保留诊断、cause 和枚举上下文，字段与 URL 脱敏不修改原值', () => {
    const cause = Object.assign(new TypeError('Connection refused'), { endpoint: 'https://cause-user:cause-pass@example.com/?token=cause-token' })
    const failure = Object.assign(new AggregateError([cause], 'Startup failed', { cause }), {
      password: 'own-password',
      token: 'own-token',
      authorization: 'Bearer own-authorization',
      privateKey: 'own-private-key',
      apiKey: 'own-api-key',
      context: { requestId: 'request-1', apiV3Key: 'nested-key', endpoint: 'https://user:pass@example.com/?token=query-token#access_token=fragment-token' },
    })
    const descriptors = Object.getOwnPropertyDescriptors(failure)
    const causeDescriptors = Object.getOwnPropertyDescriptors(cause)
    const context = failure.context
    const sanitized = core.sanitize.sanitizeSensitiveValue(failure, null)
    expect(sanitized).toMatchObject({
      name: 'AggregateError',
      message: 'Startup failed',
      stack: failure.stack,
      cause: { name: 'TypeError', message: 'Connection refused', stack: cause.stack, endpoint: 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]' },
      errors: [{ name: 'TypeError', message: 'Connection refused' }],
      password: '[REDACTED]',
      token: '[REDACTED]',
      authorization: '[REDACTED]',
      privateKey: '[REDACTED]',
      apiKey: '[REDACTED]',
      context: { requestId: 'request-1', apiV3Key: '[REDACTED]', endpoint: 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]#access_token=[REDACTED]' },
    })
    expect(sanitized).not.toBe(failure)
    expect(() => JSON.stringify({ error: sanitized })).not.toThrow()
    expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors)
    expect(Object.getOwnPropertyDescriptors(cause)).toEqual(causeDescriptors)
    expect(failure.context).toBe(context)
    expect(failure.context.apiV3Key).toBe('nested-key')
    expect(cause.endpoint).toContain('cause-token')
  })

  it('异常自因、cause 环、aggregate 环和混合普通对象祖先环都可序列化', () => {
    const self = new Error('Self cause')
    self.cause = self
    const first = new Error('First cause')
    const second = new Error('Second cause', { cause: first })
    first.cause = second
    const aggregate = new AggregateError([], 'Aggregate self')
    aggregate.errors.push(aggregate)
    const mixed = new Error('Mixed cause')
    const mixedAggregate = new AggregateError([mixed], 'Mixed aggregate')
    mixed.cause = mixedAggregate
    const nested: { token: string, self?: unknown, error?: Error } = { token: 'nested-token' }
    nested.self = nested
    const nestedError = Object.assign(new Error('Nested plain cycle'), { context: nested })
    const ancestor: { error?: Error } = {}
    const ancestorError = Object.assign(new Error('Plain ancestor'), { context: ancestor })
    ancestor.error = ancestorError
    const cases: Array<[string, unknown]> = [
      ['self', self],
      ['cause chain', first],
      ['aggregate', aggregate],
      ['mixed aggregate/cause', mixed],
      ['error-owned plain cycle', nestedError],
      ['plain ancestor', ancestor],
      ['repeated reference', [self, self]],
    ]
    for (const [name, value] of cases) {
      const sanitized = core.sanitize.sanitizeSensitiveValue(value, null)
      const serialized = JSON.stringify({ value: sanitized })
      expect(serialized, name).toContain('[Circular]')
      expect(() => JSON.parse(serialized), name).not.toThrow()
      expect(serialized, name).not.toContain('nested-token')
    }
    expect(self.cause).toBe(self)
    expect(aggregate.errors[0]).toBe(aggregate)
    expect(nested.self).toBe(nested)
    expect(ancestor.error).toBe(ancestorError)
    // 无 Error 的普通对象循环仍按公开契约保留，不在本修复中改成序列化占位符。
    const plain: { self?: unknown } = {}
    plain.self = plain
    const plainCopy = core.sanitize.sanitizeSensitiveFields(plain)
    expect(plainCopy.self).toBe(plainCopy)
  })

  it('异常诊断限定深度且忽略危险原型键与可执行 toJSON', () => {
    const failure = Object.assign(new Error('Deep cause'), {
      count: 123n,
      toJSON: () => {
        throw new Error('Must not execute')
      },
    })
    for (const key of ['__proto__', 'constructor', 'prototype'])
      Object.defineProperty(failure, key, { value: `${key}-private-value`, enumerable: true })
    let current: Error = failure
    for (let index = 0; index < 64; index++) {
      const next = new Error(`Cause ${index}`)
      current.cause = next
      current = next
    }
    const sanitized = core.sanitize.sanitizeSensitiveValue(failure, null)
    expect(sanitized).toMatchObject({ name: 'Error', message: 'Deep cause', count: '123' })
    const serialized = JSON.stringify({ error: sanitized })
    expect(serialized).toContain('[MaxDepth]')
    expect(serialized).not.toContain('__proto__-private-value')
    expect(serialized).not.toContain('constructor-private-value')
    expect(serialized).not.toContain('prototype-private-value')
    expect(failure.count).toBe(123n)
    expect(Object.hasOwn(failure, '__proto__')).toBe(true)
    expect(core.sanitize.sanitizeSensitiveValue(new Error('Private message'), null, { matcher: ['message'], replacement: '[HIDDEN]' }))
      .toMatchObject({ message: '[HIDDEN]' })
  })

  it('异常子图的自定义替换值同样可序列化，普通对象替换语义不变', () => {
    const failure = Object.assign(new Error('Sensitive context'), { password: 'own-password' })
    const numeric = core.sanitize.sanitizeSensitiveValue(failure, null, { replacement: 123n })
    expect(numeric).toMatchObject({ password: '123' })
    expect(() => JSON.stringify({ error: numeric })).not.toThrow()
    const replacement: { self?: unknown } = {}
    replacement.self = replacement
    const cyclic = core.sanitize.sanitizeSensitiveValue(failure, null, { replacement })
    expect(cyclic).toMatchObject({ password: { self: '[Circular]' } })
    expect(() => JSON.stringify({ error: cyclic })).not.toThrow()
    expect(replacement.self).toBe(replacement)
    expect(failure.password).toBe('own-password')
    const plain = core.sanitize.sanitizeSensitiveFields({ password: 'own-password' }, { replacement })
    expect(plain.password).toBe(replacement)
  })
})
