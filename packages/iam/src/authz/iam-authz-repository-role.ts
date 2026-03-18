/**
 * @h-ai/iam — 角色存储实现
 *
 * 基于 @h-ai/reldb 的角色存储实现。
 * @module iam-authz-repository-role
 */

import type { Result } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository } from '@h-ai/reldb'
import type { IamError } from '../iam-types.js'
import type { Role } from './iam-authz-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// ─── 角色存储接口 ───

/**
 * 角色存储接口
 */
export interface RoleRepository extends ReldbCrudRepository<Role> {
  /**
   * 根据代码获取角色
   */
  findByCode: (code: string, tx?: DmlWithTxOperations) => Promise<Result<Role | null, IamError>>
}

// ─── 角色存储实现 ───

/**
 * 角色表名
 */
const TABLE_NAME = 'hai_iam_roles'

const ROLE_FIELDS: ReldbCrudFieldDefinition[] = [
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

/** 角色存储单例缓存（通过 reldb.config 引用比较检测 db 重新初始化） */
let roleRepoInstance: RoleRepository | null = null
let roleRepoDbConfig: unknown = null

/**
 * 重置角色存储单例
 *
 * 在 iam.close() 时调用，释放对旧 db 实例的引用。
 */
export function resetRoleRepoSingleton(): void {
  roleRepoInstance = null
  roleRepoDbConfig = null
}

/**
 * 创建基于数据库的角色存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @returns 角色存储接口实现
 */
export async function createDbRoleRepository(): Promise<RoleRepository> {
  if (roleRepoInstance && roleRepoDbConfig === reldb.config)
    return roleRepoInstance

  const repo = new DbRoleRepository()
  await repo.count()
  roleRepoInstance = repo
  roleRepoDbConfig = reldb.config
  return repo
}

/**
 * 基于数据库的角色存储实现
 *
 * 继承 BaseReldbCrudRepository，提供按 code 查找角色的能力。
 */
class DbRoleRepository extends BaseReldbCrudRepository<Role> implements RoleRepository {
  constructor() {
    super(reldb, {
      table: TABLE_NAME,
      fields: ROLE_FIELDS,
    })
  }

  /** 根据角色代码查找角色 */
  async findByCode(code: string, tx?: DmlWithTxOperations): Promise<Result<Role | null, IamError>> {
    return this.findOneBy('code = ?', [code], tx)
  }

  private buildQueryError(error: { message: string }, cause: unknown): Result<never, IamError> {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_queryRoleFailed', { params: { message: error.message } }),
      cause,
    })
  }

  private async findOneBy(where: string, params: unknown[], tx?: DmlWithTxOperations): Promise<Result<Role | null, IamError>> {
    const result = await this.findAll({ where, params, limit: 1 }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }
}
