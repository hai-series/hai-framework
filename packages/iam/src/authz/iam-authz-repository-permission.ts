/**
 * @h-ai/iam — 权限存储实现
 *
 * 基于 @h-ai/reldb 的权限存储实现。
 * @module iam-authz-repository-permission
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository } from '@h-ai/reldb'
import type { Permission } from './iam-authz-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

// ─── 权限存储接口 ───

/**
 * 权限存储接口
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // RelDB 已初始化；后续仓储读取仍可能失败，必须检查 HaiResult。
 * const repository = await createDbPermissionRepository()
 * const found = await repository.findByCode('report:read')
 * if (!found.success)
 *   return found
 * return found.data?.id ?? null
 * ```
 */
export interface PermissionRepository extends ReldbCrudRepository<Permission> {
  getSensitiveOperations: (operation?: string) => Promise<HaiResult<string[]>>
  /**
   * 根据代码获取权限
   */
  findByCode: (code: string, tx?: DmlWithTxOperations) => Promise<HaiResult<Permission | null>>
}

// ─── 权限存储实现 ───

/**
 * 权限表名
 */
const TABLE_NAME = 'hai_iam_permissions'

const PERMISSION_FIELDS: ReldbCrudFieldDefinition[] = [
  { fieldName: 'sensitiveOperations', columnName: 'sensitive_operations', def: { type: 'JSON' }, select: true, create: true, update: true },
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'code',
    columnName: 'code',
    def: { type: 'TEXT' as const, notNull: true, unique: true },
    select: true,
    create: true,
    update: true,
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
    fieldName: 'description',
    columnName: 'description',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'resource',
    columnName: 'resource',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'action',
    columnName: 'action',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'type',
    columnName: 'type',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
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
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

/** 权限存储单例缓存（通过 reldb.sql 引用比较检测 db 生命周期切换） */
let permRepoInstance: PermissionRepository | null = null
let permRepoSqlOps: unknown = null

/**
 * 重置权限存储单例
 *
 * 在 iam.close() 时调用，释放对旧 db 实例的引用。
 * 仅重置本地引用，不删除共享存储数据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 所有使用该仓储的 IAM 子功能均已关闭后，才清理工厂缓存。
 * resetPermissionRepoSingleton()
 * ```
 */
export function resetPermissionRepoSingleton(): void {
  permRepoInstance = null
  permRepoSqlOps = null
}

/**
 * 创建基于数据库的权限存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @returns 权限存储接口实现
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // RelDB 已初始化；后续仓储读取仍可能失败，必须检查 HaiResult。
 * const repository = await createDbPermissionRepository()
 * const found = await repository.findByCode('report:read')
 * if (!found.success)
 *   return found
 * return found.data?.id ?? null
 * ```
 */
export async function createDbPermissionRepository(): Promise<PermissionRepository> {
  if (permRepoInstance && permRepoSqlOps === reldb.sql)
    return permRepoInstance

  const repo = new DbPermissionRepository()
  await repo.count()
  permRepoInstance = repo
  permRepoSqlOps = reldb.sql
  return repo
}

/**
 * 基于数据库的权限存储实现
 *
 * 继承 BaseReldbCrudRepository，提供按 code 查找权限的能力。
 */
class DbPermissionRepository extends BaseReldbCrudRepository<Permission> implements PermissionRepository {
  async getSensitiveOperations(operation?: string): Promise<HaiResult<string[]>> {
    if (operation !== undefined && (typeof operation !== 'string' || !operation.trim() || operation.length > 128))
      return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sensitiveOperationsInvalid'))
    const match = reldb.config?.type === 'postgresql'
      ? 'sensitive_operations::jsonb @> CAST(? AS jsonb)'
      : reldb.config?.type === 'mysql'
        ? 'JSON_CONTAINS(sensitive_operations, JSON_QUOTE(?))'
        : 'EXISTS (SELECT 1 FROM json_each(sensitive_operations) WHERE type = \'text\' AND value = ?)'
    const params = operation === undefined ? [] : [reldb.config?.type === 'postgresql' ? JSON.stringify([operation]) : operation]
    const result = await reldb.sql.query<{ sensitive_operations: unknown }>(`SELECT sensitive_operations FROM hai_iam_permissions WHERE sensitive_operations IS NOT NULL${operation === undefined ? '' : ` AND ${match} LIMIT 1`}`, params)
    if (!result.success)
      return result
    const operations = new Set<string>()
    try {
      for (const row of result.data) {
        const values: unknown = typeof row.sensitive_operations === 'string' ? JSON.parse(row.sensitive_operations) : row.sensitive_operations
        if (!Array.isArray(values) || values.length > 1000)
          return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_reauthenticationRequired'))
        for (const value of values as unknown[]) {
          if (typeof value !== 'string' || !value.trim() || value.length > 128)
            return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_reauthenticationRequired'))
          if (operation === undefined || value.trim() === operation)
            operations.add(value.trim())
        }
      }
      return ok([...operations].sort())
    }
    catch {
      return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_reauthenticationRequired'))
    }
  }

  constructor() {
    super(reldb, {
      table: TABLE_NAME,
      fields: PERMISSION_FIELDS,
    })
  }

  /** 根据权限代码查找权限 */
  async findByCode(code: string, tx?: DmlWithTxOperations): Promise<HaiResult<Permission | null>> {
    return this.findOneBy('code = ?', [code], tx)
  }

  private buildQueryError(error: { message: string }, cause: unknown): HaiResult<never> {
    return err(
      HaiIamError.REPOSITORY_ERROR,
      iamM('iam_queryPermissionFailed', { params: { message: error.message } }),
      cause,
    )
  }

  private async findOneBy(where: string, params: unknown[], tx?: DmlWithTxOperations): Promise<HaiResult<Permission | null>> {
    const result = await this.findAll({ where, params, limit: 1 }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }
}
