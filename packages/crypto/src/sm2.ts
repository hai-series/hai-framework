/**
 * =============================================================================
 * @hai/crypto - SM2 国密非对称加密算法
 * =============================================================================
 * 提供 SM2 椭圆曲线公钥密码算法实现
 * 
 * 主要功能:
 * - 密钥对生成
 * - 数据加密/解密
 * - 数字签名/验签
 * 
 * 用于 E2EE 登录流程:
 * 1. 服务端生成 SM2 密钥对，公钥下发给客户端
 * 2. 客户端使用公钥加密密码
 * 3. 服务端使用私钥解密
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto has no type definitions
import { sm2 } from 'sm-crypto'

/**
 * SM2 密钥对
 */
export interface SM2KeyPair {
    /** 公钥（十六进制字符串） */
    publicKey: string
    /** 私钥（十六进制字符串） */
    privateKey: string
}

/**
 * SM2 加密选项
 */
export interface SM2EncryptOptions {
    /** 密文模式：C1C3C2 (国标) 或 C1C2C3 (旧版) */
    cipherMode?: 0 | 1
    /** 输出格式 */
    outputFormat?: 'hex' | 'base64'
}

/**
 * SM2 签名选项
 */
export interface SM2SignOptions {
    /** 哈希算法 */
    hash?: boolean
    /** 用户ID（默认 "1234567812345678"） */
    userId?: string
    /** 输出格式 */
    outputFormat?: 'hex' | 'der'
}

/**
 * SM2 错误类型
 */
export type SM2ErrorType =
    | 'KEY_GENERATION_FAILED'
    | 'ENCRYPTION_FAILED'
    | 'DECRYPTION_FAILED'
    | 'SIGN_FAILED'
    | 'VERIFY_FAILED'
    | 'INVALID_KEY'

/**
 * SM2 错误
 */
export interface SM2Error {
    type: SM2ErrorType
    message: string
}

/**
 * 生成 SM2 密钥对
 * 
 * @returns 密钥对
 * 
 * @example
 * ```ts
 * const result = generateKeyPair()
 * if (result.ok) {
 *   console.log('Public Key:', result.value.publicKey)
 *   console.log('Private Key:', result.value.privateKey)
 * }
 * ```
 */
export function generateKeyPair(): Result<SM2KeyPair, SM2Error> {
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
}

/**
 * 使用公钥加密数据
 * 
 * @param data - 要加密的数据
 * @param publicKey - 公钥（十六进制字符串）
 * @param options - 加密选项
 * @returns 密文
 * 
 * @example
 * ```ts
 * const result = encrypt('password123', publicKey)
 * if (result.ok) {
 *   console.log('Encrypted:', result.value)
 * }
 * ```
 */
export function encrypt(
    data: string,
    publicKey: string,
    options: SM2EncryptOptions = {},
): Result<string, SM2Error> {
    const { cipherMode = 1, outputFormat = 'hex' } = options

    try {
        // 确保公钥格式正确
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
}

/**
 * 使用私钥解密数据
 * 
 * @param ciphertext - 密文
 * @param privateKey - 私钥（十六进制字符串）
 * @param options - 解密选项
 * @returns 明文
 * 
 * @example
 * ```ts
 * const result = decrypt(encrypted, privateKey)
 * if (result.ok) {
 *   console.log('Decrypted:', result.value)
 * }
 * ```
 */
export function decrypt(
    ciphertext: string,
    privateKey: string,
    options: SM2EncryptOptions = {},
): Result<string, SM2Error> {
    const { cipherMode = 1, outputFormat = 'hex' } = options

    try {
        // 如果输入是 base64，先转换为 hex
        let hexCiphertext = ciphertext
        if (outputFormat === 'base64') {
            const buffer = Buffer.from(ciphertext, 'base64')
            hexCiphertext = buffer.toString('hex')
        }

        const decrypted = sm2.doDecrypt(hexCiphertext, privateKey, cipherMode)

        if (!decrypted) {
            return err({
                type: 'DECRYPTION_FAILED',
                message: 'SM2 decryption returned empty result',
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
}

/**
 * 使用私钥签名数据
 * 
 * @param data - 要签名的数据
 * @param privateKey - 私钥
 * @param options - 签名选项
 * @returns 签名值
 * 
 * @example
 * ```ts
 * const result = sign('data to sign', privateKey)
 * if (result.ok) {
 *   console.log('Signature:', result.value)
 * }
 * ```
 */
export function sign(
    data: string,
    privateKey: string,
    options: SM2SignOptions = {},
): Result<string, SM2Error> {
    const { hash = true, userId } = options

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
}

/**
 * 使用公钥验证签名
 * 
 * @param data - 原始数据
 * @param signature - 签名值
 * @param publicKey - 公钥
 * @param options - 验签选项
 * @returns 验签结果
 * 
 * @example
 * ```ts
 * const result = verify('data to verify', signature, publicKey)
 * if (result.ok && result.value) {
 *   console.log('Signature is valid')
 * }
 * ```
 */
export function verify(
    data: string,
    signature: string,
    publicKey: string,
    options: SM2SignOptions = {},
): Result<boolean, SM2Error> {
    const { hash = true, userId } = options

    try {
        // 确保公钥格式正确
        const key = publicKey.startsWith('04') ? publicKey : `04${publicKey}`

        const isValid = sm2.doVerifySignature(data, signature, key, { hash, userId })
        return ok(isValid)
    }
    catch (error) {
        return err({
            type: 'VERIFY_FAILED',
            message: `SM2 verification failed: ${error}`,
        })
    }
}

/**
 * 验证公钥格式是否正确
 * 
 * @param publicKey - 公钥
 * @returns 是否有效
 */
export function isValidPublicKey(publicKey: string): boolean {
    // SM2 公钥应该是 130 个十六进制字符 (04 + 64字节)
    // 或者 128 个十六进制字符 (不带 04 前缀)
    if (!publicKey) return false

    const normalized = publicKey.startsWith('04') ? publicKey.slice(2) : publicKey
    return /^[\da-f]{128}$/i.test(normalized)
}

/**
 * 验证私钥格式是否正确
 * 
 * @param privateKey - 私钥
 * @returns 是否有效
 */
export function isValidPrivateKey(privateKey: string): boolean {
    // SM2 私钥应该是 64 个十六进制字符 (32字节)
    if (!privateKey) return false
    return /^[\da-f]{64}$/i.test(privateKey)
}
