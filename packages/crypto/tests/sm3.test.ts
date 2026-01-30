/**
 * =============================================================================
 * @hai/crypto - SM3 单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { crypto } from '../src/index.js'

describe('sm3', () => {
  describe('hash', () => {
    it('should hash string data', () => {
      const result = crypto.sm3.hash('hello')

      expect(result.success).toBe(true)
      if (result.success) {
        // SM3 输出 256 位 = 64 个十六进制字符
        expect(result.data).toHaveLength(64)
        // 结果应该是十六进制字符串
        expect(/^[\da-f]{64}$/i.test(result.data)).toBe(true)
      }
    })

    it('should produce consistent hash for same input', () => {
      const result1 = crypto.sm3.hash('test data')
      const result2 = crypto.sm3.hash('test data')

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        expect(result1.data).toBe(result2.data)
      }
    })

    it('should produce different hash for different input', () => {
      const result1 = crypto.sm3.hash('data1')
      const result2 = crypto.sm3.hash('data2')

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        expect(result1.data).not.toBe(result2.data)
      }
    })

    it('should handle empty string', () => {
      const result = crypto.sm3.hash('')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(64)
      }
    })

    it('should handle Chinese characters', () => {
      const result = crypto.sm3.hash('你好世界')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(64)
      }
    })

    it('should handle Uint8Array input', () => {
      const data = new Uint8Array([0x68, 0x65, 0x6C, 0x6C, 0x6F]) // 'hello'
      const result = crypto.sm3.hash(data)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(64)
      }
    })
  })

  describe('verify', () => {
    it('should verify correct hash', () => {
      const hashResult = crypto.sm3.hash('test')
      expect(hashResult.success).toBe(true)

      if (hashResult.success) {
        const verifyResult = crypto.sm3.verify('test', hashResult.data)
        expect(verifyResult.success).toBe(true)
        if (verifyResult.success) {
          expect(verifyResult.data).toBe(true)
        }
      }
    })

    it('should reject incorrect hash', () => {
      const hashResult = crypto.sm3.hash('test')
      expect(hashResult.success).toBe(true)

      if (hashResult.success) {
        const verifyResult = crypto.sm3.verify('wrong', hashResult.data)
        expect(verifyResult.success).toBe(true)
        if (verifyResult.success) {
          expect(verifyResult.data).toBe(false)
        }
      }
    })

    it('should reject tampered hash', () => {
      const hashResult = crypto.sm3.hash('test')
      expect(hashResult.success).toBe(true)

      if (hashResult.success) {
        // 修改一个字符
        const tampered = `a${hashResult.data.slice(1)}`
        const verifyResult = crypto.sm3.verify('test', tampered)
        expect(verifyResult.success).toBe(true)
        if (verifyResult.success) {
          expect(verifyResult.data).toBe(false)
        }
      }
    })
  })

  describe('hmac', () => {
    it('should compute HMAC', () => {
      const result = crypto.sm3.hmac('data', 'secret-key')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(64)
      }
    })

    it('should produce consistent HMAC', () => {
      const result1 = crypto.sm3.hmac('data', 'key')
      const result2 = crypto.sm3.hmac('data', 'key')

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        expect(result1.data).toBe(result2.data)
      }
    })

    it('should produce different HMAC for different keys', () => {
      const result1 = crypto.sm3.hmac('data', 'key1')
      const result2 = crypto.sm3.hmac('data', 'key2')

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        expect(result1.data).not.toBe(result2.data)
      }
    })

    it('should produce different HMAC for different data', () => {
      const result1 = crypto.sm3.hmac('data1', 'key')
      const result2 = crypto.sm3.hmac('data2', 'key')

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      if (result1.success && result2.success) {
        expect(result1.data).not.toBe(result2.data)
      }
    })

    it('should handle long keys', () => {
      const longKey = 'a'.repeat(100)
      const result = crypto.sm3.hmac('data', longKey)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(64)
      }
    })
  })
})
