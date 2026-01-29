/**
 * =============================================================================
 * @hai/crypto - HAI Password Provider
 * =============================================================================
 * 密码哈希实现（Argon2id）
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import { argon2id } from '@noble/hashes/argon2.js'
import { randomBytes } from '@noble/hashes/utils.js'

import type {
    Argon2Options,
    PasswordError,
    PasswordProvider,
} from '../../crypto-types.js'

/**
 * 默认 Argon2 配置（遵循 OWASP 推荐）
 */
const DEFAULT_OPTIONS: Required<Argon2Options> = {
    memoryCost: 65536,  // 64 MB
    timeCost: 3,        // 3 次迭代
    parallelism: 4,     // 4 线程
    hashLength: 32,     // 32 字节输出
    saltLength: 16,     // 16 字节盐
}

/**
 * Base64 编码（URL 安全）
 */
function base64Encode(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Base64 解码（URL 安全）
 */
function base64Decode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return new Uint8Array(Buffer.from(padded, 'base64'))
}

/**
 * 创建 HAI Password Provider
 */
export function createHaiPasswordProvider(): PasswordProvider {
    return {
        hash(
            password: string,
            options: Argon2Options = {},
        ): Result<string, PasswordError> {
            const opts = { ...DEFAULT_OPTIONS, ...options }

            if (!password || password.length === 0) {
                return err({
                    type: 'INVALID_PASSWORD',
                    message: 'Password cannot be empty',
                })
            }

            try {
                const salt = randomBytes(opts.saltLength)
                const hash = argon2id(password, salt, {
                    t: opts.timeCost,
                    m: opts.memoryCost,
                    p: opts.parallelism,
                    dkLen: opts.hashLength,
                })

                // 构建 PHC 格式字符串
                const phcString = [
                    '$argon2id',
                    `$v=19`,
                    `$m=${opts.memoryCost},t=${opts.timeCost},p=${opts.parallelism}`,
                    `$${base64Encode(salt)}`,
                    `$${base64Encode(hash)}`,
                ].join('')

                return ok(phcString)
            }
            catch (error) {
                return err({
                    type: 'HASH_FAILED',
                    message: `Password hashing failed: ${error}`,
                })
            }
        },

        verify(password: string, hash: string): Result<boolean, PasswordError> {
            if (!password || password.length === 0) {
                return err({
                    type: 'INVALID_PASSWORD',
                    message: 'Password cannot be empty',
                })
            }

            try {
                // 解析 PHC 格式
                const parts = hash.split('$').filter(Boolean)
                if (parts.length < 5 || parts[0] !== 'argon2id') {
                    return err({
                        type: 'INVALID_HASH',
                        message: 'Invalid hash format',
                    })
                }

                const versionMatch = parts[1].match(/^v=(\d+)$/)
                if (!versionMatch) {
                    return err({
                        type: 'INVALID_HASH',
                        message: 'Invalid hash version',
                    })
                }

                const paramsMatch = parts[2].match(/^m=(\d+),t=(\d+),p=(\d+)$/)
                if (!paramsMatch) {
                    return err({
                        type: 'INVALID_HASH',
                        message: 'Invalid hash parameters',
                    })
                }

                const memoryCost = parseInt(paramsMatch[1], 10)
                const timeCost = parseInt(paramsMatch[2], 10)
                const parallelism = parseInt(paramsMatch[3], 10)

                const salt = base64Decode(parts[3])
                const expectedHash = base64Decode(parts[4])

                const computedHash = argon2id(password, salt, {
                    t: timeCost,
                    m: memoryCost,
                    p: parallelism,
                    dkLen: expectedHash.length,
                })

                // 常量时间比较
                if (computedHash.length !== expectedHash.length) {
                    return ok(false)
                }

                let result = 0
                for (let i = 0; i < computedHash.length; i++) {
                    result |= computedHash[i] ^ expectedHash[i]
                }

                return ok(result === 0)
            }
            catch (error) {
                return err({
                    type: 'VERIFY_FAILED',
                    message: `Password verification failed: ${error}`,
                })
            }
        },

        needsRehash(hash: string, options: Argon2Options = {}): boolean {
            const opts = { ...DEFAULT_OPTIONS, ...options }

            try {
                const parts = hash.split('$').filter(Boolean)
                if (parts.length < 5 || parts[0] !== 'argon2id') {
                    return true
                }

                const paramsMatch = parts[2].match(/^m=(\d+),t=(\d+),p=(\d+)$/)
                if (!paramsMatch) {
                    return true
                }

                const memoryCost = parseInt(paramsMatch[1], 10)
                const timeCost = parseInt(paramsMatch[2], 10)
                const parallelism = parseInt(paramsMatch[3], 10)

                return (
                    memoryCost < opts.memoryCost
                    || timeCost < opts.timeCost
                    || parallelism !== opts.parallelism
                )
            }
            catch {
                return true
            }
        },
    }
}

export const haiPasswordProvider = createHaiPasswordProvider()
