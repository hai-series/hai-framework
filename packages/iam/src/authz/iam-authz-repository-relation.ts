/**
 * @h-ai/iam — 关联关系存储实现
 *
 * 包含角色-权限、用户-角色关联存储。
 * @module iam-authz-repository-relation
 */

import type { Result } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { IamError } from '../iam-types.js'
import type { RoleRepository } from './iam-authz-repository-role.js'
import type { Permission, Role } from './iam-authz-types.js'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// ─── 角色-权限关联存储接口 ───

/**
 * 角色-权限关联存储接口
 */
export interface RolePermissionRepository {
  /**
   * 分配权限给角色
   */
  assign: (roleId: string, permissionId: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   */
  remove: (roleId: string, permissionId: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>

  /**
   * 获取角色的所有权限
   */
  getPermissions: (roleId: string, tx?: DmlWithTxOperations) => Promise<Result<Permission[], IamError>>

  /**
   * 批量获取多个角色的权限代码（去重）
   *
   * 单次 JOIN 查询替代 N 次逐角色查询。
   *
   * @param roleIds - 角色 ID 列表
   * @returns 去重后的权限代码数组
   */
  getPermissionCodesForRoles: (roleIds: string[]) => Promise<Result<string[], IamError>>

  /**
   * 删除角色的所有权限关联
   */
  removeByRoleId: (roleId: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>

  /**
   * 删除权限的所有角色关联
   */
  removeByPermissionId: (permissionId: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>

  /**
   * 查询拥有指定权限的所有角色 ID
   *
   * @param permissionId - 权限 ID
   * @returns 角色 ID 数组
   */
  getRoleIdsByPermissionId: (permissionId: string) => Promise<Result<string[], IamError>>

  /**
   * 批量获取多个角色的权限列表
   *
   * 单次查询替代 N 次 getPermissions 调用，避免 N+1 问题。
   * 返回 Map：key 为 roleId，value 为该角色的权限列表；无权限的角色返回空数组。
   *
   * @param roleIds - 角色 ID 列表
   * @returns Map<roleId, Permission[]>
   */
  getPermissionsForRoles: (roleIds: string[]) => Promise<Result<Map<string, Permission[]>, IamError>>
}

// ─── 用户-角色关联存储接口 ───

/**
 * 用户-角色关联存储接口
 */
export interface UserRoleRepository {
  /**
   * 分配角色给用户
   */
  assign: (userId: string, roleId: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   */
  remove: (userId: string, roleId: string, tx?: DmlWithTxOperations) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有角色 ID
   */
  getRoleIds: (userId: string, tx?: DmlWithTxOperations) => Promise<Result<string[], IamError>>

  /**
   * 获取用户的所有角色
   */
  getRoles: (userId: string, tx?: DmlWithTxOperations) => Promise<Result<Role[], IamError>>

  /**
   * 删除角色的所有用户关联（仅 DB 操作）
   *
   * 返回受影响的用户 ID 列表。
   * 不同步会话；调用方应在事务提交后通过 SessionOperations 同步。
   */
  removeByRoleId: (roleId: string, tx?: DmlWithTxOperations) => Promise<Result<string[], IamError>>

  /**
   * 查询拥有指定角色的所有用户 ID
   *
   * @param roleId - 角色 ID
   * @returns 用户 ID 数组
   */
  getUserIdsByRoleId: (roleId: string) => Promise<Result<string[], IamError>>

  /**
   * 批量获取多个用户的角色列表
   *
   * 单次查询替代 N 次 getRoles 调用，避免 N+1 问题。
   * 返回 Map：key 为 userId，value 为该用户的角色列表；无角色的用户返回空数组。
   *
   * @param userIds - 用户 ID 列表
   * @returns Map<userId, Role[]>
   */
  getRolesForUsers: (userIds: string[]) => Promise<Result<Map<string, Role[]>, IamError>>
}

// ─── 角色-权限关联存储实现 ───

const ROLE_PERMISSION_TABLE = 'hai_iam_role_permissions'
const PERMISSION_TABLE = 'hai_iam_permissions'
const ROLE_PERMISSION_SCHEMA = {
  role_id: { type: 'TEXT' as const, notNull: true },
  permission_id: { type: 'TEXT' as const, notNull: true },
}

/**
 * 创建基于数据库的角色-权限关联存储
 *
 * 自动创建关联表和索引，提供分配/移除/查询权限能力。
 *
 * @returns 角色-权限关联存储接口实现（失败返回 IamError）
 */
export async function createDbRolePermissionRepository(): Promise<Result<RolePermissionRepository, IamError>> {
  // 确保表存在
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await reldb.ddl.createTable(ROLE_PERMISSION_TABLE, ROLE_PERMISSION_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createRolePermissionTableFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    const indexResults = await Promise.all([
      reldb.ddl.createIndex(ROLE_PERMISSION_TABLE, 'idx_role_perm_role_perm', { columns: ['role_id', 'permission_id'], unique: true }),
      reldb.ddl.createIndex(ROLE_PERMISSION_TABLE, 'idx_role_perm_role', { columns: ['role_id'] }),
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
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: initResult.error.message,
      cause: initResult.error,
    })
  }

  /**
   * 查询角色的所有权限 ID
   *
   * @param roleId - 角色 ID
   * @param tx - 可选事务句柄
   * @returns 权限 ID 数组
   */
  async function getPermissionIdsInternal(roleId: string, tx?: DmlWithTxOperations): Promise<Result<string[], IamError>> {
    const runner = tx ?? reldb.sql
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

  return ok({
    async assign(roleId: string, permissionId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const runner = tx ?? reldb.sql
      const result = await runner.execute(
        `INSERT INTO ${ROLE_PERMISSION_TABLE} (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
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

    async remove(roleId: string, permissionId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const runner = tx ?? reldb.sql
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

    async getPermissions(roleId: string, tx?: DmlWithTxOperations): Promise<Result<Permission[], IamError>> {
      const idsResult = await getPermissionIdsInternal(roleId, tx)
      if (!idsResult.success)
        return idsResult

      if (idsResult.data.length === 0) {
        return ok([])
      }

      const placeholders = idsResult.data.map(() => '?').join(', ')
      const result = await reldb.sql.query<Record<string, unknown>>(
        `SELECT * FROM ${PERMISSION_TABLE} WHERE id IN (${placeholders})`,
        idsResult.data,
      )
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data as unknown as Permission[])
    },

    async getPermissionCodesForRoles(roleIds: string[]): Promise<Result<string[], IamError>> {
      if (roleIds.length === 0) {
        return ok([])
      }

      const placeholders = roleIds.map(() => '?').join(', ')
      const result = await reldb.sql.query<{ code: string }>(
        `SELECT DISTINCT p.code FROM ${ROLE_PERMISSION_TABLE} rp JOIN ${PERMISSION_TABLE} p ON rp.permission_id = p.id WHERE rp.role_id IN (${placeholders})`,
        roleIds,
      )
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data.map(r => r.code))
    },

    async removeByRoleId(roleId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const runner = tx ?? reldb.sql
      const result = await runner.execute(
        `DELETE FROM ${ROLE_PERMISSION_TABLE} WHERE role_id = ?`,
        [roleId],
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

    async removeByPermissionId(permissionId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const runner = tx ?? reldb.sql
      const result = await runner.execute(
        `DELETE FROM ${ROLE_PERMISSION_TABLE} WHERE permission_id = ?`,
        [permissionId],
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

    async getRoleIdsByPermissionId(permissionId: string): Promise<Result<string[], IamError>> {
      const result = await reldb.sql.query<{ role_id: string }>(
        `SELECT role_id FROM ${ROLE_PERMISSION_TABLE} WHERE permission_id = ?`,
        [permissionId],
      )
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(result.data.map(r => r.role_id))
    },

    async getPermissionsForRoles(roleIds: string[]): Promise<Result<Map<string, Permission[]>, IamError>> {
      const result = new Map<string, Permission[]>()
      if (roleIds.length === 0) {
        return ok(result)
      }

      const placeholders = roleIds.map(() => '?').join(', ')
      const relationsResult = await reldb.sql.query<{ role_id: string, permission_id: string }>(
        `SELECT role_id, permission_id FROM ${ROLE_PERMISSION_TABLE} WHERE role_id IN (${placeholders})`,
        roleIds,
      )
      if (!relationsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: relationsResult.error.message } }),
          cause: relationsResult.error,
        })
      }

      for (const rid of roleIds) {
        result.set(rid, [])
      }

      if (relationsResult.data.length === 0) {
        return ok(result)
      }

      const uniquePermIds = [...new Set(relationsResult.data.map(r => r.permission_id))]
      const permPlaceholders = uniquePermIds.map(() => '?').join(', ')
      const permsResult = await reldb.sql.query<Record<string, unknown>>(
        `SELECT * FROM ${PERMISSION_TABLE} WHERE id IN (${permPlaceholders})`,
        uniquePermIds,
      )
      if (!permsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: permsResult.error.message } }),
          cause: permsResult.error,
        })
      }

      const permMap = new Map<string, Permission>()
      for (const perm of permsResult.data as unknown as Permission[]) {
        permMap.set(perm.id, perm)
      }

      for (const rel of relationsResult.data) {
        const perm = permMap.get(rel.permission_id)
        if (perm) {
          result.get(rel.role_id)!.push(perm)
        }
      }

      return ok(result)
    },
  })
}

// ─── 用户-角色关联存储实现 ───

const USER_ROLE_TABLE = 'hai_iam_user_roles'
const USER_ROLE_SCHEMA = {
  user_id: { type: 'TEXT' as const, notNull: true },
  role_id: { type: 'TEXT' as const, notNull: true },
}

/**
 * 创建基于数据库的用户-角色关联存储
 *
 * 自动创建关联表和索引，提供分配/移除/查询角色能力。
 * 会话同步由上层（authz functions）通过 SessionOperations 完成。
 *
 * @param roleRepository - 角色存储（用于查询角色详情）
 * @returns 用户-角色关联存储接口实现（失败返回 IamError）
 */
export async function createDbUserRoleRepository(
  roleRepository: RoleRepository,
): Promise<Result<UserRoleRepository, IamError>> {
  /**
   * 确保关联表和索引已创建
   *
   * 创建 `hai_iam_user_roles` 表及唯一约束索引。
   */
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await reldb.ddl.createTable(USER_ROLE_TABLE, USER_ROLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createUserRoleTableFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    const indexResults = await Promise.all([
      reldb.ddl.createIndex(USER_ROLE_TABLE, 'idx_user_role_user_role', { columns: ['user_id', 'role_id'], unique: true }),
      reldb.ddl.createIndex(USER_ROLE_TABLE, 'idx_user_role_user', { columns: ['user_id'] }),
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
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: initResult.error.message,
      cause: initResult.error,
    })
  }

  /**
   * 查询用户的所有角色 ID
   *
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 角色 ID 数组
   */
  async function getRoleIdsInternal(userId: string, tx?: DmlWithTxOperations): Promise<Result<string[], IamError>> {
    const runner = tx ?? reldb.sql
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

  return ok({
    async assign(userId: string, roleId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const runner = tx ?? reldb.sql
      const result = await runner.execute(
        `INSERT INTO ${USER_ROLE_TABLE} (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
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

    async remove(userId: string, roleId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const runner = tx ?? reldb.sql
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

    async getRoleIds(userId: string, tx?: DmlWithTxOperations): Promise<Result<string[], IamError>> {
      return getRoleIdsInternal(userId, tx)
    },

    async getRoles(userId: string, tx?: DmlWithTxOperations): Promise<Result<Role[], IamError>> {
      const idsResult = await getRoleIdsInternal(userId, tx)
      if (!idsResult.success)
        return idsResult

      if (idsResult.data.length === 0) {
        return ok([])
      }
      const placeholders = idsResult.data.map(() => '?').join(', ')
      const roleResult = await roleRepository.findAll({
        where: `id IN (${placeholders})`,
        params: idsResult.data,
      }, tx)
      if (!roleResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: roleResult.error.message } }),
          cause: roleResult.error,
        })
      }

      return ok(roleResult.data)
    },

    async removeByRoleId(roleId: string, tx?: DmlWithTxOperations): Promise<Result<string[], IamError>> {
      const runner = tx ?? reldb.sql

      // 查出受影响的用户 ID
      const usersResult = await runner.query<{ user_id: string }>(
        `SELECT user_id FROM ${USER_ROLE_TABLE} WHERE role_id = ?`,
        [roleId],
      )
      if (!usersResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: usersResult.error.message } }),
          cause: usersResult.error,
        })
      }

      // 删除关联行
      const deleteResult = await runner.execute(
        `DELETE FROM ${USER_ROLE_TABLE} WHERE role_id = ?`,
        [roleId],
      )
      if (!deleteResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_removeRoleFailed', { params: { message: deleteResult.error.message } }),
          cause: deleteResult.error,
        })
      }

      return ok(usersResult.data.map(r => r.user_id))
    },

