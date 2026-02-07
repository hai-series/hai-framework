/**
 * =============================================================================
 * @hai/iam - 权限存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的权限存储实现。
 *
 * @module authz/rbac/iam-authz-rbac-repository-permission
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CrudCountOptions, CrudFieldDefinition, CrudRepository, DbError, DbService, TxHandle } from '@hai/db'
import type { IamError } from '../../iam-core-types.js'
import type { Permission } from './iam-authz-rbac-types.js'
import { err, ok } from '@hai/core'
import { BaseCrudRepository } from '@hai/db'
import { IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

// =============================================================================
// 权限存储接口
// =============================================================================

/**
 * 权限存储接口
 */
export interface PermissionRepository extends CrudRepository<Permission> {
  /**
   * 根据代码获取权限
   */
  findByCode: (code: string) => Promise<Result<Permission | null, IamError>>
}

// =============================================================================
// 权限存储实现
// =============================================================================

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

/**
 * 创建数据库权限存储
 */
let permissionRepositorySingleton: PermissionRepository | null = null

export async function createDbPermissionRepository(db: DbService): Promise<PermissionRepository> {
  if (permissionRepositorySingleton) {
    return permissionRepositorySingleton
  }
  permissionRepositorySingleton = new DbPermissionRepository(db)
  return permissionRepositorySingleton
}

class DbPermissionRepository extends BaseCrudRepository<Permission> implements PermissionRepository {
  constructor(db: DbService) {
    super(db, {
      table: TABLE_NAME,
      fields: PERMISSION_FIELDS,
    })
  }

  async findByCode(code: string): Promise<Result<Permission | null, IamError>> {
    const result = await this.findAll({ where: 'code = ?', params: [code], limit: 1 })
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryPermissionFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(result.data[0] ?? null)
  }

  async exists(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const result = await this.count(options, tx)
    if (!result.success) {
      return result as Result<boolean, DbError>
    }
    return ok(result.data > 0)
  }
}
