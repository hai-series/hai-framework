import { beforeAll, describe, expect, it } from 'vitest'
import { crypto } from '../src/index.js'

describe('crypto.sm3', () => {
  beforeAll(async () => {
    await crypto.init({})
  })

  // ─── 哈希基本功能 ───

  it('should hash string and produce 64-char hex', () => {
    const hash = crypto.sm3.hash('hello')
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    // SM3 输出 256 位 = 64 个十六进制字符
    expect(hash.data).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('should produce deterministic hash for same input', () => {
    const hash1 = crypto.sm3.hash('hello')
    const hash2 = crypto.sm3.hash('hello')
    expect(hash1.success && hash2.success).toBe(true)
    if (!hash1.success || !hash2.success)
      return

    expect(hash1.data).toBe(hash2.data)
  })

  it('should produce different hashes for different inputs', () => {
    const hash1 = crypto.sm3.hash('hello')
    const hash2 = crypto.sm3.hash('world')
    expect(hash1.success && hash2.success).toBe(true)
    if (!hash1.success || !hash2.success)
      return

    expect(hash1.data).not.toBe(hash2.data)
  })

  it('should hash empty string', () => {
    const hash = crypto.sm3.hash('')
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    expect(hash.data).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('should hash Chinese text', () => {
    const hash = crypto.sm3.hash('你好世界')
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    expect(hash.data).toMatch(/^[0-9a-f]{64}$/i)
  })

  // ─── 输入格式 ───

  it('should hash Uint8Array input', () => {
    const input = new TextEncoder().encode('hello')
    const hash = crypto.sm3.hash(input)
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    expect(hash.data).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('should hash hex input when inputEncoding is hex', () => {
    const hash = crypto.sm3.hash('68656c6c6f', { inputEncoding: 'hex' })
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    expect(hash.data).toMatch(/^[0-9a-f]{64}$/i)
  })

  // ─── 验证 ───

  it('should hash and verify', () => {
    const hash = crypto.sm3.hash('hello')
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    const verified = crypto.sm3.verify('hello', hash.data)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return

    expect(verified.data).toBe(true)
  })

  it('should verify false when hash does not match', () => {
    const hash = crypto.sm3.hash('hello')
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    const verified = crypto.sm3.verify('hello', `${hash.data}00`)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return

    expect(verified.data).toBe(false)
  })

  it('should verify case-insensitively', () => {
    const hash = crypto.sm3.hash('hello')
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    const upperHash = hash.data.toUpperCase()
    const verified = crypto.sm3.verify('hello', upperHash)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return

    expect(verified.data).toBe(true)
  })

  // ─── HMAC ───

  it('should calculate hmac', () => {
    const hmac = crypto.sm3.hmac('data', 'secret')
    expect(hmac.success).toBe(true)
    if (!hmac.success)
      return

    expect(hmac.data).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('should produce stable hmac with same inputs', () => {
    const first = crypto.sm3.hmac('data', 'secret')
    const second = crypto.sm3.hmac('data', 'secret')
    expect(first.success && second.success).toBe(true)
    if (!first.success || !second.success)
      return

    expect(first.data).toBe(second.data)
  })

  it('should produce different hmac with different keys', () => {
    const hmac1 = crypto.sm3.hmac('data', 'key1')
    const hmac2 = crypto.sm3.hmac('data', 'key2')
    expect(hmac1.success && hmac2.success).toBe(true)
    if (!hmac1.success || !hmac2.success)
      return

    expect(hmac1.data).not.toBe(hmac2.data)
  })

  it('should produce different hmac with different data', () => {
    const hmac1 = crypto.sm3.hmac('data1', 'secret')
    const hmac2 = crypto.sm3.hmac('data2', 'secret')
    expect(hmac1.success && hmac2.success).toBe(true)
    if (!hmac1.success || !hmac2.success)
      return

    expect(hmac1.data).not.toBe(hmac2.data)
  })

  it('should calculate hmac with long key', () => {
    const longKey = 'k'.repeat(100)
    const hmac = crypto.sm3.hmac('data', longKey)
    expect(hmac.success).toBe(true)
    if (!hmac.success)
      return

    expect(hmac.data).toMatch(/^[0-9a-f]{64}$/i)
  })
})
