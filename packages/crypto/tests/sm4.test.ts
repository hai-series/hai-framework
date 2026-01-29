/**
 * =============================================================================
 * @hai/crypto - SM4 单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  decrypt,
  decryptWithIV,
  deriveKey,
  encrypt,
  encryptWithIV,
  generateIV,
  generateKey,
  isValidIV,
  isValidKey,
} from '../src/sm4.js'

describe('sm4', () => {
  describe('generateKey', () => {
    it('should generate valid key', () => {
      const key = generateKey()

      // SM4 密钥 16 字节 = 32 个十六进制字符
      expect(key).toHaveLength(32)
      expect(isValidKey(key)).toBe(true)
    })

    it('should generate unique keys', () => {
      const key1 = generateKey()
      const key2 = generateKey()

      expect(key1).not.toBe(key2)
    })
  })

  describe('generateIV', () => {
    it('should generate valid IV', () => {
      const iv = generateIV()

      expect(iv).toHaveLength(32)
      expect(isValidIV(iv)).toBe(true)
    })

    it('should generate unique IVs', () => {
      const iv1 = generateIV()
      const iv2 = generateIV()

      expect(iv1).not.toBe(iv2)
    })
  })

  describe('key/iv validation', () => {
    it('should validate correct key', () => {
      const key = generateKey()
      expect(isValidKey(key)).toBe(true)
    })

    it('should reject invalid key', () => {
      expect(isValidKey('')).toBe(false)
      expect(isValidKey('short')).toBe(false)
      expect(isValidKey('0'.repeat(31))).toBe(false)
      expect(isValidKey('0'.repeat(33))).toBe(false)
      expect(isValidKey('not-hex-chars!@#$%^&*()12345678')).toBe(false)
    })

    it('should validate correct IV', () => {
      const iv = generateIV()
      expect(isValidIV(iv)).toBe(true)
    })

    it('should reject invalid IV', () => {
      expect(isValidIV('')).toBe(false)
      expect(isValidIV('short')).toBe(false)
    })
  })

  describe('encrypt/decrypt ECB mode', () => {
    it('should encrypt and decrypt data', () => {
      const key = generateKey()
      const plaintext = 'Hello, SM4!'

      const encryptResult = encrypt(plaintext, key)
      expect(encryptResult.ok).toBe(true)

      if (!encryptResult.ok)
        return

      const decryptResult = decrypt(encryptResult.value, key)
      expect(decryptResult.ok).toBe(true)

      if (decryptResult.ok) {
        expect(decryptResult.value).toBe(plaintext)
      }
    })

    it('should produce consistent ciphertext for same key (ECB)', () => {
      const key = generateKey()
      const plaintext = 'Same data'

      const result1 = encrypt(plaintext, key)
      const result2 = encrypt(plaintext, key)

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)

      if (result1.ok && result2.ok) {
        // ECB 模式下，相同明文产生相同密文
        expect(result1.value).toBe(result2.value)
      }
    })

    it('should handle Chinese characters', () => {
      const key = generateKey()
      const plaintext = '你好，世界！国密算法测试'

      const encryptResult = encrypt(plaintext, key)
      expect(encryptResult.ok).toBe(true)

      if (!encryptResult.ok)
        return

      const decryptResult = decrypt(encryptResult.value, key)
      expect(decryptResult.ok).toBe(true)

      if (decryptResult.ok) {
        expect(decryptResult.value).toBe(plaintext)
      }
    })

    it('should reject invalid key', () => {
      const result = encrypt('test', 'invalid-key')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_KEY')
      }
    })
  })

  describe('encrypt/decrypt CBC mode', () => {
    it('should encrypt and decrypt data', () => {
      const key = generateKey()
      const iv = generateIV()
      const plaintext = 'Hello, CBC mode!'

      const encryptResult = encrypt(plaintext, key, { mode: 'cbc', iv })
      expect(encryptResult.ok).toBe(true)

      if (!encryptResult.ok)
        return

      const decryptResult = decrypt(encryptResult.value, key, { mode: 'cbc', iv })
      expect(decryptResult.ok).toBe(true)

      if (decryptResult.ok) {
        expect(decryptResult.value).toBe(plaintext)
      }
    })

    it('should produce different ciphertext with different IV', () => {
      const key = generateKey()
      const plaintext = 'Same data'

      const result1 = encrypt(plaintext, key, { mode: 'cbc', iv: generateIV() })
      const result2 = encrypt(plaintext, key, { mode: 'cbc', iv: generateIV() })

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)

      if (result1.ok && result2.ok) {
        // 不同 IV 产生不同密文
        expect(result1.value).not.toBe(result2.value)
      }
    })

    it('should require IV for CBC mode', () => {
      const key = generateKey()
      const result = encrypt('test', key, { mode: 'cbc' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_IV')
      }
    })

    it('should reject invalid IV', () => {
      const key = generateKey()
      const result = encrypt('test', key, { mode: 'cbc', iv: 'short' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_IV')
      }
    })
  })

  describe('encryptWithIV/decryptWithIV', () => {
    it('should encrypt with embedded IV', () => {
      const key = generateKey()
      const plaintext = 'Test with embedded IV'

      const encryptResult = encryptWithIV(plaintext, key)
      expect(encryptResult.ok).toBe(true)

      if (!encryptResult.ok)
        return

      // 结果应该比普通加密长（包含 32 字符 IV）
      expect(encryptResult.value.length).toBeGreaterThan(32)

      const decryptResult = decryptWithIV(encryptResult.value, key)
      expect(decryptResult.ok).toBe(true)

      if (decryptResult.ok) {
        expect(decryptResult.value).toBe(plaintext)
      }
    })

    it('should reject too short ciphertext', () => {
      const key = generateKey()
      const result = decryptWithIV('short', key)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_INPUT')
      }
    })
  })

  describe('deriveKey', () => {
    it('should derive key from password', () => {
      const result = deriveKey('password123', 'salt-value')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toHaveLength(32)
        expect(isValidKey(result.value)).toBe(true)
      }
    })

    it('should produce consistent key for same input', () => {
      const result1 = deriveKey('password', 'salt')
      const result2 = deriveKey('password', 'salt')

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)

      if (result1.ok && result2.ok) {
        expect(result1.value).toBe(result2.value)
      }
    })

    it('should produce different key for different password', () => {
      const result1 = deriveKey('password1', 'salt')
      const result2 = deriveKey('password2', 'salt')

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)

      if (result1.ok && result2.ok) {
        expect(result1.value).not.toBe(result2.value)
      }
    })

    it('should produce different key for different salt', () => {
      const result1 = deriveKey('password', 'salt1')
      const result2 = deriveKey('password', 'salt2')

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)

      if (result1.ok && result2.ok) {
        expect(result1.value).not.toBe(result2.value)
      }
    })
  })

  describe('base64 output', () => {
    it('should support base64 output format', () => {
      const key = generateKey()
      const plaintext = 'Test base64'

      const encryptResult = encrypt(plaintext, key, { outputFormat: 'base64' })
      expect(encryptResult.ok).toBe(true)

      if (!encryptResult.ok)
        return

      // 应该是 base64 格式
      expect(/^[\w+/=]+$/.test(encryptResult.value)).toBe(true)

      const decryptResult = decrypt(encryptResult.value, key, { outputFormat: 'base64' })
      expect(decryptResult.ok).toBe(true)

      if (decryptResult.ok) {
        expect(decryptResult.value).toBe(plaintext)
      }
    })
  })
})
