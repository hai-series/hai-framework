import { describe, expect, it } from 'vitest'
import { crypto, CryptoErrorCode } from '../src/index.js'

/**
 * @example
 * ```ts
 * const key = crypto.sm4.generateKey()
 * const encrypted = crypto.sm4.encrypt('data', key)
 * ```
 */

describe('crypto.sm4', () => {
  it('should generate key and iv', () => {
    const key = crypto.sm4.generateKey()
    const iv = crypto.sm4.generateIV()

    expect(key).toMatch(/^[0-9a-f]{32}$/i)
    expect(iv).toMatch(/^[0-9a-f]{32}$/i)
  })

  it('should validate key and iv format', () => {
    expect(crypto.sm4.isValidKey('00112233445566778899aabbccddeeff')).toBe(true)
    expect(crypto.sm4.isValidIV('00112233445566778899aabbccddeeff')).toBe(true)
    expect(crypto.sm4.isValidKey('bad')).toBe(false)
    expect(crypto.sm4.isValidIV('bad')).toBe(false)
  })

  it('should encrypt and decrypt (ecb)', () => {
    const key = crypto.sm4.generateKey()
    const encrypted = crypto.sm4.encrypt('hello', key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.sm4.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt with base64 output', () => {
    const key = crypto.sm4.generateKey()
    const encrypted = crypto.sm4.encrypt('hello', key, { outputFormat: 'base64' })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.sm4.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt with iv (cbc)', () => {
    const key = crypto.sm4.generateKey()
    const encrypted = crypto.sm4.encryptWithIV('hello', key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.sm4.decryptWithIV(encrypted.data.ciphertext, key, encrypted.data.iv)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should derive key from password and salt', () => {
    const key = crypto.sm4.deriveKey('password', 'salt')
    expect(key).toMatch(/^[0-9a-f]{32}$/i)
  })

  it('should return INVALID_KEY for invalid key', () => {
    const result = crypto.sm4.encrypt('data', 'invalid-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_KEY)
  })

  it('should return INVALID_IV when missing iv in cbc', () => {
    const key = crypto.sm4.generateKey()
    const result = crypto.sm4.encrypt('data', key, { mode: 'cbc' })
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_IV)
  })

  it('should return INVALID_IV when decrypting cbc without iv', () => {
    const key = crypto.sm4.generateKey()
    const result = crypto.sm4.decrypt('abcd', key, { mode: 'cbc' })
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(CryptoErrorCode.INVALID_IV)
  })
})
