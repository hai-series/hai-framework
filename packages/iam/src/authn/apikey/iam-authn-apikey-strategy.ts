/**
 * @h-ai/iam — API Key 认证策略
 *
 * 基于 API Key 的无状态认证方式，适用于服务间调用、CI/CD 等场景。
 * @module iam-authn-apikey-strategy
 */

import type { Result } from '@h-ai/core'
import type { ApiKeyConfig } from '../../iam-config.js'
import type { IamError } from '../../iam-types.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import type { ApiKeyRepository } from './iam-authn-apikey-repository.js'
import type { ApiKey, ApiKeyOperations, CreateApiKeyOptions, CreateApiKeyResult } from './iam-authn-apikey-types.js'
import { randomBytes } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'

import { ApiKeyConfigSchema, IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { toUser } from '../../user/iam-user-utils.js'
import { ensureCredentialType } from '../iam-authn-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'apikey-strategy' })

/**
 * API Key 策略配置
 */
export interface ApiKeyStrategyConfig {
  /** API Key 配置 */
  apikeyConfig?: ApiKeyConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** API Key 存储 */
  apiKeyRepository: ApiKeyRepository
}

/**
 * API Key 策略工厂返回值
 */
export interface ApiKeyStrategyResult {
  /** 认证策略（用于通用登录流程） */
  strategy: AuthStrategy
  /** API Key 管理操作（用于 CRUD） */
  apiKeyFunctions: ApiKeyOperations
}

/**
 * API Key 的前缀长度（用于存储和快速匹配）
 *
 * 例如密钥为 'hai_abc123def456...' 时，前缀为 'hai_abc123de'
 */
const KEY_PREFIX_LENGTH = 12

/**
 * 生成随机 API Key
 *
 * 格式：{prefix}{randomHex}，总长度约 48 字符
 */
function generateRawKey(prefix: string): string {
  const hex = randomBytes(32).toString('hex')
  return `${prefix}${hex}`
}

/**
 * 从明文 API Key 中提取前缀（用于数据库索引匹配）
 */
function extractKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, KEY_PREFIX_LENGTH)
}

/**
 * 将 StoredApiKey 转换为对外展示的 ApiKey（去除 keyHash）
 */
function toApiKey(stored: { id: string, userId: string, name: string, keyPrefix: string, enabled: boolean, expiresAt: Date | null, createdAt: Date, lastUsedAt: Date | null, scopes: string[] }): ApiKey {
  return {
    id: stored.id,
    userId: stored.userId,
    name: stored.name,
    keyPrefix: stored.keyPrefix,
    enabled: stored.enabled,
    expiresAt: stored.expiresAt,
    createdAt: stored.createdAt,
    lastUsedAt: stored.lastUsedAt,
    scopes: stored.scopes,
  }
}

/**
 * 创建 API Key 认证策略及管理操作
 */
