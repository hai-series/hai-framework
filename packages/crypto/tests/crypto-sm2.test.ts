import { describe, expect, it } from 'vitest'
import { crypto, CryptoErrorCode } from '../src/index.js'

/**
 * @example
 * ```ts
 * const keyPair = crypto.sm2.generateKeyPair()
 * if (keyPair.success) {
 *   const encrypted = crypto.sm2.encrypt('data', keyPair.data.publicKey)
 * }
 * ```
 */

describe('crypto.sm2', () => {
  it('should generate valid key pair', () => {
    const result = crypto.sm2.generateKeyPair()
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(crypto.sm2.isValidPublicKey(result.data.publicKey)).toBe(true)
    expect(crypto.sm2.isValidPrivateKey(result.data.privateKey)).toBe(true)
  })

  it('should encrypt and decrypt roundtrip', () => {
    const keyPair = crypto.sm2.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const encrypted = crypto.sm2.encrypt('hello', keyPair.data.publicKey)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should sign and verify', () => {
    const keyPair = crypto.sm2.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const signature = crypto.sm2.sign('payload', keyPair.data.privateKey)
    expect(signature.success).toBe(true)
    if (!signature.success)
      return

    const verified = crypto.sm2.verify('payload', signature.data, keyPair.data.publicKey)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return

    expect(verified.data).toBe(true)
  })

  it('should return INVALID_KEY for invalid public key', () => {
    const result = crypto.sm2.encrypt('data', 'invalid-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_KEY)
  })
})
