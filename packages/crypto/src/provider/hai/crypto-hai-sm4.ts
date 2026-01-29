/**
 * =============================================================================
 * @hai/crypto - HAI SM4 Provider
 * =============================================================================
 * SM4 国密对称加密算法实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  SM4Error,
  SM4Options,
  SM4Provider,
} from '../../crypto-types.js'
import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto has no type definitions
import { sm4 } from 'sm-crypto'

// @ts-expect-error sm-crypto has no type definitions
import { sm3 } from 'sm-crypto'

/**
 * 创建 HAI SM4 Provider
 */
export function createHaiSM4Provider(): SM4Provider {
  return {
    generateKey(): string {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    },

    generateIV(): string {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    },

    encrypt(
      data: string,
      key: string,
      options: SM4Options = {},
    ): Result<string, SM4Error> {
      const {
        mode = 'ecb',
        iv,
        outputFormat = 'hex',
      } = options

      if (!this.isValidKey(key)) {
        return err({
          type: 'INVALID_KEY',
          message: 'SM4 key must be 16 bytes (32 hex characters)',
        })
      }

      if (mode === 'cbc' && !iv) {
        return err({
          type: 'INVALID_IV',
          message: 'IV is required for CBC mode',
        })
      }

      if (mode === 'cbc' && iv && !this.isValidIV(iv)) {
        return err({
          type: 'INVALID_IV',
          message: 'SM4 IV must be 16 bytes (32 hex characters)',
        })
      }

      try {
        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
          sm4Options.iv = iv
        }

        const encrypted = sm4.encrypt(data, key, sm4Options)

        if (!encrypted) {
          return err({
            type: 'ENCRYPTION_FAILED',
            message: 'SM4 encryption returned empty result',
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
          message: `SM4 encryption failed: ${error}`,
        })
      }
    },

    decrypt(
      ciphertext: string,
      key: string,
      options: SM4Options = {},
    ): Result<string, SM4Error> {
      const { mode = 'ecb', iv } = options

      if (!this.isValidKey(key)) {
        return err({
          type: 'INVALID_KEY',
          message: 'SM4 key must be 16 bytes (32 hex characters)',
        })
      }

      if (mode === 'cbc' && !iv) {
        return err({
          type: 'INVALID_IV',
          message: 'IV is required for CBC mode',
        })
      }

      try {
        let input = ciphertext
        if (ciphertext.includes('+') || ciphertext.includes('/') || ciphertext.endsWith('=')) {
          input = Buffer.from(ciphertext, 'base64').toString('hex')
        }

        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
          sm4Options.iv = iv
        }

        const decrypted = sm4.decrypt(input, key, sm4Options)

        if (decrypted === false || decrypted === null || decrypted === undefined) {
          return err({
            type: 'DECRYPTION_FAILED',
            message: 'SM4 decryption failed',
          })
        }

        return ok(decrypted)
      }
      catch (error) {
        return err({
          type: 'DECRYPTION_FAILED',
          message: `SM4 decryption failed: ${error}`,
        })
      }
    },

    encryptWithIV(
      data: string,
      key: string,
    ): Result<{ ciphertext: string, iv: string }, SM4Error> {
      const iv = this.generateIV()
      const result = this.encrypt(data, key, { mode: 'cbc', iv })

      if (!result.success) {
        return result as Result<never, SM4Error>
      }

      return ok({ ciphertext: result.data, iv })
    },

    decryptWithIV(
      ciphertext: string,
      key: string,
      iv: string,
    ): Result<string, SM4Error> {
      return this.decrypt(ciphertext, key, { mode: 'cbc', iv })
    },

    deriveKey(password: string, salt: string): string {
      const combined = password + salt
      const hash = sm3(combined)
      return hash.slice(0, 32)
    },

    isValidKey(key: string): boolean {
      return /^[0-9a-f]{32}$/i.test(key)
    },

    isValidIV(iv: string): boolean {
      return /^[0-9a-f]{32}$/i.test(iv)
    },
  }
}

export const haiSM4Provider = createHaiSM4Provider()
