/**
 * @h-ai/iam — 角色存储实现
 *
 * 基于 @h-ai/reldb 的角色存储实现。
 * @module iam-authz-repository-role
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ExecuteResult, ReldbCrudFieldDefinition, ReldbCrudRepository } from '@h-ai/reldb'
import type { Role } from './iam-authz-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

// ─── 角色存储接口 ───

/**
 * 角色存储接口
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // RelDB 已初始化；后续仓储读取仍可能失败，必须检查 HaiResult。
 * const repository = await createDbRoleRepository()
 * const found = await repository.findByCode('user')
 * if (!found.success)
 *   return found
 * return found.data?.id ?? null
 * ```
 */
export interface RoleRepository extends ReldbCrudRepository<Role> {
  /** 权限单独更新时锁定角色行并推进更新时间，避免并发替换交错 */
  touch: (roleId: string, tx: DmlWithTxOperations) => Promise<HaiResult<ExecuteResult>>
  /**
   * 根据代码获取角色
   */
  findByCode: (code: string, tx?: DmlWithTxOperations) => Promise<HaiResult<Role | null>>
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

/** 角色存储单例缓存（通过 reldb.sql 引用比较检测 db 生命周期切换） */
let roleRepoInstance: RoleRepository | null = null
let roleRepoSqlOps: unknown = null

/**
 * 重置角色存储单例
 *
 * 在 iam.close() 时调用，释放对旧 db 实例的引用。
 * 仅重置本地引用，不删除共享存储数据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 所有使用该仓储的 IAM 子功能均已关闭后，才清理工厂缓存。
 * resetRoleRepoSingleton()
 * ```
 */
export function resetRoleRepoSingleton(): void {
  roleRepoInstance = null
  roleRepoSqlOps = null
}

/**
 * 创建基于数据库的角色存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @returns 角色存储接口实现
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // RelDB 已初始化；后续仓储读取仍可能失败，必须检查 HaiResult。
 * const repository = await createDbRoleRepository()
 * const found = await repository.findByCode('user')
 * if (!found.success)
 *   return found
 * return found.data?.id ?? null
 * ```
 */
export async function createDbRoleRepository(): Promise<RoleRepository> {
  if (roleRepoInstance && roleRepoSqlOps === reldb.sql)
    return roleRepoInstance

  const repo = new DbRoleRepository()
  await repo.count()
  roleRepoInstance = repo
  roleRepoSqlOps = reldb.sql
  return repo
}

/**
 * 基于数据库的角色存储实现
 *
 * 继承 BaseReldbCrudRepository，提供按 code 查找角色的能力。
 */
class DbRoleRepository extends BaseReldbCrudRepository<Role> implements RoleRepository {
  async touch(roleId: string, tx: DmlWithTxOperations): Promise<HaiResult<ExecuteResult>> {
    return tx.execute(`UPDATE ${TABLE_NAME} SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), roleId])
  }

  constructor() {
    super(reldb, {
      table: TABLE_NAME,
      fields: ROLE_FIELDS,
    })
  }

  /** 根据角色代码查找角色 */
  async findByCode(code: string, tx?: DmlWithTxOperations): Promise<HaiResult<Role | null>> {
    return this.findOneBy('code = ?', [code], tx)
  }

  private buildQueryError(error: { message: string }, cause: unknown): HaiResult<never> {
    return err(
      HaiIamError.REPOSITORY_ERROR,
      iamM('iam_queryRoleFailed', { params: { message: error.message } }),
      cause,
    )
  }

  private async findOneBy(where: string, params: unknown[], tx?: DmlWithTxOperations): Promise<HaiResult<Role | null>> {
    const result = await this.findAll({ where, params, limit: 1 }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }
}
