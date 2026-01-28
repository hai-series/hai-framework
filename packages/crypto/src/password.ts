/**
 * =============================================================================
 * @hai/crypto - 密码哈希
 * =============================================================================
 * 提供安全的密码哈希功能
 * 
 * 使用 Argon2id 算法（推荐用于密码哈希）
 * 通过 @noble/hashes 实现，纯 JavaScript，无需原生依赖
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import { argon2id } from '@noble/hashes/argon2'
import { randomBytes } from '@noble/hashes/utils'

/**
 * Argon2 配置选项
 */
export interface Argon2Options {
    /** 内存成本（KB） */
    memoryCost?: number
    /** 时间成本（迭代次数） */
    timeCost?: number
    /** 并行度 */
    parallelism?: number
    /** 输出长度（字节） */
    hashLength?: number
    /** 盐长度（字节） */
    saltLength?: number
}

/**
 * 默认 Argon2 配置
 * 遵循 OWASP 推荐
 */
const DEFAULT_OPTIONS: Required<Argon2Options> = {
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 次迭代
    parallelism: 4, // 4 线程
    hashLength: 32, // 32 字节输出
    saltLength: 16, // 16 字节盐
}

/**
 * 密码哈希错误类型
 */
export type PasswordErrorType =
    | 'HASH_FAILED'
    | 'VERIFY_FAILED'
    | 'INVALID_HASH'
    | 'INVALID_PASSWORD'

/**
 * 密码哈希错误
 */
export interface PasswordError {
    type: PasswordErrorType
    message: string
}

/**
 * 哈希密码
 * 
 * @param password - 明文密码
 * @param options - Argon2 配置
 * @returns PHC 格式的哈希字符串
 * 
 * @example
 * ```ts
 * const result = hashPassword('user-password')
 * if (result.ok) {
 *   // 存储 result.value 到数据库
 *   console.log(result.value)
 *   // $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
 * }
 * ```
 */
export function hashPassword(
    password: string,
    options: Argon2Options = {},
): Result<string, PasswordError> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // 验证密码
    if (!password || password.length === 0) {
        return err({
            type: 'INVALID_PASSWORD',
            message: 'Password cannot be empty',
        })
    }

    try {
        // 生成随机盐
        const salt = randomBytes(opts.saltLength)

        // 计算 Argon2id 哈希
        const hash = argon2id(password, salt, {
            t: opts.timeCost,
            m: opts.memoryCost,
            p: opts.parallelism,
            dkLen: opts.hashLength,
        })

        // 格式化为 PHC 字符串
        const phc = formatPHC({
            algorithm: 'argon2id',
            version: 19,
            params: {
                m: opts.memoryCost,
                t: opts.timeCost,
                p: opts.parallelism,
            },
            salt,
            hash,
        })

        return ok(phc)
    }
    catch (error) {
        return err({
            type: 'HASH_FAILED',
            message: `Password hashing failed: ${error}`,
        })
    }
}

/**
 * 验证密码
 * 
 * @param password - 明文密码
 * @param hash - PHC 格式的哈希字符串
 * @returns 是否匹配
 * 
 * @example
 * ```ts
 * const result = verifyPassword('user-password', storedHash)
 * if (result.ok && result.value) {
 *   console.log('Password is correct')
 * }
 * ```
 */
export function verifyPassword(
    password: string,
    hash: string,
): Result<boolean, PasswordError> {
    try {
        // 解析 PHC 字符串
        const parsed = parsePHC(hash)

        if (!parsed) {
            return err({
                type: 'INVALID_HASH',
                message: 'Invalid PHC hash format',
            })
        }

        // 使用相同参数计算哈希
        const computedHash = argon2id(password, parsed.salt, {
            t: parsed.params.t,
            m: parsed.params.m,
            p: parsed.params.p,
            dkLen: parsed.hash.length,
        })

        // 常量时间比较
        const isMatch = constantTimeEqual(computedHash, parsed.hash)

        return ok(isMatch)
    }
    catch (error) {
        return err({
            type: 'VERIFY_FAILED',
            message: `Password verification failed: ${error}`,
        })
    }
}

