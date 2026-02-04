import { describe, expect, it } from 'vitest'
import { crypto } from '../src/index.js'

/**
 * @example
 * ```ts
 * const hash = crypto.sm3.hash('data')
 * const hmac = crypto.sm3.hmac('data', 'key')
 * ```
 */

describe('crypto.sm3', () => {
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

  it('should hash Uint8Array input', () => {
    const input = new TextEncoder().encode('hello')
    const hash = crypto.sm3.hash(input)
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    expect(hash.data.length).toBeGreaterThan(0)
  })

  it('should hash hex input when inputEncoding is hex', () => {
    const hash = crypto.sm3.hash('68656c6c6f', { inputEncoding: 'hex' })
    expect(hash.success).toBe(true)
    if (!hash.success)
      return

    expect(hash.data.length).toBeGreaterThan(0)
  })

  it('should calculate hmac', () => {
    const hmac = crypto.sm3.hmac('data', 'secret')
    expect(hmac.success).toBe(true)
    if (!hmac.success)
      return

    expect(hmac.data.length).toBeGreaterThan(0)
  })

  it('should produce stable hmac with same inputs', () => {
    const first = crypto.sm3.hmac('data', 'secret')
    const second = crypto.sm3.hmac('data', 'secret')
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    if (!first.success || !second.success)
      return

    expect(first.data).toBe(second.data)
  })

  it('should calculate hmac with long key', () => {
    const longKey = 'k'.repeat(100)
    const hmac = crypto.sm3.hmac('data', longKey)
    expect(hmac.success).toBe(true)
    if (!hmac.success)
      return

    expect(hmac.data.length).toBeGreaterThan(0)
  })
})
