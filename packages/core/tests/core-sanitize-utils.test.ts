/**
 * =============================================================================
 * @h-ai/core - 脱敏工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.sanitize', () => {
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
})
