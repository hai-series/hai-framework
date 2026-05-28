/**
 * =============================================================================
 * @h-ai/core - 对象工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.object', () => {
  it('deepClone 应该返回不同引用', () => {
    const obj = { a: 1, b: { c: 2 } }
    const cloned = core.object.deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.b).not.toBe(obj.b)
  })

  it('deepMerge 应该合并嵌套对象', () => {
    const merged = core.object.deepMerge(
      { a: 1, b: { c: 1, d: 2 } },
      { b: { d: 3 }, e: 4 },
    )
    expect(merged).toEqual({ a: 1, b: { c: 1, d: 3 }, e: 4 })
  })

  it('deepMerge 数组应被直接覆盖而非合并', () => {
    const merged = core.object.deepMerge(
      { items: [1, 2, 3] },
      { items: [4, 5] },
    )
    expect(merged).toEqual({ items: [4, 5] })
  })

  it('deepMerge 应该支持多个对象合并', () => {
    const merged = core.object.deepMerge(
      { a: 1 },
      { b: 2 },
      { c: 3 },
    )
    expect(merged).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('deepMerge 非对象值应被直接覆盖', () => {
    const merged = core.object.deepMerge(
      { a: { nested: true } },
      { a: 'string' as unknown as Record<string, unknown> },
    )
    expect(merged).toEqual({ a: 'string' })
  })

  it('deepMerge 应该忽略 __proto__ 和 constructor 键防止原型污染', () => {
    // 模拟 JSON.parse 产生的含 __proto__ 的对象
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}')
    const merged = core.object.deepMerge({}, malicious)
    expect(merged.safe).toBe(1)
    // __proto__ 被忽略，不会污染原型
    expect((merged as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('pick 应该选择指定键', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(core.object.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('pick 不存在的键应被忽略', () => {
    const obj = { a: 1, b: 2 }
    const result = core.object.pick(obj, ['a', 'nonexistent' as keyof typeof obj])
    expect(result).toEqual({ a: 1 })
  })

  it('omit 应该排除指定键', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(core.object.omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })

  it('keys/values/entries 应该返回可预测结果', () => {
    const obj = { a: 1, b: 2 }
    expect(core.object.keys(obj)).toEqual(['a', 'b'])
    expect(core.object.values(obj)).toEqual([1, 2])
    expect(core.object.entries(obj)).toEqual([['a', 1], ['b', 2]])
  })

  it('fromEntries 应该构建对象', () => {
    const entries: Array<[string, number]> = [['a', 1], ['b', 2]]
    expect(core.object.fromEntries(entries)).toEqual({ a: 1, b: 2 })
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

    expect(core.object.sanitizeSensitiveFields(input)).toEqual({
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

    expect(core.object.sanitizeSensitiveFields(input)).toEqual({
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

    expect(core.object.sanitizeSensitiveFields(input, {
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
    expect(core.object.sanitizeSensitiveFields({ apiKey: 'test-key' }, {
      matcher: ['api_key'],
    })).toEqual({ apiKey: '[REDACTED]' })
  })

  it('空对象操作应正常工作', () => {
    expect(core.object.deepClone({})).toEqual({})
    expect(core.object.deepMerge({}, {})).toEqual({})
    expect(core.object.pick({} as Record<string, unknown>, [])).toEqual({})
    expect(core.object.omit({} as Record<string, unknown>, [])).toEqual({})
    expect(core.object.keys({})).toEqual([])
    expect(core.object.values({})).toEqual([])
    expect(core.object.entries({})).toEqual([])
    expect(core.object.sanitizeSensitiveFields({})).toEqual({})
  })
})
