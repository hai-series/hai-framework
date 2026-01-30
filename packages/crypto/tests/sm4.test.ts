/**
 * =============================================================================
 * @hai/crypto - SM4 单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { crypto, CryptoErrorCode } from '../src/index.js'

describe('sm4', () => {
  describe('generateKey', () => {
    it('should generate valid key', () => {
      const key = crypto.sm4.generateKey()

      // SM4 密钥 16 字节 = 32 个十六进制字符
      expect(key).toHaveLength(32)
      expect(crypto.sm4.isValidKey(key)).toBe(true)
    })

    it('should generate unique keys', () => {
      const key1 = crypto.sm4.generateKey()
      const key2 = crypto.sm4.generateKey()

      expect(key1).not.toBe(key2)
    })
  })

  describe('generateIV', () => {
    it('should generate valid IV', () => {
      const iv = crypto.sm4.generateIV()

      expect(iv).toHaveLength(32)
      expect(crypto.sm4.isValidIV(iv)).toBe(true)
    })

    it('should generate unique IVs', () => {
      const iv1 = crypto.sm4.generateIV()
      const iv2 = crypto.sm4.generateIV()

      expect(iv1).not.toBe(iv2)
    })
  })

  describe('key/iv validation', () => {
    it('should validate correct key', () => {
      const key = crypto.sm4.generateKey()
      expect(crypto.sm4.isValidKey(key)).toBe(true)
    })

    it('should reject invalid key', () => {
      expect(crypto.sm4.isValidKey('')).toBe(false)
      expect(crypto.sm4.isValidKey('short')).toBe(false)
      expect(crypto.sm4.isValidKey('0'.repeat(31))).toBe(false)
      expect(crypto.sm4.isValidKey('0'.repeat(33))).toBe(false)
      expect(crypto.sm4.isValidKey('not-hex-chars!@#$%^&*()12345678')).toBe(false)
    })

    it('should validate correct IV', () => {
      const iv = crypto.sm4.generateIV()
      expect(crypto.sm4.isValidIV(iv)).toBe(true)
    })

    it('should reject invalid IV', () => {
      expect(crypto.sm4.isValidIV('')).toBe(false)
      expect(crypto.sm4.isValidIV('short')).toBe(false)
    })
  })

  describe('encrypt/decrypt ECB mode', () => {
    it('should encrypt and decrypt data', () => {
      const key = crypto.sm4.generateKey()
      const plaintext = 'Hello, SM4!'

      const encryptResult = crypto.sm4.encrypt(plaintext, key)
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return

      const decryptResult = crypto.sm4.decrypt(encryptResult.data, key)
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should produce consistent ciphertext for same key (ECB)', () => {
      const key = crypto.sm4.generateKey()
      const plaintext = 'Same data'

      const result1 = crypto.sm4.encrypt(plaintext, key)
      const result2 = crypto.sm4.encrypt(plaintext, key)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        // ECB 模式下，相同明文产生相同密文
        expect(result1.data).toBe(result2.data)
      }
    })

    it('should handle Chinese characters', () => {
      const key = crypto.sm4.generateKey()
      const plaintext = '你好，世界！国密算法测试'

      const encryptResult = crypto.sm4.encrypt(plaintext, key)
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return

      const decryptResult = crypto.sm4.decrypt(encryptResult.data, key)
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should reject invalid key', () => {
      const result = crypto.sm4.encrypt('test', 'invalid-key')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CryptoErrorCode.INVALID_KEY)
      }
    })
  })

  describe('encrypt/decrypt CBC mode', () => {
    it('should encrypt and decrypt data', () => {
      const key = crypto.sm4.generateKey()
      const iv = crypto.sm4.generateIV()
      const plaintext = 'Hello, CBC mode!'

      const encryptResult = crypto.sm4.encrypt(plaintext, key, { mode: 'cbc', iv })
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return

      const decryptResult = crypto.sm4.decrypt(encryptResult.data, key, { mode: 'cbc', iv })
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should produce different ciphertext with different IV', () => {
      const key = crypto.sm4.generateKey()
      const plaintext = 'Same data'

      const result1 = crypto.sm4.encrypt(plaintext, key, { mode: 'cbc', iv: crypto.sm4.generateIV() })
      const result2 = crypto.sm4.encrypt(plaintext, key, { mode: 'cbc', iv: crypto.sm4.generateIV() })

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        // 不同 IV 产生不同密文
        expect(result1.data).not.toBe(result2.data)
      }
    })

    it('should require IV for CBC mode', () => {
      const key = crypto.sm4.generateKey()
      const result = crypto.sm4.encrypt('test', key, { mode: 'cbc' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CryptoErrorCode.INVALID_IV)
      }
    })

    it('should reject invalid IV', () => {
      const key = crypto.sm4.generateKey()
      const result = crypto.sm4.encrypt('test', key, { mode: 'cbc', iv: 'short' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CryptoErrorCode.INVALID_IV)
      }
    })
  })

  describe('encryptWithIV/decryptWithIV', () => {
    it('should encrypt with embedded IV', () => {
      const key = crypto.sm4.generateKey()
      const plaintext = 'Test data with IV'

      const encryptResult = crypto.sm4.encryptWithIV(plaintext, key)
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return

      expect(encryptResult.data.ciphertext).toBeDefined()
      expect(encryptResult.data.iv).toBeDefined()
      expect(crypto.sm4.isValidIV(encryptResult.data.iv)).toBe(true)

      const decryptResult = crypto.sm4.decryptWithIV(
        encryptResult.data.ciphertext,
        key,
        encryptResult.data.iv,
      )
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should produce different ciphertext for same data', () => {
      const key = crypto.sm4.generateKey()
      const plaintext = 'Same data'

      const result1 = crypto.sm4.encryptWithIV(plaintext, key)
      const result2 = crypto.sm4.encryptWithIV(plaintext, key)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        // 每次生成不同 IV，密文也不同
        expect(result1.data.iv).not.toBe(result2.data.iv)
        expect(result1.data.ciphertext).not.toBe(result2.data.ciphertext)
      }
    })
  })

  describe('deriveKey', () => {
    it('should derive key from password', () => {
      const key = crypto.sm4.deriveKey('password', 'salt')

      expect(key).toHaveLength(32)
      expect(crypto.sm4.isValidKey(key)).toBe(true)
    })

    it('should produce consistent key for same inputs', () => {
      const key1 = crypto.sm4.deriveKey('password', 'salt')
      const key2 = crypto.sm4.deriveKey('password', 'salt')

      expect(key1).toBe(key2)
    })

    it('should produce different key for different password', () => {
      const key1 = crypto.sm4.deriveKey('password1', 'salt')
      const key2 = crypto.sm4.deriveKey('password2', 'salt')

      expect(key1).not.toBe(key2)
    })

    it('should produce different key for different salt', () => {
      const key1 = crypto.sm4.deriveKey('password', 'salt1')
      const key2 = crypto.sm4.deriveKey('password', 'salt2')

      expect(key1).not.toBe(key2)
    })
  })
})
