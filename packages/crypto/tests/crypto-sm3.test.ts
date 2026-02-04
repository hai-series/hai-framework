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

  it('should calculate hmac', () => {
    const hmac = crypto.sm3.hmac('data', 'secret')
    expect(hmac.success).toBe(true)
    if (!hmac.success)
      return

    expect(hmac.data.length).toBeGreaterThan(0)
  })
})
