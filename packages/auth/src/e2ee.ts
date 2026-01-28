/**
 * =============================================================================
 * @hai/auth - E2EE 登录流程
 * =============================================================================
 * 实现端到端加密的登录流程
 * 
 * 流程:
 * 1. 客户端请求 SM2 公钥
 * 2. 客户端使用公钥加密密码
 * 3. 服务端使用私钥解密
 * 4. 服务端使用 Argon2 验证密码
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import {
    sm2Decrypt,
    sm2Encrypt,
    sm2GenerateKeyPair,
    sm2IsValidPublicKey,
    hashPassword,
    verifyPassword,
    validatePasswordStrength,
    type SM2KeyPair,
} from '@hai/crypto'

const logger = createLogger({ name: 'auth-e2ee' })

/**
 * E2EE 错误类型
 */
export type E2EEErrorType =
    | 'KEY_GENERATION_FAILED'
    | 'ENCRYPTION_FAILED'
    | 'DECRYPTION_FAILED'
    | 'VERIFICATION_FAILED'
    | 'INVALID_CREDENTIALS'
    | 'PASSWORD_POLICY_VIOLATION'

/**
 * E2EE 错误
 */
export interface E2EEError {
    type: E2EEErrorType
    message: string
}

/**
 * 密码策略
 */
export interface PasswordPolicy {
    /** 最小长度 */
    minLength?: number
    /** 最大长度 */
    maxLength?: number
    /** 是否要求大写字母 */
    requireUppercase?: boolean
    /** 是否要求小写字母 */
    requireLowercase?: boolean
    /** 是否要求数字 */
    requireNumbers?: boolean
    /** 是否要求特殊字符 */
    requireSpecial?: boolean
}

/**
 * E2EE 登录管理器
 * 管理 SM2 密钥对和加密登录流程
 */
export class E2EELoginManager {
    private keyPair: SM2KeyPair | null = null
    private keyRotationInterval: number
    private lastKeyRotation: Date | null = null

    constructor(options: { keyRotationInterval?: number } = {}) {
        // 默认每 24 小时轮换密钥
        this.keyRotationInterval = options.keyRotationInterval ?? 24 * 60 * 60 * 1000
    }

    /**
     * 获取或生成公钥
     * 用于下发给客户端
     */
    getPublicKey(): Result<string, E2EEError> {
        // 检查是否需要轮换密钥
        if (this.shouldRotateKey()) {
            const rotateResult = this.rotateKey()
            if (!rotateResult.ok) {
                return rotateResult
            }
        }

        if (!this.keyPair) {
            return err({
                type: 'KEY_GENERATION_FAILED',
                message: 'Key pair not initialized',
            })
        }

        return ok(this.keyPair.publicKey)
    }

    /**
     * 轮换密钥对
     */
    rotateKey(): Result<string, E2EEError> {
        const result = sm2GenerateKeyPair()

        if (!result.ok) {
            logger.error({ error: result.error }, 'Failed to generate SM2 key pair')
            return err({
                type: 'KEY_GENERATION_FAILED',
                message: 'Failed to generate key pair',
            })
        }

        this.keyPair = result.value
        this.lastKeyRotation = new Date()

        logger.info('SM2 key pair rotated')

        return ok(this.keyPair.publicKey)
    }

    /**
     * 检查是否需要轮换密钥
     */
    private shouldRotateKey(): boolean {
        if (!this.keyPair || !this.lastKeyRotation) {
            return true
        }

        const elapsed = Date.now() - this.lastKeyRotation.getTime()
        return elapsed >= this.keyRotationInterval
    }

    /**
     * 解密客户端发送的加密密码
     * 
     * @param encryptedPassword - SM2 加密的密码
     */
    decryptPassword(encryptedPassword: string): Result<string, E2EEError> {
        if (!this.keyPair) {
            return err({
                type: 'DECRYPTION_FAILED',
                message: 'Key pair not initialized',
            })
        }

        const result = sm2Decrypt(encryptedPassword, this.keyPair.privateKey)

        if (!result.ok) {
            logger.warn('Failed to decrypt password')
            return err({
                type: 'DECRYPTION_FAILED',
                message: 'Failed to decrypt password',
            })
        }

        return ok(result.value)
    }

