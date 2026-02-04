import { describe, expect, it } from 'vitest'
import { crypto, CryptoErrorCode } from '../src/index.js'

/**
 * @example
 * ```ts
 * const provider = crypto.password.create()
 * const hashResult = provider.hash('password')
 * ```
 */

describe('crypto password provider', () => {
  it('should hash and verify password', () => {
    const provider = crypto.password.create()
    const hashResult = provider.hash('myPassword123')
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = provider.verify('myPassword123', hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(true)
  })

  it('should generate hash with configured iterations and salt length', () => {
    const provider = crypto.password.create({ iterations: 12000, saltLength: 8 })
    const hashResult = provider.hash('myPassword123')
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

  it('should return false when password does not match', () => {
    const provider = crypto.password.create()
    const hashResult = provider.hash('myPassword123')
    expect(hashResult.success).toBe(true)
    if (!hashResult.success)
      return

    const verifyResult = provider.verify('anotherPassword', hashResult.data)
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success)
      return

    expect(verifyResult.data).toBe(false)
  })

  it('should return INVALID_INPUT when password is empty', () => {
    const provider = crypto.password.create()
    const result = provider.hash('')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT when hash format is invalid', () => {
    const provider = crypto.password.create()
    const result = provider.verify('password', 'invalid-hash')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT when hash is empty', () => {
    const provider = crypto.password.create()
    const result = provider.verify('password', '')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })

  it('should return INVALID_INPUT for malformed hash parts', () => {
    const provider = crypto.password.create()
    const result = provider.verify('password', '$hai$not-number$salt$hash')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_INPUT)
  })
})
