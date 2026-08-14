/**
 * @h-ai/iam — API Key 存储实现
 *
 * 基于 @h-ai/reldb 的 API Key CRUD 存储。
 * @module iam-authn-apikey-repository
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition } from '@h-ai/reldb'
import type { ApiKeySortField, ListApiKeysOptions, StoredApiKey } from './iam-authn-apikey-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'

// ─── API Key 存储接口 ───

/**
 * API Key 存储接口
 */
export interface ApiKeyRepository {
  /** 插入 API Key */
  insert: (data: StoredApiKey, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
  /** 根据 ID 获取（不存在时返回 null） */
  findOneById: (id: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredApiKey | null>>
  /** 根据密钥前缀查找（用于快速匹配候选项） */
  findByKeyPrefix: (prefix: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredApiKey[]>>
  /** 分页列出用户 API Key（服务端搜索、过滤、排序、分页） */
  findPageByUserId: (userId: string, options: ListApiKeysOptions, tx?: DmlWithTxOperations) => Promise<HaiResult<PaginatedResult<StoredApiKey>>>
  /** 统计用户 API Key 数量 */
  countByUserId: (userId: string, tx?: DmlWithTxOperations) => Promise<HaiResult<number>>
  /** 根据 ID 更新（部分字段） */
  updateFields: (id: string, data: Partial<StoredApiKey>, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
  /** 根据 ID 删除 */
  removeById: (id: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
}

// ─── 字段定义 ───

const TABLE_NAME = 'hai_iam_api_keys'

/** API Key 排序字段到数据库列名的映射。 */
const API_KEY_SORT_COLUMNS: Record<ApiKeySortField, string> = {
  name: 'name',
  createdAt: 'created_at',
  lastUsedAt: 'last_used_at',
  expiresAt: 'expires_at',
}

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
let apiKeyRepoSqlOps: unknown = null

/**
 * 重置 API Key 存储单例
 */
export function resetApiKeyRepoSingleton(): void {
  apiKeyRepoInstance = null
  apiKeyRepoSqlOps = null
}

/**
 * 创建基于数据库的 API Key 存储实例
 *
 * @returns API Key 存储接口实现
 */
export async function createDbApiKeyRepository(): Promise<ApiKeyRepository> {
  if (apiKeyRepoInstance && apiKeyRepoSqlOps === reldb.sql)
    return apiKeyRepoInstance

  const repo = new DbApiKeyRepository()
  await repo.count()
  apiKeyRepoInstance = repo
  apiKeyRepoSqlOps = reldb.sql
  return repo
}

// ─── 存储实现 ───

class DbApiKeyRepository extends BaseReldbCrudRepository<StoredApiKey> implements ApiKeyRepository {
  constructor() {
    super(reldb, {
      table: TABLE_NAME,
      fields: API_KEY_FIELDS,
    })
  }

  async insert(data: StoredApiKey, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const result = await this.create({ ...data }, tx)
    if (!result.success) {
      return err(
        HaiIamError.REPOSITORY_ERROR,
        iamM('iam_apikeyCreateFailed', { params: { message: result.error.message } }),
        result.error,
      )
    }
    return ok(undefined)
  }

  async findOneById(id: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredApiKey | null>> {
    const result = await this.findById(id, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async findByKeyPrefix(prefix: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredApiKey[]>> {
    const result = await this.findAll({ where: 'key_prefix = ?', params: [prefix] }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async findPageByUserId(userId: string, options: ListApiKeysOptions, tx?: DmlWithTxOperations): Promise<HaiResult<PaginatedResult<StoredApiKey>>> {
    const conditions: string[] = ['user_id = ?']
    const params: unknown[] = [userId]

    if (options.search) {
      // 转义 LIKE 通配符，防止用户输入 % 或 _ 产生非预期匹配。
      const escaped = options.search.replace(/[%_\\]/g, '\\$&')
      const keyword = `%${escaped}%`
      conditions.push('(name LIKE ? ESCAPE \'\\\' OR key_prefix LIKE ? ESCAPE \'\\\')')
      params.push(keyword, keyword)
    }

    if (options.enabled !== undefined) {
      conditions.push('enabled = ?')
      params.push(options.enabled ? 1 : 0)
    }

    const sortColumn = options.sortBy ? API_KEY_SORT_COLUMNS[options.sortBy] : API_KEY_SORT_COLUMNS.createdAt
    const sortDirection = options.sortBy && options.sortDirection === 'asc' ? 'ASC' : 'DESC'

    const result = await this.findPage({
      where: conditions.join(' AND '),
      params,
      orderBy: `${sortColumn} ${sortDirection}`,
      pagination: { page: options.page, pageSize: options.pageSize },
    }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return result
  }

  async countByUserId(userId: string, tx?: DmlWithTxOperations): Promise<HaiResult<number>> {
    const result = await this.count({ where: 'user_id = ?', params: [userId] }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data)
  }

  async updateFields(id: string, data: Partial<StoredApiKey>, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const result = await this.updateById(id, { ...data }, tx)
    if (!result.success) {
      return err(
        HaiIamError.REPOSITORY_ERROR,
        iamM('iam_apikeyUpdateFailed', { params: { message: result.error.message } }),
        result.error,
      )
    }
    return ok(undefined)
  }

  async removeById(id: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const result = await this.deleteById(id, tx)
    if (!result.success) {
      return err(
        HaiIamError.REPOSITORY_ERROR,
        iamM('iam_apikeyDeleteFailed', { params: { message: result.error.message } }),
        result.error,
      )
    }
    return ok(undefined)
  }

  private buildQueryError(error: { message: string }): HaiResult<never> {
    return err(
      HaiIamError.REPOSITORY_ERROR,
      iamM('iam_apikeyQueryFailed', { params: { message: error.message } }),
      error,
    )
  }
}
