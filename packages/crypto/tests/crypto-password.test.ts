import { beforeAll, describe, expect, it } from 'vitest'
import { crypto, CryptoErrorCode } from '../src/index.js'

describe('crypto.password', () => {
  beforeAll(async () => {
    await crypto.init({})
  })

  // ─── 正常流 ───

  it('should hash and verify password', () => {
    const hashResult = crypto.password.hash('myPassword123')
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = crypto.password.verify('myPassword123', hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(true)
  })

  it('should return false when password does not match', () => {
    const hashResult = crypto.password.hash('myPassword123')
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = crypto.password.verify('anotherPassword', hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(false)
  })

  // ─── 哈希格式 ───

  it('should produce hash with default format: $hai$10000$<16-char-salt>$<hash>', () => {
    const hashResult = crypto.password.hash('password')
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const parts = hashResult.data.split('$')
    expect(parts.length).toBe(5)
    expect(parts[0]).toBe('') // 首个 $ 前为空
    expect(parts[1]).toBe('hai')
    expect(parts[2]).toBe('10000') // 默认迭代次数
    expect(parts[3].length).toBe(16) // 默认盐值长度
    expect(parts[4].length).toBeGreaterThan(0)
  })

  it('should produce hash with custom iterations and salt length', () => {
    const hashResult = crypto.password.hash('myPassword123', { iterations: 12000, saltLength: 8 })
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const parts = hashResult.data.split('$')
    expect(parts.length).toBe(5)
    expect(parts[1]).toBe('hai')
    expect(parts[2]).toBe('12000')
    expect(parts[3].length).toBe(8)
    expect(parts[4].length).toBeGreaterThan(0)
  })

  it('should produce different hashes for same password due to random salt', () => {
    const hash1 = crypto.password.hash('samePassword')
    const hash2 = crypto.password.hash('samePassword')
    expect(hash1.success && hash2.success).toBe(true)
    if (!hash1.success || !hash2.success)
      return

    // 两次哈希应不同（盐值不同）
    expect(hash1.data).not.toBe(hash2.data)

    // 但两者都应该能验证通过
    const v1 = crypto.password.verify('samePassword', hash1.data)
    const v2 = crypto.password.verify('samePassword', hash2.data)
    expect(v1.success && v2.success).toBe(true)
    if (!v1.success || !v2.success)
      return
    expect(v1.data).toBe(true)
    expect(v2.data).toBe(true)
  })

  // ─── 特殊输入 ───

  it('should hash and verify Chinese password', () => {
    const hashResult = crypto.password.hash('密码测试123')
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = crypto.password.verify('密码测试123', hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(true)
  })

  it('should hash and verify long password', () => {
    const longPassword = 'p'.repeat(1000)
    const hashResult = crypto.password.hash(longPassword)
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = crypto.password.verify(longPassword, hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(true)
  })

  it('should hash and verify password with special characters', () => {
    const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~'
    const hashResult = crypto.password.hash(password)
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = crypto.password.verify(password, hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(true)
  })

  // ─── 边界与错误 ───

  it('should return INVALID_INPUT when password is empty', () => {
    const result = crypto.password.hash('')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT when verify password is empty', () => {
    const result = crypto.password.verify('', '$hai$10000$salt$hash')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT when hash is empty', () => {
    const result = crypto.password.verify('password', '')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT when hash format is invalid', () => {
    const result = crypto.password.verify('password', 'invalid-hash')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT for malformed hash parts', () => {
    const result = crypto.password.verify('password', '$hai$not-number$salt$hash')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT for wrong hash prefix', () => {
    const result = crypto.password.verify('password', '$wrong$10000$salt$hash')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })
})
