/**
 * =============================================================================
 * @hai/iam - 关联关系存储实现
 * =============================================================================
 *
 * 包含角色-权限、用户-角色关联存储。
 *
 * @module iam-repository-relation
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type {
  IamError,
  Permission,
  Role,
  RolePermissionRepository,
  UserRoleRepository,
} from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// =============================================================================
// 角色-权限关联存储
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
  permissionRepository: { findById: (id: string) => Promise<Result<Permission | null, IamError>> },
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

  async function getPermissionIdsInternal(roleId: string): Promise<Result<string[], IamError>> {
    const result = await db.sql.query<{ permission_id: string }>(
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
    async assign(roleId, permissionId): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
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

    async remove(roleId, permissionId): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
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

    async getPermissionIds(roleId): Promise<Result<string[], IamError>> {
      return getPermissionIdsInternal(roleId)
    },

    async getPermissions(roleId): Promise<Result<Permission[], IamError>> {
      const idsResult = await getPermissionIdsInternal(roleId)
      if (!idsResult.success)
        return idsResult

      const permissions: Permission[] = []
      for (const id of idsResult.data) {
        const permResult = await permissionRepository.findById(id)
        if (permResult.success && permResult.data) {
          permissions.push(permResult.data)
        }
      }

      return ok(permissions)
    },

    async hasPermission(roleId, permissionCode): Promise<Result<boolean, IamError>> {
      const result = await db.sql.query<{ cnt: number }>(
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
// 用户-角色关联存储
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
  roleRepository: { findById: (id: string) => Promise<Result<Role | null, IamError>> },
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

  async function getRoleIdsInternal(userId: string): Promise<Result<string[], IamError>> {
    const result = await db.sql.query<{ role_id: string }>(
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
    async assign(userId, roleId): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
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

    async remove(userId, roleId): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
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

    async getRoleIds(userId): Promise<Result<string[], IamError>> {
      return getRoleIdsInternal(userId)
    },

    async getRoles(userId): Promise<Result<Role[], IamError>> {
      const idsResult = await getRoleIdsInternal(userId)
      if (!idsResult.success)
        return idsResult

      const roles: Role[] = []
      for (const id of idsResult.data) {
        const roleResult = await roleRepository.findById(id)
        if (roleResult.success && roleResult.data) {
          roles.push(roleResult.data)
        }
      }

      return ok(roles)
    },

    async hasRole(userId, roleCode): Promise<Result<boolean, IamError>> {
      const result = await db.sql.query<{ cnt: number }>(
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
