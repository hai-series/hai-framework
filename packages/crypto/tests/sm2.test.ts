/**
 * =============================================================================
 * @hai/crypto - SM2 单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
    decrypt,
    encrypt,
    generateKeyPair,
    isValidPrivateKey,
    isValidPublicKey,
    sign,
    verify,
} from '../src/sm2.js'

describe('sm2', () => {
    describe('generateKeyPair', () => {
        it('should generate valid key pair', () => {
            const result = generateKeyPair()

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.publicKey).toBeDefined()
                expect(result.value.privateKey).toBeDefined()
                expect(isValidPublicKey(result.value.publicKey)).toBe(true)
                expect(isValidPrivateKey(result.value.privateKey)).toBe(true)
            }
        })

        it('should generate unique key pairs', () => {
            const result1 = generateKeyPair()
            const result2 = generateKeyPair()

            expect(result1.ok).toBe(true)
            expect(result2.ok).toBe(true)

            if (result1.ok && result2.ok) {
                expect(result1.value.publicKey).not.toBe(result2.value.publicKey)
                expect(result1.value.privateKey).not.toBe(result2.value.privateKey)
            }
        })
    })

    describe('encrypt/decrypt', () => {
        it('should encrypt and decrypt data', () => {
            const keyPairResult = generateKeyPair()
            expect(keyPairResult.ok).toBe(true)

            if (!keyPairResult.ok) return
            const { publicKey, privateKey } = keyPairResult.value

            const plaintext = 'Hello, SM2!'

            const encryptResult = encrypt(plaintext, publicKey)
            expect(encryptResult.ok).toBe(true)

            if (!encryptResult.ok) return
            const ciphertext = encryptResult.value

            // 密文应该不同于明文
            expect(ciphertext).not.toBe(plaintext)

            const decryptResult = decrypt(ciphertext, privateKey)
            expect(decryptResult.ok).toBe(true)

            if (decryptResult.ok) {
                expect(decryptResult.value).toBe(plaintext)
            }
        })

        it('should encrypt same data to different ciphertext', () => {
            const keyPairResult = generateKeyPair()
            expect(keyPairResult.ok).toBe(true)

            if (!keyPairResult.ok) return
            const { publicKey } = keyPairResult.value

            const plaintext = 'Same data'

            const result1 = encrypt(plaintext, publicKey)
            const result2 = encrypt(plaintext, publicKey)

            expect(result1.ok).toBe(true)
            expect(result2.ok).toBe(true)

            if (result1.ok && result2.ok) {
                // SM2 使用随机数，所以每次加密结果不同
                expect(result1.value).not.toBe(result2.value)
            }
        })

        it('should handle Chinese characters', () => {
            const keyPairResult = generateKeyPair()
            if (!keyPairResult.ok) return

            const { publicKey, privateKey } = keyPairResult.value
            const plaintext = '你好，世界！国密算法测试'

            const encryptResult = encrypt(plaintext, publicKey)
            expect(encryptResult.ok).toBe(true)

            if (!encryptResult.ok) return

            const decryptResult = decrypt(encryptResult.value, privateKey)
            expect(decryptResult.ok).toBe(true)

            if (decryptResult.ok) {
                expect(decryptResult.value).toBe(plaintext)
            }
        })

        it('should handle public key with 04 prefix', () => {
            const keyPairResult = generateKeyPair()
            if (!keyPairResult.ok) return

            const { publicKey, privateKey } = keyPairResult.value
            const publicKeyWith04 = publicKey.startsWith('04') ? publicKey : `04${publicKey}`

            const plaintext = 'Test with 04 prefix'

            const encryptResult = encrypt(plaintext, publicKeyWith04)
            expect(encryptResult.ok).toBe(true)

            if (!encryptResult.ok) return

            const decryptResult = decrypt(encryptResult.value, privateKey)
            expect(decryptResult.ok).toBe(true)

            if (decryptResult.ok) {
                expect(decryptResult.value).toBe(plaintext)
            }
        })
    })

    describe('sign/verify', () => {
        it('should sign and verify data', () => {
            const keyPairResult = generateKeyPair()
            if (!keyPairResult.ok) return

            const { publicKey, privateKey } = keyPairResult.value
            const data = 'Data to sign'

            const signResult = sign(data, privateKey)
            expect(signResult.ok).toBe(true)

            if (!signResult.ok) return
            const signature = signResult.value

            const verifyResult = verify(data, signature, publicKey)
            expect(verifyResult.ok).toBe(true)

            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(true)
            }
        })

        it('should fail verification with wrong data', () => {
            const keyPairResult = generateKeyPair()
            if (!keyPairResult.ok) return

            const { publicKey, privateKey } = keyPairResult.value

            const signResult = sign('Original data', privateKey)
            if (!signResult.ok) return

            const verifyResult = verify('Tampered data', signResult.value, publicKey)
            expect(verifyResult.ok).toBe(true)

            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(false)
            }
        })

        it('should fail verification with wrong key', () => {
            const keyPair1 = generateKeyPair()
            const keyPair2 = generateKeyPair()

            if (!keyPair1.ok || !keyPair2.ok) return

            const data = 'Data to sign'
            const signResult = sign(data, keyPair1.value.privateKey)

            if (!signResult.ok) return

            // 使用不同的公钥验证
            const verifyResult = verify(data, signResult.value, keyPair2.value.publicKey)
            expect(verifyResult.ok).toBe(true)

            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(false)
            }
        })
    })

    describe('key validation', () => {
        it('should validate correct public key', () => {
            const keyPairResult = generateKeyPair()
            if (!keyPairResult.ok) return

            expect(isValidPublicKey(keyPairResult.value.publicKey)).toBe(true)
        })

        it('should reject invalid public key', () => {
            expect(isValidPublicKey('')).toBe(false)
            expect(isValidPublicKey('invalid')).toBe(false)
            expect(isValidPublicKey('abc123')).toBe(false)
        })

        it('should validate correct private key', () => {
            const keyPairResult = generateKeyPair()
            if (!keyPairResult.ok) return

            expect(isValidPrivateKey(keyPairResult.value.privateKey)).toBe(true)
        })

        it('should reject invalid private key', () => {
            expect(isValidPrivateKey('')).toBe(false)
            expect(isValidPrivateKey('invalid')).toBe(false)
            expect(isValidPrivateKey('abc123')).toBe(false)
        })
    })
})