/**
 * 检查哈希是否需要重新计算
 * 当参数配置更新时，旧的哈希可能需要重新计算
 * 
 * @param hash - PHC 格式的哈希字符串
 * @param options - 当前的 Argon2 配置
 * @returns 是否需要重新哈希
 */
export function needsRehash(
    hash: string,
    options: Argon2Options = {},
): boolean {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    try {
        const parsed = parsePHC(hash)

        if (!parsed) {
            return true
        }

        // 检查参数是否与当前配置匹配
        return (
            parsed.params.m !== opts.memoryCost
            || parsed.params.t !== opts.timeCost
            || parsed.params.p !== opts.parallelism
        )
    }
    catch {
        return true
    }
}

/**
 * PHC 格式数据
 */
interface PHCData {
    algorithm: string
    version: number
    params: {
        m: number
        t: number
        p: number
    }
    salt: Uint8Array
    hash: Uint8Array
}

/**
 * 格式化为 PHC 字符串
 * PHC 格式: $algorithm$v=version$params$salt$hash
 */
function formatPHC(data: PHCData): string {
    const { algorithm, version, params, salt, hash } = data

    const paramsStr = `m=${params.m},t=${params.t},p=${params.p}`
    const saltB64 = Buffer.from(salt).toString('base64url')
    const hashB64 = Buffer.from(hash).toString('base64url')

    return `$${algorithm}$v=${version}$${paramsStr}$${saltB64}$${hashB64}`
}

/**
 * 解析 PHC 字符串
 */
function parsePHC(phc: string): PHCData | null {
    // $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    const parts = phc.split('$')

    if (parts.length !== 6) {
        return null
    }

    const [, algorithm, versionStr, paramsStr, saltB64, hashB64] = parts

    if (algorithm !== 'argon2id') {
        return null
    }

    // 解析版本
    const versionMatch = versionStr.match(/^v=(\d+)$/)
    if (!versionMatch) {
        return null
    }
    const version = Number.parseInt(versionMatch[1], 10)

    // 解析参数
    const params: Record<string, number> = {}
    for (const param of paramsStr.split(',')) {
        const [key, value] = param.split('=')
        params[key] = Number.parseInt(value, 10)
    }

    if (!params.m || !params.t || !params.p) {
        return null
    }

    // 解码盐和哈希
    const salt = new Uint8Array(Buffer.from(saltB64, 'base64url'))
    const hash = new Uint8Array(Buffer.from(hashB64, 'base64url'))

    return {
        algorithm,
        version,
        params: {
            m: params.m,
            t: params.t,
            p: params.p,
        },
        salt,
        hash,
    }
}

/**
 * 常量时间比较
 * 防止时序攻击
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i]
    }

    return result === 0
}

/**
 * 验证密码强度
 * 
 * @param password - 密码
 * @param policy - 密码策略
 * @returns 验证结果
 */
export function validatePasswordStrength(
    password: string,
    policy: {
        minLength?: number
        maxLength?: number
        requireUppercase?: boolean
        requireLowercase?: boolean
        requireNumbers?: boolean
        requireSpecial?: boolean
    } = {},
): Result<true, PasswordError> {
    const {
        minLength = 8,
        maxLength = 72,
        requireUppercase = false,
        requireLowercase = false,
        requireNumbers = false,
        requireSpecial = false,
    } = policy

    const errors: string[] = []

    if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters`)
    }

    if (password.length > maxLength) {
        errors.push(`Password must be at most ${maxLength} characters`)
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter')
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter')
    }

    if (requireNumbers && !/\d/.test(password)) {
        errors.push('Password must contain at least one number')
    }

    if (requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        errors.push('Password must contain at least one special character')
    }

    if (errors.length > 0) {
        return err({
            type: 'INVALID_PASSWORD',
            message: errors.join('; '),
        })
    }

    return ok(true)
}