    /**
     * 客户端加密密码
     * 通常在客户端执行，这里提供服务端实现用于测试
     * 
     * @param password - 明文密码
     * @param publicKey - 服务端公钥
     */
    static encryptPassword(password: string, publicKey: string): Result<string, E2EEError> {
        if (!sm2IsValidPublicKey(publicKey)) {
            return err({
                type: 'ENCRYPTION_FAILED',
                message: 'Invalid public key',
            })
        }

        const result = sm2Encrypt(password, publicKey)

        if (!result.ok) {
            return err({
                type: 'ENCRYPTION_FAILED',
                message: 'Failed to encrypt password',
            })
        }

        return ok(result.value)
    }
}

/**
 * 密码服务
 * 处理密码哈希和验证
 */
export class PasswordService {
    private policy: PasswordPolicy

    constructor(policy: PasswordPolicy = {}) {
        this.policy = {
            minLength: 8,
            maxLength: 72,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecial: false,
            ...policy,
        }
    }

    /**
     * 验证密码是否符合策略
     * 
     * @param password - 明文密码
     */
    validatePolicy(password: string): Result<true, E2EEError> {
        const result = validatePasswordStrength(password, this.policy)

        if (!result.ok) {
            return err({
                type: 'PASSWORD_POLICY_VIOLATION',
                message: result.error.message,
            })
        }

        return ok(true)
    }

    /**
     * 哈希密码
     * 
     * @param password - 明文密码
     * @returns Argon2 哈希
     */
    hashPassword(password: string): Result<string, E2EEError> {
        // 先验证策略
        const validateResult = this.validatePolicy(password)
        if (!validateResult.ok) {
            return validateResult as Result<string, E2EEError>
        }

        const result = hashPassword(password)

        if (!result.ok) {
            logger.error({ error: result.error }, 'Failed to hash password')
            return err({
                type: 'VERIFICATION_FAILED',
                message: 'Failed to hash password',
            })
        }

        return ok(result.value)
    }

    /**
     * 验证密码
     * 
     * @param password - 明文密码
     * @param hash - 存储的 Argon2 哈希
     */
    verifyPassword(password: string, hash: string): Result<boolean, E2EEError> {
        const result = verifyPassword(password, hash)

        if (!result.ok) {
            logger.warn('Password verification failed')
            return err({
                type: 'VERIFICATION_FAILED',
                message: 'Password verification failed',
            })
        }

        return ok(result.value)
    }

    /**
     * E2EE 登录验证
     * 完整的端到端加密登录流程
     * 
     * @param encryptedPassword - SM2 加密的密码
     * @param storedHash - 数据库中存储的密码哈希
     * @param e2eeManager - E2EE 登录管理器
     */
    async verifyE2EELogin(
        encryptedPassword: string,
        storedHash: string,
        e2eeManager: E2EELoginManager,
    ): Promise<Result<boolean, E2EEError>> {
        // 1. 解密密码
        const decryptResult = e2eeManager.decryptPassword(encryptedPassword)
        if (!decryptResult.ok) {
            return decryptResult as Result<boolean, E2EEError>
        }

        const plainPassword = decryptResult.value

        // 2. 验证密码
        const verifyResult = this.verifyPassword(plainPassword, storedHash)

        return verifyResult
    }
}

/**
 * 创建 E2EE 登录管理器
 */
export function createE2EELoginManager(
    options?: { keyRotationInterval?: number },
): E2EELoginManager {
    return new E2EELoginManager(options)
}

/**
 * 创建密码服务
 */
export function createPasswordService(policy?: PasswordPolicy): PasswordService {
    return new PasswordService(policy)
}
