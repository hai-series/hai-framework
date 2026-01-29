/**
 * =============================================================================
 * @hai/crypto - HAI SM2 Provider
 * =============================================================================
 * SM2 国密非对称加密算法实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  SM2EncryptOptions,
  SM2Error,
  SM2KeyPair,
  SM2Provider,
  SM2SignOptions,
} from '../../crypto-types.js'
import { err, ok } from '@hai/core'

// @ts-expect-error sm-crypto has no type definitions
import { sm2 } from 'sm-crypto'

/**
 * 创建 HAI SM2 Provider
 */
export function createHaiSM2Provider(): SM2Provider {
  return {
    generateKeyPair(): Result<SM2KeyPair, SM2Error> {
      try {
        const keyPair = sm2.generateKeyPairHex()
        return ok({
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
        })
      }
      catch (error) {
        return err({
          type: 'KEY_GENERATION_FAILED',
          message: `Failed to generate SM2 key pair: ${error}`,
        })
      }
    },

    encrypt(
      data: string,
      publicKey: string,
      options: SM2EncryptOptions = {},
    ): Result<string, SM2Error> {
      const { cipherMode = 1, outputFormat = 'hex' } = options

      try {
        const key = publicKey.startsWith('04') ? publicKey : `04${publicKey}`
        const encrypted = sm2.doEncrypt(data, key, cipherMode)

        if (!encrypted) {
          return err({
            type: 'ENCRYPTION_FAILED',
            message: 'SM2 encryption returned empty result',
          })
        }

        if (outputFormat === 'base64') {
          const buffer = Buffer.from(encrypted, 'hex')
          return ok(buffer.toString('base64'))
        }

        return ok(encrypted)
      }
      catch (error) {
        return err({
          type: 'ENCRYPTION_FAILED',
          message: `SM2 encryption failed: ${error}`,
        })
      }
    },

    decrypt(
      ciphertext: string,
      privateKey: string,
      options: SM2EncryptOptions = {},
    ): Result<string, SM2Error> {
      const { cipherMode = 1 } = options

      try {
        let input = ciphertext
        if (ciphertext.includes('+') || ciphertext.includes('/') || ciphertext.endsWith('=')) {
          input = Buffer.from(ciphertext, 'base64').toString('hex')
        }

        const decrypted = sm2.doDecrypt(input, privateKey, cipherMode)

        if (decrypted === false || decrypted === null || decrypted === undefined) {
          return err({
            type: 'DECRYPTION_FAILED',
            message: 'SM2 decryption failed or returned invalid result',
          })
        }

        return ok(decrypted)
      }
      catch (error) {
        return err({
          type: 'DECRYPTION_FAILED',
          message: `SM2 decryption failed: ${error}`,
        })
      }
    },

    sign(
      data: string,
      privateKey: string,
      options: SM2SignOptions = {},
    ): Result<string, SM2Error> {
      const { hash = true, userId = '1234567812345678' } = options

      try {
        const signature = sm2.doSignature(data, privateKey, { hash, userId })

        if (!signature) {
          return err({
            type: 'SIGN_FAILED',
            message: 'SM2 signature returned empty result',
          })
        }

        return ok(signature)
      }
      catch (error) {
        return err({
          type: 'SIGN_FAILED',
          message: `SM2 signature failed: ${error}`,
        })
      }
    },

    verify(
      data: string,
      signature: string,
      publicKey: string,
      options: SM2SignOptions = {},
    ): Result<boolean, SM2Error> {
      const { hash = true, userId = '1234567812345678' } = options

      try {
        const key = publicKey.startsWith('04') ? publicKey : `04${publicKey}`
        const isValid = sm2.doVerifySignature(data, signature, key, { hash, userId })
        return ok(!!isValid)
      }
      catch (error) {
        return err({
          type: 'VERIFY_FAILED',
          message: `SM2 verification failed: ${error}`,
        })
      }
    },

    isValidPublicKey(key: string): boolean {
      if (!key || typeof key !== 'string')
        return false
      const cleanKey = key.startsWith('04') ? key.slice(2) : key
      return /^[0-9a-f]{128}$/i.test(cleanKey)
    },

    isValidPrivateKey(key: string): boolean {
      if (!key || typeof key !== 'string')
        return false
      return /^[0-9a-f]{64}$/i.test(key)
    },
  }
}

export const haiSM2Provider = createHaiSM2Provider()
