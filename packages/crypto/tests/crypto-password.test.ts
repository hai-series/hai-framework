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
})