    async getUserIdsByRoleId(roleId: string): Promise<Result<string[], IamError>> {
      const result = await reldb.sql.query<{ user_id: string }>(
        `SELECT user_id FROM ${USER_ROLE_TABLE} WHERE role_id = ?`,
        [roleId],
      )
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(result.data.map(r => r.user_id))
    },

    async getRolesForUsers(userIds: string[]): Promise<Result<Map<string, Role[]>, IamError>> {
      const result = new Map<string, Role[]>()
      // 空列表直接返回空 Map
      if (userIds.length === 0) {
        return ok(result)
      }

      // 批量查询所有用户的角色关联
      const placeholders = userIds.map(() => '?').join(', ')
      const relationsResult = await reldb.sql.query<{ user_id: string, role_id: string }>(
        `SELECT user_id, role_id FROM ${USER_ROLE_TABLE} WHERE user_id IN (${placeholders})`,
        userIds,
      )
      if (!relationsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: relationsResult.error.message } }),
          cause: relationsResult.error,
        })
      }

      // 初始化所有 userId → 空数组
      for (const uid of userIds) {
        result.set(uid, [])
      }

      if (relationsResult.data.length === 0) {
        return ok(result)
      }

      // 收集去重的 roleId，批量查询角色详情
      const uniqueRoleIds = [...new Set(relationsResult.data.map(r => r.role_id))]
      const rolePlaceholders = uniqueRoleIds.map(() => '?').join(', ')
      const rolesResult = await roleRepository.findAll({
        where: `id IN (${rolePlaceholders})`,
        params: uniqueRoleIds,
      })
      if (!rolesResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: rolesResult.error.message } }),
          cause: rolesResult.error,
        })
      }

      // roleId → Role 索引
      const roleMap = new Map<string, Role>()
      for (const role of rolesResult.data) {
        roleMap.set(role.id, role)
      }

      // 按 userId 分组填充
      for (const rel of relationsResult.data) {
        const role = roleMap.get(rel.role_id)
        if (role) {
          result.get(rel.user_id)!.push(role)
        }
      }

      return ok(result)
    },
  })
}
