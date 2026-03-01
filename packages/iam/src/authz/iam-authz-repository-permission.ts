/**
 * @h-ai/iam — 权限存储实现
 *
 * 基于 @h-ai/db 的权限存储实现。
 * @module iam-authz-repository-permission
 */

import type { Result } from '@h-ai/core'
import type { CrudCountOptions, CrudFieldDefinition, CrudRepository, DbError, DbFunctions, TxHandle } from '@h-ai/db'
import type { IamError } from '../iam-types.js'
import type { Permission } from './iam-authz-types.js'
import { err, ok } from '@h-ai/core'
import { BaseCrudRepository } from '@h-ai/db'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// ─── 权限存储接口 ───

/**
 * 权限存储接口
 */
export interface PermissionRepository extends CrudRepository<Permission> {
  /**
   * 根据代码获取权限
   */
  findByCode: (code: string) => Promise<Result<Permission | null, IamError>>
}

// ─── 权限存储实现 ───

/**
 * 权限表名
 */
const TABLE_NAME = 'iam_permissions'

const PERMISSION_FIELDS: CrudFieldDefinition[] = [
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

/** 权限存储单例缓存（通过 db.config 引用比较检测 db 重新初始化） */
let permRepoInstance: PermissionRepository | null = null
let permRepoDbConfig: unknown = null

/**
 * 重置权限存储单例
 *
 * 在 iam.close() 时调用，释放对旧 db 实例的引用。
 */
export function resetPermissionRepoSingleton(): void {
  permRepoInstance = null
  permRepoDbConfig = null
}

/**
 * 创建基于数据库的权限存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @param db - 数据库服务实例
 * @returns 权限存储接口实现
 */
export async function createDbPermissionRepository(db: DbFunctions): Promise<PermissionRepository> {
  if (permRepoInstance && permRepoDbConfig === db.config)
    return permRepoInstance

  const repo = new DbPermissionRepository(db)
  await repo.count()
  permRepoInstance = repo
  permRepoDbConfig = db.config
  return repo
}

/**
 * 基于数据库的权限存储实现
 *
 * 继承 BaseCrudRepository，提供按 code 查找权限的能力。
 */
class DbPermissionRepository extends BaseCrudRepository<Permission> implements PermissionRepository {
  constructor(db: DbFunctions) {
    super(db, {
      table: TABLE_NAME,
      fields: PERMISSION_FIELDS,
    })
  }

  /** 根据权限代码查找权限 */
  async findByCode(code: string): Promise<Result<Permission | null, IamError>> {
    return this.findOneBy('code = ?', [code])
  }

  async exists(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const result = await this.count(options, tx)
    if (!result.success) {
      return result as Result<boolean, DbError>
    }
    return ok(result.data > 0)
  }

  private buildQueryError(error: { message: string }, cause: unknown): Result<never, IamError> {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_queryPermissionFailed', { params: { message: error.message } }),
      cause,
    })
  }

  private async findOneBy(where: string, params: unknown[]): Promise<Result<Permission | null, IamError>> {
    const result = await this.findAll({ where, params, limit: 1 })
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }
}
