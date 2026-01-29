/**
 * =============================================================================
 * @hai/core - 加密配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  Argon2ConfigSchema,
  CryptoConfigSchema,
  // 错误码
  CryptoErrorCode,
  // Schema
  CryptoProviderTypeSchema,
  SM2ConfigSchema,
  SM3ConfigSchema,
  SM4ConfigSchema,
} from '../../src/config/core-config-crypto.js'

describe('core-config-crypto', () => {
  describe('cryptoErrorCode', () => {
    it('应有正确的错误码范围 (6000-6999)', () => {
      expect(CryptoErrorCode.ENCRYPT_FAILED).toBe(6000)
      expect(CryptoErrorCode.DECRYPT_FAILED).toBe(6001)
      expect(CryptoErrorCode.SIGN_FAILED).toBe(6002)
      expect(CryptoErrorCode.VERIFY_FAILED).toBe(6003)
      expect(CryptoErrorCode.KEY_GENERATION_FAILED).toBe(6004)
      expect(CryptoErrorCode.INVALID_KEY).toBe(6005)
      expect(CryptoErrorCode.KEY_NOT_FOUND).toBe(6006)
      expect(CryptoErrorCode.HASH_FAILED).toBe(6007)
      expect(CryptoErrorCode.RANDOM_FAILED).toBe(6008)
      expect(CryptoErrorCode.ALGORITHM_NOT_SUPPORTED).toBe(6009)
    })
  })

  describe('cryptoProviderTypeSchema', () => {
    it('应接受有效的加密提供者类型', () => {
      const types = ['hai', 'native', 'custom']
      for (const type of types) {
        expect(CryptoProviderTypeSchema.parse(type)).toBe(type)
      }
    })

    it('应拒绝无效的类型', () => {
      expect(() => CryptoProviderTypeSchema.parse('invalid')).toThrow()
    })
  })

  describe('sM2ConfigSchema', () => {
    it('应使用默认值', () => {
      const result = SM2ConfigSchema.parse({})
      expect(result.enabled).toBe(true)
      expect(result.keyRotationInterval).toBe(24)
    })

    it('应接受完整配置', () => {
      const config = {
        enabled: true,
        keyRotationInterval: 48,
        publicKey: 'public-key-xxx',
        privateKey: 'private-key-xxx',
      }
      const result = SM2ConfigSchema.parse(config)
      expect(result.keyRotationInterval).toBe(48)
      expect(result.publicKey).toBe('public-key-xxx')
    })
  })

  describe('sM3ConfigSchema', () => {
    it('应使用默认值', () => {
      const result = SM3ConfigSchema.parse({})
      expect(result.enabled).toBe(true)
    })

    it('应接受 HMAC 密钥', () => {
      const config = {
        enabled: true,
        hmacKey: 'hmac-secret-key',
      }
      const result = SM3ConfigSchema.parse(config)
      expect(result.hmacKey).toBe('hmac-secret-key')
    })
  })

  describe('sM4ConfigSchema', () => {
    it('应使用默认值', () => {
      const result = SM4ConfigSchema.parse({})
      expect(result.enabled).toBe(true)
      expect(result.defaultMode).toBe('gcm')
    })

    it('应接受有效的加密模式', () => {
      const modes = ['ecb', 'cbc', 'cfb', 'ofb', 'ctr', 'gcm']
      for (const mode of modes) {
        const result = SM4ConfigSchema.parse({ defaultMode: mode })
        expect(result.defaultMode).toBe(mode)
      }
    })

    it('应拒绝无效的加密模式', () => {
      expect(() => SM4ConfigSchema.parse({ defaultMode: 'aes' })).toThrow()
    })
  })

  describe('argon2ConfigSchema', () => {
    it('应使用默认值', () => {
      const result = Argon2ConfigSchema.parse({})
      expect(result.memoryCost).toBe(65536)
      expect(result.timeCost).toBe(3)
      expect(result.parallelism).toBe(4)
      expect(result.hashLength).toBe(32)
    })

    it('应验证内存成本最小值', () => {
      expect(() => Argon2ConfigSchema.parse({ memoryCost: 512 })).toThrow()
      expect(Argon2ConfigSchema.parse({ memoryCost: 1024 }).memoryCost).toBe(1024)
    })

    it('应验证 hashLength 最小值', () => {
      expect(() => Argon2ConfigSchema.parse({ hashLength: 8 })).toThrow()
      expect(Argon2ConfigSchema.parse({ hashLength: 16 }).hashLength).toBe(16)
    })
  })

  describe('cryptoConfigSchema', () => {
    it('应使用默认值', () => {
      const result = CryptoConfigSchema.parse({})
      expect(result.provider).toBe('hai')
      // sm2, sm3, sm4 都是可选字段，默认为 undefined
      expect(result.preferGM).toBe(true)
    })

    it('应接受完整配置', () => {
      const config = {
        provider: 'native',
        sm2: { enabled: false },
        sm3: { enabled: true, hmacKey: 'key' },
        sm4: { enabled: true, defaultMode: 'cbc' },
        argon2: { memoryCost: 32768 },
      }
      const result = CryptoConfigSchema.parse(config)
      expect(result.provider).toBe('native')
      expect(result.sm2?.enabled).toBe(false)
      expect(result.sm4?.defaultMode).toBe('cbc')
    })
  })
})
