/**
 * =============================================================================
 * @hai/crypto - SM4 国密对称加密算法
 * =============================================================================
 * 提供 SM4 分组密码算法实现
 * 
 * 主要功能:
 * - ECB 模式加密/解密
 * - CBC 模式加密/解密
 * - 支持 PKCS7 填充
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto has no type definitions
import { sm4 } from 'sm-crypto'

/**
 * SM4 加密模式
 */
export type SM4Mode = 'ecb' | 'cbc'

/**
 * SM4 加密选项
 */
export interface SM4Options {
    /** 加密模式 */
    mode?: SM4Mode
    /** IV 向量（CBC 模式必需） */
    iv?: string
    /** 输入编码 */
    inputEncoding?: 'utf8' | 'hex'
    /** 输出格式 */
    outputFormat?: 'hex' | 'base64'
}

/**
 * SM4 错误类型
 */
export type SM4ErrorType =
    | 'ENCRYPTION_FAILED'
    | 'DECRYPTION_FAILED'
    | 'INVALID_KEY'
    | 'INVALID_IV'
    | 'INVALID_INPUT'

/**
 * SM4 错误
 */
export interface SM4Error {
    type: SM4ErrorType
    message: string
}

/**
 * 生成随机 SM4 密钥
 * 
 * @returns 16 字节密钥（32 位十六进制字符串）
 */
export function generateKey(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * 生成随机 IV
 * 
 * @returns 16 字节 IV（32 位十六进制字符串）
 */
export function generateIV(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * SM4 加密
 * 
 * @param data - 要加密的数据
 * @param key - 密钥（16 字节十六进制字符串）
 * @param options - 加密选项
 * @returns 密文
 * 
 * @example
 * ```ts
 * // ECB 模式
 * const result = encrypt('hello', key)
 * 
 * // CBC 模式
 * const result = encrypt('hello', key, { mode: 'cbc', iv: generateIV() })
 * ```
 */
export function encrypt(
    data: string,
    key: string,
    options: SM4Options = {},
): Result<string, SM4Error> {
    const {
        mode = 'ecb',
        iv,
        inputEncoding = 'utf8',
        outputFormat = 'hex',
    } = options

    // 验证密钥
    if (!isValidKey(key)) {
        return err({
            type: 'INVALID_KEY',
            message: 'SM4 key must be 16 bytes (32 hex characters)',
        })
    }

    // CBC 模式需要 IV
    if (mode === 'cbc' && !iv) {
        return err({
            type: 'INVALID_IV',
            message: 'IV is required for CBC mode',
        })
    }

    if (mode === 'cbc' && iv && !isValidIV(iv)) {
        return err({
            type: 'INVALID_IV',
            message: 'SM4 IV must be 16 bytes (32 hex characters)',
        })
    }

    try {
        // 准备输入数据
        let input: string
        if (inputEncoding === 'utf8') {
            input = data
        }
        else {
            input = data
        }

        const sm4Options: Record<string, unknown> = {
            mode,
            padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
            sm4Options.iv = iv
        }

        const encrypted = sm4.encrypt(input, key, sm4Options)

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
}

/**
 * SM4 解密
 * 
 * @param ciphertext - 密文
 * @param key - 密钥（16 字节十六进制字符串）
 * @param options - 解密选项
 * @returns 明文
 * 
 * @example
 * ```ts
 * const result = decrypt(encrypted, key)
 * if (result.ok) {
 *   console.log('Decrypted:', result.value)
 * }
 * ```
 */
export function decrypt(
    ciphertext: string,
    key: string,
    options: SM4Options = {},
): Result<string, SM4Error> {
    const {
        mode = 'ecb',
        iv,
        outputFormat = 'hex',
    } = options

    // 验证密钥
    if (!isValidKey(key)) {
        return err({
            type: 'INVALID_KEY',
            message: 'SM4 key must be 16 bytes (32 hex characters)',
        })
    }

    // CBC 模式需要 IV
    if (mode === 'cbc' && !iv) {
        return err({
            type: 'INVALID_IV',
            message: 'IV is required for CBC mode',
        })
    }

    try {
        // 如果输入是 base64，先转换为 hex
        let hexCiphertext = ciphertext
        if (outputFormat === 'base64') {
            const buffer = Buffer.from(ciphertext, 'base64')
            hexCiphertext = buffer.toString('hex')
        }

        const sm4Options: Record<string, unknown> = {
            mode,
            padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
            sm4Options.iv = iv
        }

        const decrypted = sm4.decrypt(hexCiphertext, key, sm4Options)

        if (decrypted === null || decrypted === undefined) {
            return err({
                type: 'DECRYPTION_FAILED',
                message: 'SM4 decryption returned empty result',
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
}

/**
 * 验证密钥格式
 * 
 * @param key - 密钥
 * @returns 是否有效
 */
export function isValidKey(key: string): boolean {
    // SM4 密钥必须是 16 字节（32 个十六进制字符）
    if (!key) return false
    return /^[\da-f]{32}$/i.test(key)
}

/**
 * 验证 IV 格式
 * 
 * @param iv - IV 向量
 * @returns 是否有效
 */
export function isValidIV(iv: string): boolean {
    // SM4 IV 必须是 16 字节（32 个十六进制字符）
    if (!iv) return false
    return /^[\da-f]{32}$/i.test(iv)
}

/**
 * 使用密码派生 SM4 密钥
 * 
 * @param password - 密码
 * @param salt - 盐值（十六进制字符串）
 * @returns SM4 密钥
 */
export function deriveKey(password: string, salt: string): Result<string, SM4Error> {
    try {
        // 使用 SM3 派生密钥
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { sm3 } = require('sm-crypto')

        // 简单的 PBKDF：多轮哈希
        let key = password + salt
        for (let i = 0; i < 10000; i++) {
            key = sm3(key)
        }

        // 取前 32 个字符作为密钥
        return ok(key.substring(0, 32))
    }
    catch (error) {
        return err({
            type: 'INVALID_INPUT',
            message: `Key derivation failed: ${error}`,
        })
    }
}

/**
 * 加密数据并附带 IV（便捷函数）
 * 返回格式：IV + 密文
 * 
 * @param data - 要加密的数据
 * @param key - 密钥
 * @returns IV + 密文
 */
export function encryptWithIV(
    data: string,
    key: string,
): Result<string, SM4Error> {
    const iv = generateIV()
    const result = encrypt(data, key, { mode: 'cbc', iv })

    if (!result.isOk) {
        return result
    }

    // 返回 IV + 密文
    return ok(iv + result.unwrap())
}

/**
 * 解密带 IV 的数据（便捷函数）
 * 输入格式：IV + 密文
 * 
 * @param ciphertext - IV + 密文
 * @param key - 密钥
 * @returns 明文
 */
export function decryptWithIV(
    ciphertext: string,
    key: string,
): Result<string, SM4Error> {
    if (ciphertext.length < 32) {
        return err({
            type: 'INVALID_INPUT',
            message: 'Ciphertext too short (missing IV)',
        })
    }

    const iv = ciphertext.substring(0, 32)
    const data = ciphertext.substring(32)

    return decrypt(data, key, { mode: 'cbc', iv })
}