export function createApiKeyStrategy(config: ApiKeyStrategyConfig): ApiKeyStrategyResult {
  const apikeyConfig = config.apikeyConfig
    ? ApiKeyConfigSchema.parse(config.apikeyConfig)
    : ApiKeyConfigSchema.parse({})

  const { userRepository, apiKeyRepository } = config
  const passwordOps = haiCrypto.password

  /**
   * 内部：验证明文 API Key 并返回 ApiKey 实体
   */
  async function verifyRawKey(rawKey: string): Promise<Result<ApiKey, IamError>> {
    const prefix = extractKeyPrefix(rawKey)

    // 根据前缀缩小候选范围
    const candidatesResult = await apiKeyRepository.findByKeyPrefix(prefix)
    if (!candidatesResult.success) {
      return candidatesResult as Result<ApiKey, IamError>
    }

    // 遍历候选项验证哈希
    for (const candidate of candidatesResult.data) {
      const verifyResult = passwordOps.verify(rawKey, candidate.keyHash)
      if (!verifyResult.success)
        continue
      if (!verifyResult.data)
        continue

      // 检查是否启用
      if (!candidate.enabled) {
        return err({ code: IamErrorCode.APIKEY_DISABLED, message: iamM('iam_apikeyDisabled') })
      }

      // 检查是否过期
      if (candidate.expiresAt && new Date() > candidate.expiresAt) {
        return err({ code: IamErrorCode.APIKEY_EXPIRED, message: iamM('iam_apikeyExpired') })
      }

      // 更新最后使用时间（异步，不阻塞认证）
      apiKeyRepository.updateFields(candidate.id, { lastUsedAt: new Date() }).catch(() => {
        logger.warn('Failed to update API Key lastUsedAt', { keyId: candidate.id })
      })

      return ok(toApiKey(candidate))
    }

    return err({ code: IamErrorCode.APIKEY_INVALID, message: iamM('iam_apikeyInvalid') })
  }

  // ─── AuthStrategy 实现 ───

  const strategy: AuthStrategy = {
    type: 'apikey',
    name: 'apikey-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      const credentialResult = ensureCredentialType(credentials, 'apikey')
      if (!credentialResult.success) {
        return credentialResult as Result<User, IamError>
      }

      const { key } = credentialResult.data

      // 验证 API Key
      const verifyResult = await verifyRawKey(key)
      if (!verifyResult.success) {
        return verifyResult as Result<User, IamError>
      }

      const apiKey = verifyResult.data

      // 通过用户 ID 查找关联用户
      const userResult = await userRepository.findById(apiKey.userId)
      if (!userResult.success) {
        return err({ code: IamErrorCode.REPOSITORY_ERROR, message: userResult.error.message, cause: userResult.error })
      }
      if (!userResult.data) {
        return err({ code: IamErrorCode.USER_NOT_FOUND, message: iamM('iam_userNotExist') })
      }
      if (!userResult.data.enabled) {
        return err({ code: IamErrorCode.USER_DISABLED, message: iamM('iam_accountDisabled') })
      }

      logger.info('API Key authentication succeeded', { userId: userResult.data.id, keyId: apiKey.id })
      return ok(toUser(userResult.data))
    },
  }

  // ─── API Key 管理操作 ───

  const apiKeyFunctions: ApiKeyOperations = {
    async createApiKey(userId: string, options: CreateApiKeyOptions): Promise<Result<CreateApiKeyResult, IamError>> {
      try {
        // 检查用户 API Key 数量限制
        const countResult = await apiKeyRepository.countByUserId(userId)
        if (!countResult.success)
          return countResult as Result<CreateApiKeyResult, IamError>

        if (countResult.data >= apikeyConfig.maxKeysPerUser) {
          return err({
            code: IamErrorCode.INVALID_ARGUMENT,
            message: iamM('iam_apikeyMaxKeysReached', { params: { max: apikeyConfig.maxKeysPerUser } }),
          })
        }

        // 生成明文密钥和哈希
        const rawKey = generateRawKey(apikeyConfig.prefix)
        const hashResult = passwordOps.hash(rawKey)
        if (!hashResult.success) {
          return err({ code: IamErrorCode.INTERNAL_ERROR, message: hashResult.error.message })
        }

        // 计算过期时间
        const expirationDays = options.expirationDays ?? apikeyConfig.defaultExpirationDays
        const expiresAt = expirationDays > 0
          ? new Date(Date.now() + expirationDays * 86400000)
          : null

        const id = core.id.generate()
        const now = new Date()

        const storedApiKey = {
          id,
          userId,
          name: options.name,
          keyHash: hashResult.data,
          keyPrefix: extractKeyPrefix(rawKey),
          enabled: true,
          expiresAt,
          createdAt: now,
          lastUsedAt: null,
          scopes: options.scopes ?? [],
        }

        const insertResult = await apiKeyRepository.insert(storedApiKey)
        if (!insertResult.success)
          return insertResult as Result<CreateApiKeyResult, IamError>

        logger.info('API Key created', { userId, keyId: id, name: options.name })
        return ok({ apiKey: toApiKey(storedApiKey), rawKey })
      }
      catch (error) {
        return err({
          code: IamErrorCode.INTERNAL_ERROR,
          message: iamM('iam_apikeyCreateFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }
    },

    async listApiKeys(userId: string): Promise<Result<ApiKey[], IamError>> {
      const result = await apiKeyRepository.findByUserId(userId)
      if (!result.success)
        return result as Result<ApiKey[], IamError>
      return ok(result.data.map(toApiKey))
    },

    async getApiKey(keyId: string): Promise<Result<ApiKey | null, IamError>> {
      const result = await apiKeyRepository.getById(keyId)
      if (!result.success)
        return result as Result<ApiKey | null, IamError>
      return ok(result.data ? toApiKey(result.data) : null)
    },

    async revokeApiKey(keyId: string): Promise<Result<void, IamError>> {
      const result = await apiKeyRepository.removeById(keyId)
      if (!result.success)
        return result
      logger.info('API Key revoked', { keyId })
      return ok(undefined)
    },

    async verifyApiKey(rawKey: string): Promise<Result<ApiKey, IamError>> {
      return verifyRawKey(rawKey)
    },
  }

  return { strategy, apiKeyFunctions }
}
