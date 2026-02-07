/**
 * =============================================================================
 * @hai/iam - 角色存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的角色存储实现。
 *
 * @module authz/rbac/iam-authz-rbac-repository-role
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CrudCountOptions, CrudFieldDefinition, CrudRepository, DbError, DbService, TxHandle } from '@hai/db'
import type { IamError } from '../../iam-core-types.js'
import type { Role } from './iam-authz-rbac-types.js'
import { err, ok } from '@hai/core'
import { BaseCrudRepository } from '@hai/db'
import { IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

// =============================================================================
// 角色存储接口
// =============================================================================

/**
 * 角色存储接口
 */
export interface RoleRepository extends CrudRepository<Role> {
  /**
   * 根据代码获取角色
   */
  findByCode: (code: string) => Promise<Result<Role | null, IamError>>
}

// =============================================================================
// 角色存储实现
// =============================================================================

/**
 * 角色表名
 */
const TABLE_NAME = 'iam_roles'

const ROLE_FIELDS: CrudFieldDefinition[] = [
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
    fieldName: 'isSystem',
    columnName: 'is_system',
    def: { type: 'BOOLEAN' as const, defaultValue: 0 },
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
 * 创建数据库角色存储
 */
let roleRepositorySingleton: RoleRepository | null = null

export async function createDbRoleRepository(db: DbService): Promise<RoleRepository> {
  if (roleRepositorySingleton) {
    return roleRepositorySingleton
  }
  roleRepositorySingleton = new DbRoleRepository(db)
  return roleRepositorySingleton
}

class DbRoleRepository extends BaseCrudRepository<Role> implements RoleRepository {
  constructor(db: DbService) {
    super(db, {
      table: TABLE_NAME,
      fields: ROLE_FIELDS,
    })
  }

  async findByCode(code: string): Promise<Result<Role | null, IamError>> {
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
      message: iamM('iam_queryRoleFailed', { params: { message: error.message } }),
      cause,
    })
  }

  private async findOneBy(where: string, params: unknown[]): Promise<Result<Role | null, IamError>> {
    const result = await this.findAll({ where, params, limit: 1 })
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }
}
