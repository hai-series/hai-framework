/**
 * =============================================================================
 * @hai/crypto - 密码哈希单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from '../src/password.js'

describe('password', () => {
  describe('hashPassword', () => {
    it('should hash password', () => {
      const result = hashPassword('password123')

      expect(result.ok).toBe(true)
      if (result.ok) {
        // PHC 格式检查
        expect(result.value).toMatch(/^\$argon2id\$v=19\$/)
        expect(result.value).toContain('m=')
        expect(result.value).toContain('t=')
        expect(result.value).toContain('p=')
      }
    })

    it('should produce unique hashes for same password', () => {
      const result1 = hashPassword('password')
      const result2 = hashPassword('password')

      expect(result1.ok).toBe(true)
      expect(result2.ok).toBe(true)

      if (result1.ok && result2.ok) {
        // 由于随机盐，每次哈希结果不同
        expect(result1.value).not.toBe(result2.value)
      }
    })

    it('should reject empty password', () => {
      const result = hashPassword('')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_PASSWORD')
      }
    })

    it('should accept custom options', () => {
      const result = hashPassword('password', {
        memoryCost: 32768,
        timeCost: 2,
        parallelism: 2,
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toContain('m=32768')
        expect(result.value).toContain('t=2')
        expect(result.value).toContain('p=2')
      }
    })
  })

  describe('verifyPassword', () => {
    it('should verify correct password', () => {
      const password = 'correct-password'
      const hashResult = hashPassword(password)

      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      const verifyResult = verifyPassword(password, hashResult.value)

      expect(verifyResult.ok).toBe(true)
      if (verifyResult.ok) {
        expect(verifyResult.value).toBe(true)
      }
    })

    it('should reject incorrect password', () => {
      const hashResult = hashPassword('correct-password')

      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      const verifyResult = verifyPassword('wrong-password', hashResult.value)

      expect(verifyResult.ok).toBe(true)
      if (verifyResult.ok) {
        expect(verifyResult.value).toBe(false)
      }
    })

    it('should reject invalid hash format', () => {
      const result = verifyPassword('password', 'invalid-hash')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_HASH')
      }
    })

    it('should handle Unicode passwords', () => {
      const password = '密码🔐Password123'
      const hashResult = hashPassword(password)

      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      const verifyResult = verifyPassword(password, hashResult.value)

      expect(verifyResult.ok).toBe(true)
      if (verifyResult.ok) {
        expect(verifyResult.value).toBe(true)
      }
    })
  })

  describe('needsRehash', () => {
    it('should return false for matching parameters', () => {
      const options = {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      }

      const hashResult = hashPassword('password', options)
      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      expect(needsRehash(hashResult.value, options)).toBe(false)
    })

    it('should return true for different memoryCost', () => {
      const hashResult = hashPassword('password', { memoryCost: 32768 })
      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      expect(needsRehash(hashResult.value, { memoryCost: 65536 })).toBe(true)
    })

    it('should return true for different timeCost', () => {
      const hashResult = hashPassword('password', { timeCost: 2 })
      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      expect(needsRehash(hashResult.value, { timeCost: 3 })).toBe(true)
    })

    it('should return true for different parallelism', () => {
      const hashResult = hashPassword('password', { parallelism: 2 })
      expect(hashResult.ok).toBe(true)
      if (!hashResult.ok)
        return

      expect(needsRehash(hashResult.value, { parallelism: 4 })).toBe(true)
    })

    it('should return true for invalid hash', () => {
      expect(needsRehash('invalid-hash')).toBe(true)
    })
  })

  describe('validatePasswordStrength', () => {
    it('should accept valid password with default policy', () => {
      const result = validatePasswordStrength('ValidPassword123')

      expect(result.ok).toBe(true)
    })

    it('should reject too short password', () => {
      const result = validatePasswordStrength('short', { minLength: 8 })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('at least 8 characters')
      }
    })

    it('should reject too long password', () => {
      const result = validatePasswordStrength('a'.repeat(100), { maxLength: 72 })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('at most 72 characters')
      }
    })

    it('should require uppercase when configured', () => {
      const result = validatePasswordStrength('nouppercase123', {
        requireUppercase: true,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('uppercase')
      }
    })

    it('should require lowercase when configured', () => {
      const result = validatePasswordStrength('NOLOWERCASE123', {
        requireLowercase: true,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('lowercase')
      }
    })

    it('should require numbers when configured', () => {
      const result = validatePasswordStrength('NoNumbersHere', {
        requireNumbers: true,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('number')
      }
    })

    it('should require special characters when configured', () => {
      const result = validatePasswordStrength('NoSpecialChars123', {
        requireSpecial: true,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('special character')
      }
    })

    it('should accept password meeting all requirements', () => {
      const result = validatePasswordStrength('SecureP@ss123!', {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecial: true,
      })

      expect(result.ok).toBe(true)
    })

    it('should report multiple violations', () => {
      const result = validatePasswordStrength('ab', {
        minLength: 8,
        requireUppercase: true,
        requireNumbers: true,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        // 应该包含多个错误
        expect(result.error.message).toContain('8 characters')
        expect(result.error.message).toContain('uppercase')
        expect(result.error.message).toContain('number')
      }
    })
  })
})
