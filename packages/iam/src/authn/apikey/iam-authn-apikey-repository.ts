/**
 * @h-ai/iam — API Key 存储实现
 *
 * 基于 @h-ai/reldb 的 API Key CRUD 存储。
 * @module iam-authn-apikey-repository
 */

import type { Result } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbFunctions } from '@h-ai/reldb'
import type { IamError } from '../../iam-types.js'
import type { StoredApiKey } from './iam-authn-apikey-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'
import { IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

// ─── API Key 存储接口 ───

/**
 * API Key 存储接口
 */
export interface ApiKeyRepository {
  /** 插入 API Key */
  insert: (data: StoredApiKey, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>
  /** 根据 ID 获取 */
  getById: (id: string, tx?: DmlWithTxOperations) => Promise<Result<StoredApiKey | null, IamError>>
  /** 根据密钥前缀查找（用于快速匹配候选项） */
  findByKeyPrefix: (prefix: string, tx?: DmlWithTxOperations) => Promise<Result<StoredApiKey[], IamError>>
  /** 列出用户所有 API Key */
  findByUserId: (userId: string, tx?: DmlWithTxOperations) => Promise<Result<StoredApiKey[], IamError>>
  /** 统计用户 API Key 数量 */
  countByUserId: (userId: string, tx?: DmlWithTxOperations) => Promise<Result<number, IamError>>
  /** 根据 ID 更新（部分字段） */
  updateFields: (id: string, data: Partial<StoredApiKey>, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>
  /** 根据 ID 删除 */
  removeById: (id: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>
}

// ─── 字段定义 ───

const TABLE_NAME = 'hai_iam_api_keys'

const API_KEY_FIELDS: ReldbCrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'userId',
    columnName: 'user_id',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'name',
    columnName: 'name',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'keyHash',
    columnName: 'key_hash',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'keyPrefix',
    columnName: 'key_prefix',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'enabled',
    columnName: 'enabled',
    def: { type: 'BOOLEAN' as const, notNull: true, defaultValue: 1 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'expiresAt',
    columnName: 'expires_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'lastUsedAt',
    columnName: 'last_used_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'scopes',
    columnName: 'scopes',
    def: { type: 'JSON' as const },
    select: true,
    create: true,
    update: true,
  },
]

// ─── 单例管理 ───

let apiKeyRepoInstance: ApiKeyRepository | null = null
let apiKeyRepoDbConfig: unknown = null

/**
 * 重置 API Key 存储单例
 */
export function resetApiKeyRepoSingleton(): void {
  apiKeyRepoInstance = null
  apiKeyRepoDbConfig = null
}

/**
 * 创建基于数据库的 API Key 存储实例
 *
 * @param db - 数据库服务实例
 * @returns API Key 存储接口实现
 */
export async function createDbApiKeyRepository(db: ReldbFunctions): Promise<ApiKeyRepository> {
  if (apiKeyRepoInstance && apiKeyRepoDbConfig === db.config)
    return apiKeyRepoInstance

  const repo = new DbApiKeyRepository(db)
  await repo.count()
  apiKeyRepoInstance = repo
  apiKeyRepoDbConfig = db.config
  return repo
}

// ─── 存储实现 ───

class DbApiKeyRepository extends BaseReldbCrudRepository<StoredApiKey> implements ApiKeyRepository {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: TABLE_NAME,
      fields: API_KEY_FIELDS,
    })
  }

  async insert(data: StoredApiKey, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
    const result = await this.create(data as unknown as Record<string, unknown>, tx)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_apikeyCreateFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  async getById(id: string, tx?: DmlWithTxOperations): Promise<Result<StoredApiKey | null, IamError>> {
    const result = await this.findById(id, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async findByKeyPrefix(prefix: string, tx?: DmlWithTxOperations): Promise<Result<StoredApiKey[], IamError>> {
    const result = await this.findAll({ where: 'key_prefix = ?', params: [prefix] }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async findByUserId(userId: string, tx?: DmlWithTxOperations): Promise<Result<StoredApiKey[], IamError>> {
    const result = await this.findAll({ where: 'user_id = ?', params: [userId] }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async countByUserId(userId: string, tx?: DmlWithTxOperations): Promise<Result<number, IamError>> {
    const result = await this.count({ where: 'user_id = ?', params: [userId] }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async updateFields(id: string, data: Partial<StoredApiKey>, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
    const result = await this.updateById(id, data as unknown as Record<string, unknown>, tx)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_apikeyUpdateFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  async removeById(id: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
    const result = await this.deleteById(id, tx)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_apikeyDeleteFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  private buildQueryError(error: { message: string }): Result<never, IamError> {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_apikeyQueryFailed', { params: { message: error.message } }),
      cause: error,
    })
  }
}
