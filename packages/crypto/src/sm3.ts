/**
 * =============================================================================
 * @hai/crypto - SM3 国密哈希算法
 * =============================================================================
 * 提供 SM3 密码杂凑算法实现
 * 
 * 主要功能:
 * - 数据哈希
 * - HMAC-SM3
 * - 文件哈希
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto has no type definitions
import { sm3 } from 'sm-crypto'

/**
 * SM3 哈希选项
 */
export interface SM3Options {
    /** 输入编码 */
    inputEncoding?: 'utf8' | 'hex'
    /** 输出格式 */
    outputFormat?: 'hex' | 'buffer'
}

/**
 * SM3 HMAC 选项
 */
export interface SM3HmacOptions extends SM3Options {
    /** HMAC 密钥 */
    key: string
}

/**
 * SM3 错误类型
 */
export type SM3ErrorType = 'HASH_FAILED' | 'HMAC_FAILED' | 'INVALID_INPUT'

/**
 * SM3 错误
 */
export interface SM3Error {
    type: SM3ErrorType
    message: string
}

/**
 * 计算 SM3 哈希
 * 
 * @param data - 要哈希的数据
 * @param options - 哈希选项
 * @returns 哈希值
 * 
 * @example
 * ```ts
 * const result = hash('hello world')
 * if (result.ok) {
 *   console.log('Hash:', result.value) // 64 位十六进制字符串
 * }
 * ```
 */
export function hash(
    data: string | Uint8Array,
    options: SM3Options = {},
): Result<string, SM3Error> {
    const { outputFormat = 'hex' } = options

    try {
        let input: string

        if (data instanceof Uint8Array) {
            // 将 Uint8Array 转换为十六进制字符串
            input = Array.from(data)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
        }
        else {
            input = data
        }

        const result = sm3(input)

        if (!result) {
            return err({
                type: 'HASH_FAILED',
                message: 'SM3 hash returned empty result',
            })
        }

        if (outputFormat === 'buffer') {
            // 返回十六进制字符串，调用方可以自行转换
            return ok(result)
        }

        return ok(result)
    }
    catch (error) {
        return err({
            type: 'HASH_FAILED',
            message: `SM3 hash failed: ${error}`,
        })
    }
}

/**
 * 计算 HMAC-SM3
 * 
 * @param data - 要哈希的数据
 * @param key - HMAC 密钥
 * @returns HMAC 值
 * 
 * @example
 * ```ts
 * const result = hmac('data', 'secret-key')
 * if (result.ok) {
 *   console.log('HMAC:', result.value)
 * }
 * ```
 */
export function hmac(data: string, key: string): Result<string, SM3Error> {
    try {
        // HMAC 实现: HMAC(K, M) = H((K ⊕ opad) || H((K ⊕ ipad) || M))
        const blockSize = 64 // SM3 块大小
        const opad = 0x5C
        const ipad = 0x36

        // 处理密钥
        let keyBytes: number[]
        if (key.length > blockSize) {
            // 如果密钥太长，先哈希
            const hashedKey = sm3(key)
            keyBytes = hexToBytes(hashedKey)
        }
        else {
            keyBytes = Array.from(Buffer.from(key, 'utf8'))
        }

        // 填充密钥到块大小
        while (keyBytes.length < blockSize) {
            keyBytes.push(0)
        }

        // 计算 K ⊕ ipad 和 K ⊕ opad
        const iKeyPad = keyBytes.map(b => b ^ ipad)
        const oKeyPad = keyBytes.map(b => b ^ opad)

        // 计算内部哈希: H((K ⊕ ipad) || M)
        const innerData = bytesToHex(iKeyPad) + bytesToHex(Array.from(Buffer.from(data, 'utf8')))
        const innerHash = sm3(innerData)

        // 计算外部哈希: H((K ⊕ opad) || innerHash)
        const outerData = bytesToHex(oKeyPad) + innerHash
        const result = sm3(outerData)

        return ok(result)
    }
    catch (error) {
        return err({
            type: 'HMAC_FAILED',
            message: `HMAC-SM3 failed: ${error}`,
        })
    }
}

/**
 * 验证哈希值是否匹配
 * 
 * @param data - 原始数据
 * @param expectedHash - 期望的哈希值
 * @returns 是否匹配
 */
export function verify(data: string, expectedHash: string): boolean {
    const result = hash(data)
    if (!result.ok) return false

    // 使用常量时间比较防止时序攻击
    return constantTimeEqual(result.value, expectedHash)
}

/**
 * 常量时间字符串比较
 * 防止时序攻击
 */
function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false

    let result = 0
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return result === 0
}

/**
 * 十六进制字符串转字节数组
 */
function hexToBytes(hex: string): number[] {
    const bytes: number[] = []
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(Number.parseInt(hex.substring(i, i + 2), 16))
    }
    return bytes
}

/**
 * 字节数组转十六进制字符串
 */
function bytesToHex(bytes: number[]): string {
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 计算流式数据的 SM3 哈希
 * 适用于大文件或流式数据
 * 
 * @returns 流式哈希计算器
 */
export function createHasher(): SM3Hasher {
    return new SM3Hasher()
}

/**
 * SM3 流式哈希计算器
 */
export class SM3Hasher {
    private chunks: string[] = []

    /**
     * 添加数据块
     */
    update(data: string | Uint8Array): this {
        if (data instanceof Uint8Array) {
            this.chunks.push(
                Array.from(data)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(''),
            )
        }
        else {
            this.chunks.push(
                Array.from(Buffer.from(data, 'utf8'))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(''),
            )
        }
        return this
    }

    /**
     * 计算最终哈希
     */
    digest(): Result<string, SM3Error> {
        try {
            const combined = this.chunks.join('')
            return ok(sm3(combined))
        }
        catch (error) {
            return err({
                type: 'HASH_FAILED',
                message: `SM3 digest failed: ${error}`,
            })
        }
    }

    /**
     * 重置哈希器
     */
    reset(): this {
        this.chunks = []
        return this
    }
}
