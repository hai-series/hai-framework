/**
 * =============================================================================
 * @h-ai/ui - 密码工具测试
 * =============================================================================
 * 覆盖与服务端一致的密码比较及公开策略提示
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'

import { arePasswordsEqual, passwordPolicyError, passwordPolicyHint } from '../src/lib/components/scenes/iam/password-utils.js'

describe('可配置密码类别', () => {
  const policy = { minLength: 8, maxLength: 128, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecialChar: false, minCharacterClasses: 3 }
  it('允许任意三类组合并拒绝只有两类的密码', () => {
    expect(passwordPolicyError('Password1', policy)).toBe('')
    expect(passwordPolicyError('password1!', policy)).toBe('')
    expect(passwordPolicyError('password12', policy)).not.toBe('')
    expect(passwordPolicyHint(policy)).toContain('3')
    expect(passwordPolicyError('password12', { ...policy, minCharacterClasses: 0 })).toBe('')
  })
})

// =============================================================================
// arePasswordsEqual
// =============================================================================

describe('arePasswordsEqual - 密码一致性比较', () => {
  it('相同普通密码应返回 true', () => {
    expect(arePasswordsEqual('Password123', 'Password123')).toBe(true)
  })

  it('全角与半角是不同密码，必须与服务端原始字符串比较一致', () => {
    expect(arePasswordsEqual('Ｐａｓｓｗｏｒｄ１２３', 'Password123')).toBe(false)
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

  it('unicode 组合字符与预组合不能静默视为相同密码', () => {
    const combined = 'caf\u0065\u0301' // café (组合)
    const precomposed = 'caf\u00E9' // café (预组合)
    expect(arePasswordsEqual(combined, precomposed)).toBe(false)
  })

  it('前后空格不应被忽略', () => {
    expect(arePasswordsEqual(' password', 'password')).toBe(false)
    expect(arePasswordsEqual('password ', 'password')).toBe(false)
  })
})
