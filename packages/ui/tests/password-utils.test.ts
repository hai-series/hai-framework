/**
 * =============================================================================
 * @h-ai/ui - 密码工具测试
 * =============================================================================
 * 覆盖 password-utils.ts 的 normalizePassword 和 arePasswordsEqual
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'

import { arePasswordsEqual, normalizePassword } from '../src/lib/components/scenes/iam/password-utils.js'

// =============================================================================
// normalizePassword
// =============================================================================

describe('normalizePassword - 密码规范化', () => {
  it('全角字母应转为半角', () => {
    expect(normalizePassword('ＡＢＣ１２３')).toBe('ABC123')
  })

  it('普通 ASCII 字符不变', () => {
    expect(normalizePassword('Password123!')).toBe('Password123!')
  })

  it('空字符串应返回空字符串', () => {
    expect(normalizePassword('')).toBe('')
  })

  it('纯空格不应被移除', () => {
    expect(normalizePassword('   ')).toBe('   ')
  })

  it('unicode 组合字符应被规范化', () => {
    // é 的两种表示: U+00E9 (单个) 与 U+0065 U+0301 (组合)
    // NFKC 会统一为单个字符
    const combined = '\u0065\u0301' // e + combining acute
    const precomposed = '\u00E9' // é
    expect(normalizePassword(combined)).toBe(normalizePassword(precomposed))
  })

  it('罗马数字兼容字符应被规范化', () => {
    // Ⅲ (U+2162) → III (NFKC)
    expect(normalizePassword('\u2162')).toBe('III')
  })

  it('上标数字应被规范化', () => {
    // ² (U+00B2) → 2 (NFKC)
    expect(normalizePassword('\u00B2')).toBe('2')
  })

  it('包含特殊符号的密码应保留', () => {
    expect(normalizePassword('p@$$w0rd!#%^&*()')).toBe('p@$$w0rd!#%^&*()')
  })

  it('全角符号应转为半角', () => {
    // ！ (U+FF01) → ! (NFKC)
    expect(normalizePassword('！')).toBe('!')
  })

  it('中日韩字符应保持不变', () => {
    expect(normalizePassword('密码测试')).toBe('密码测试')
  })

  it('emoji 应保持不变', () => {
    expect(normalizePassword('🔒password🔑')).toBe('🔒password🔑')
  })
})

// =============================================================================
// arePasswordsEqual
// =============================================================================

describe('arePasswordsEqual - 密码一致性比较', () => {
  it('相同普通密码应返回 true', () => {
    expect(arePasswordsEqual('Password123', 'Password123')).toBe(true)
  })

  it('全角与半角混合应视为相等', () => {
    expect(arePasswordsEqual('Ｐａｓｓｗｏｒｄ１２３', 'Password123')).toBe(true)
  })

  it('不同密码应返回 false', () => {
    expect(arePasswordsEqual('Password123', 'Password456')).toBe(false)
  })

  it('两个空字符串应返回 true', () => {
    expect(arePasswordsEqual('', '')).toBe(true)
  })

  it('空字符串与非空应返回 false', () => {
    expect(arePasswordsEqual('', 'password')).toBe(false)
    expect(arePasswordsEqual('password', '')).toBe(false)
  })

  it('大小写不同应返回 false', () => {
    expect(arePasswordsEqual('Password', 'password')).toBe(false)
  })

  it('unicode 组合字符与预组合应视为相等', () => {
    const combined = 'caf\u0065\u0301' // café (组合)
    const precomposed = 'caf\u00E9' // café (预组合)
    expect(arePasswordsEqual(combined, precomposed)).toBe(true)
  })

  it('前后空格不应被忽略', () => {
    expect(arePasswordsEqual(' password', 'password')).toBe(false)
    expect(arePasswordsEqual('password ', 'password')).toBe(false)
  })
})
