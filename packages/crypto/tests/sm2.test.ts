/**
 * =============================================================================
 * @hai/crypto - SM2 单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { crypto } from '../src/index.js'

describe('sm2', () => {
  describe('generateKeyPair', () => {
    it('should generate valid key pair', () => {
      const result = crypto.sm2.generateKeyPair()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.publicKey).toBeDefined()
        expect(result.data.privateKey).toBeDefined()
        expect(crypto.sm2.isValidPublicKey(result.data.publicKey)).toBe(true)
        expect(crypto.sm2.isValidPrivateKey(result.data.privateKey)).toBe(true)
      }
    })

    it('should generate unique key pairs', () => {
      const result1 = crypto.sm2.generateKeyPair()
      const result2 = crypto.sm2.generateKeyPair()

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        expect(result1.data.publicKey).not.toBe(result2.data.publicKey)
        expect(result1.data.privateKey).not.toBe(result2.data.privateKey)
      }
    })
  })

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      expect(keyPairResult.success).toBe(true)

      if (!keyPairResult.success)
        return
      const { publicKey, privateKey } = keyPairResult.data

      const plaintext = 'Hello, SM2!'

      const encryptResult = crypto.sm2.encrypt(plaintext, publicKey)
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return
      const ciphertext = encryptResult.data

      // 密文应该不同于明文
      expect(ciphertext).not.toBe(plaintext)

      const decryptResult = crypto.sm2.decrypt(ciphertext, privateKey)
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should encrypt same data to different ciphertext', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      expect(keyPairResult.success).toBe(true)

      if (!keyPairResult.success)
        return
      const { publicKey } = keyPairResult.data

      const plaintext = 'Same data'

      const result1 = crypto.sm2.encrypt(plaintext, publicKey)
      const result2 = crypto.sm2.encrypt(plaintext, publicKey)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        // SM2 使用随机数，所以每次加密结果不同
        expect(result1.data).not.toBe(result2.data)
      }
    })

    it('should handle Chinese characters', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      const { publicKey, privateKey } = keyPairResult.data
      const plaintext = '你好，世界！国密算法测试'

      const encryptResult = crypto.sm2.encrypt(plaintext, publicKey)
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return

      const decryptResult = crypto.sm2.decrypt(encryptResult.data, privateKey)
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should handle public key with 04 prefix', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      const { publicKey, privateKey } = keyPairResult.data
      const publicKeyWith04 = publicKey.startsWith('04') ? publicKey : `04${publicKey}`

      const plaintext = 'Test with 04 prefix'

      const encryptResult = crypto.sm2.encrypt(plaintext, publicKeyWith04)
      expect(encryptResult.success).toBe(true)

      if (!encryptResult.success)
        return

      const decryptResult = crypto.sm2.decrypt(encryptResult.data, privateKey)
      expect(decryptResult.success).toBe(true)

      if (decryptResult.success) {
        expect(decryptResult.data).toBe(plaintext)
      }
    })

    it('should reject invalid public key', () => {
      const result = crypto.sm2.encrypt('test', 'invalid-key')
      expect(result.success).toBe(false)
    })

    it('should reject invalid private key', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      const encryptResult = crypto.sm2.encrypt('test', keyPairResult.data.publicKey)
      if (!encryptResult.success)
        return

      const result = crypto.sm2.decrypt(encryptResult.data, 'invalid-key')
      expect(result.success).toBe(false)
    })
  })

  describe('sign/verify', () => {
    it('should sign and verify data', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      const { publicKey, privateKey } = keyPairResult.data
      const data = 'Data to sign'

      const signResult = crypto.sm2.sign(data, privateKey)
      expect(signResult.success).toBe(true)

      if (!signResult.success)
        return
      const signature = signResult.data

      const verifyResult = crypto.sm2.verify(data, signature, publicKey)
      expect(verifyResult.success).toBe(true)

      if (verifyResult.success) {
        expect(verifyResult.data).toBe(true)
      }
    })

    it('should fail verification with wrong data', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      const { publicKey, privateKey } = keyPairResult.data

      const signResult = crypto.sm2.sign('Original data', privateKey)
      if (!signResult.success)
        return

      const verifyResult = crypto.sm2.verify('Tampered data', signResult.data, publicKey)
      expect(verifyResult.success).toBe(true)

      if (verifyResult.success) {
        expect(verifyResult.data).toBe(false)
      }
    })

    it('should fail verification with wrong key', () => {
      const keyPair1 = crypto.sm2.generateKeyPair()
      const keyPair2 = crypto.sm2.generateKeyPair()

      if (!keyPair1.success || !keyPair2.success)
        return

      const data = 'Data to sign'
      const signResult = crypto.sm2.sign(data, keyPair1.data.privateKey)

      if (!signResult.success)
        return

      // 使用不同的公钥验证
      const verifyResult = crypto.sm2.verify(data, signResult.data, keyPair2.data.publicKey)
      expect(verifyResult.success).toBe(true)

      if (verifyResult.success) {
        expect(verifyResult.data).toBe(false)
      }
    })
  })

  describe('key validation', () => {
    it('should validate correct public key', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      expect(crypto.sm2.isValidPublicKey(keyPairResult.data.publicKey)).toBe(true)
    })

    it('should reject invalid public key', () => {
      expect(crypto.sm2.isValidPublicKey('')).toBe(false)
      expect(crypto.sm2.isValidPublicKey('invalid')).toBe(false)
      expect(crypto.sm2.isValidPublicKey('abc123')).toBe(false)
    })

    it('should validate correct private key', () => {
      const keyPairResult = crypto.sm2.generateKeyPair()
      if (!keyPairResult.success)
        return

      expect(crypto.sm2.isValidPrivateKey(keyPairResult.data.privateKey)).toBe(true)
    })

    it('should reject invalid private key', () => {
      expect(crypto.sm2.isValidPrivateKey('')).toBe(false)
      expect(crypto.sm2.isValidPrivateKey('invalid')).toBe(false)
      expect(crypto.sm2.isValidPrivateKey('abc123')).toBe(false)
    })
  })
})
