/**
 * =============================================================================
 * @hai/iam - 关联关系存储实现
 * =============================================================================
 *
 * 包含角色-权限、用户-角色关联存储。
 *
 * @module authz/rbac/iam-authz-rbac-repository-relation
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService, TxHandle } from '@hai/db'
import type { IamError } from '../../iam-core-types.js'
import type { PermissionRepository } from './iam-authz-rbac-repository-permission.js'
import type { RoleRepository } from './iam-authz-rbac-repository-role.js'
import type { Permission, Role } from './iam-authz-rbac-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

// =============================================================================
// 角色-权限关联存储接口
// =============================================================================

/**
 * 角色-权限关联存储接口
 */
export interface RolePermissionRepository {
  /**
   * 分配权限给角色
   */
  assign: (roleId: string, permissionId: string, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   */
  remove: (roleId: string, permissionId: string, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 获取角色的所有权限 ID
   */
  getPermissionIds: (roleId: string, tx?: TxHandle) => Promise<Result<string[], IamError>>

  /**
   * 获取角色的所有权限
   */
  getPermissions: (roleId: string, tx?: TxHandle) => Promise<Result<Permission[], IamError>>

  /**
   * 检查角色是否有某权限
   */
  hasPermission: (roleId: string, permissionCode: string, tx?: TxHandle) => Promise<Result<boolean, IamError>>
}

// =============================================================================
// 用户-角色关联存储接口
// =============================================================================

/**
 * 用户-角色关联存储接口
 */
export interface UserRoleRepository {
  /**
   * 分配角色给用户
   */
  assign: (userId: string, roleId: string, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   */
  remove: (userId: string, roleId: string, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有角色 ID
   */
  getRoleIds: (userId: string, tx?: TxHandle) => Promise<Result<string[], IamError>>

  /**
   * 获取用户的所有角色
   */
  getRoles: (userId: string, tx?: TxHandle) => Promise<Result<Role[], IamError>>

  /**
   * 检查用户是否有某角色
   */
  hasRole: (userId: string, roleCode: string, tx?: TxHandle) => Promise<Result<boolean, IamError>>
}

// =============================================================================
// 角色-权限关联存储实现
// =============================================================================

const ROLE_PERMISSION_TABLE = 'iam_role_permissions'
const ROLE_PERMISSION_SCHEMA = {
  role_id: { type: 'TEXT' as const, notNull: true },
  permission_id: { type: 'TEXT' as const, notNull: true },
}

/**
 * 创建数据库角色-权限关联存储
 */
export async function createDbRolePermissionRepository(
  db: DbService,
  permissionRepository: PermissionRepository,
): Promise<RolePermissionRepository> {
  // 确保表存在
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(ROLE_PERMISSION_TABLE, ROLE_PERMISSION_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createRolePermissionTableFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    const indexResults = await Promise.all([
      db.ddl.createIndex(ROLE_PERMISSION_TABLE, 'idx_role_perm_role_perm', { columns: ['role_id', 'permission_id'], unique: true }),
      db.ddl.createIndex(ROLE_PERMISSION_TABLE, 'idx_role_perm_role', { columns: ['role_id'] }),
    ])
    for (const indexResult of indexResults) {
      if (!indexResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createRolePermissionIndexFailed', { params: { message: indexResult.error.message } }),
          cause: indexResult.error,
        })
      }
    }

    return ok(undefined)
  }

  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  async function getPermissionIdsInternal(roleId: string, tx?: TxHandle): Promise<Result<string[], IamError>> {
    const runner = tx ?? db.sql
    const result = await runner.query<{ permission_id: string }>(
      `SELECT permission_id FROM ${ROLE_PERMISSION_TABLE} WHERE role_id = ?`,
      [roleId],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryPermissionFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    return ok(result.data.map(r => r.permission_id))
  }

  return {
    async assign(roleId, permissionId, tx): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
      const result = await runner.execute(
        `INSERT OR IGNORE INTO ${ROLE_PERMISSION_TABLE} (role_id, permission_id) VALUES (?, ?)`,
        [roleId, permissionId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_assignPermissionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async remove(roleId, permissionId, tx): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
      const result = await runner.execute(
        `DELETE FROM ${ROLE_PERMISSION_TABLE} WHERE role_id = ? AND permission_id = ?`,
        [roleId, permissionId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_removePermissionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async getPermissionIds(roleId, tx): Promise<Result<string[], IamError>> {
      return getPermissionIdsInternal(roleId, tx)
    },

    async getPermissions(roleId, tx): Promise<Result<Permission[], IamError>> {
      const idsResult = await getPermissionIdsInternal(roleId, tx)
      if (!idsResult.success)
        return idsResult

      const permissions: Permission[] = []
      for (const id of idsResult.data) {
        const permResult = await permissionRepository.findById(id, tx)
        if (!permResult.success) {
          return err({
            code: IamErrorCode.REPOSITORY_ERROR,
            message: iamM('iam_queryPermissionFailed', { params: { message: permResult.error.message } }),
            cause: permResult.error,
          })
        }
        if (permResult.data) {
          permissions.push(permResult.data)
        }
      }

      return ok(permissions)
    },

    async hasPermission(roleId, permissionCode, tx): Promise<Result<boolean, IamError>> {
      const runner = tx ?? db.sql
      const result = await runner.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${ROLE_PERMISSION_TABLE} rp
         JOIN iam_permissions p ON rp.permission_id = p.id
         WHERE rp.role_id = ? AND p.code = ?`,
        [roleId, permissionCode],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data[0].cnt > 0)
    },
  }
}

// =============================================================================
// 用户-角色关联存储实现
// =============================================================================

const USER_ROLE_TABLE = 'iam_user_roles'
const USER_ROLE_SCHEMA = {
  user_id: { type: 'TEXT' as const, notNull: true },
  role_id: { type: 'TEXT' as const, notNull: true },
}

/**
 * 创建数据库用户-角色关联存储
 */
export async function createDbUserRoleRepository(
  db: DbService,
  roleRepository: RoleRepository,
): Promise<UserRoleRepository> {
  // 确保表存在
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(USER_ROLE_TABLE, USER_ROLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createUserRoleTableFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    const indexResults = await Promise.all([
      db.ddl.createIndex(USER_ROLE_TABLE, 'idx_user_role_user_role', { columns: ['user_id', 'role_id'], unique: true }),
      db.ddl.createIndex(USER_ROLE_TABLE, 'idx_user_role_user', { columns: ['user_id'] }),
    ])
    for (const indexResult of indexResults) {
      if (!indexResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createUserRoleIndexFailed', { params: { message: indexResult.error.message } }),
          cause: indexResult.error,
        })
      }
    }

    return ok(undefined)
  }

  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  async function getRoleIdsInternal(userId: string, tx?: TxHandle): Promise<Result<string[], IamError>> {
    const runner = tx ?? db.sql
    const result = await runner.query<{ role_id: string }>(
      `SELECT role_id FROM ${USER_ROLE_TABLE} WHERE user_id = ?`,
      [userId],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    return ok(result.data.map(r => r.role_id))
  }

  return {
    async assign(userId, roleId, tx): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
      const result = await runner.execute(
        `INSERT OR IGNORE INTO ${USER_ROLE_TABLE} (user_id, role_id) VALUES (?, ?)`,
        [userId, roleId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_assignRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async remove(userId, roleId, tx): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
      const result = await runner.execute(
        `DELETE FROM ${USER_ROLE_TABLE} WHERE user_id = ? AND role_id = ?`,
        [userId, roleId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_removeRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async getRoleIds(userId, tx): Promise<Result<string[], IamError>> {
      return getRoleIdsInternal(userId, tx)
    },

    async getRoles(userId, tx): Promise<Result<Role[], IamError>> {
      const idsResult = await getRoleIdsInternal(userId, tx)
      if (!idsResult.success)
        return idsResult

      const roles: Role[] = []
      for (const id of idsResult.data) {
        const roleResult = await roleRepository.findById(id, tx)
        if (!roleResult.success) {
          return err({
            code: IamErrorCode.REPOSITORY_ERROR,
            message: iamM('iam_queryRoleFailed', { params: { message: roleResult.error.message } }),
            cause: roleResult.error,
          })
        }
        if (roleResult.data) {
          roles.push(roleResult.data)
        }
      }

      return ok(roles)
    },

    async hasRole(userId, roleCode, tx): Promise<Result<boolean, IamError>> {
      const runner = tx ?? db.sql
      const result = await runner.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${USER_ROLE_TABLE} ur
         JOIN iam_roles r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.code = ?`,
        [userId, roleCode],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data[0].cnt > 0)
    },
  }
}
