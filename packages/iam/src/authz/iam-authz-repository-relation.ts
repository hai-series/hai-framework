/**
 * @h-ai/iam — 关联关系存储实现
 *
 * 包含角色-权限、用户-角色关联存储。
 * @module iam-authz-repository-relation
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { Result } from '@h-ai/core'
import type { ReldbFunctions, ReldbTxHandle } from '@h-ai/reldb'
import type { IamError } from '../iam-types.js'
import type { PermissionRepository } from './iam-authz-repository-permission.js'
import type { RoleRepository } from './iam-authz-repository-role.js'
import type { Permission, Role } from './iam-authz-types.js'
import { core, err, ok } from '@h-ai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { buildTokenKey, buildUserTokensKey } from '../session/iam-session-repository-cache.js'

// ─── 角色-权限关联存储接口 ───

/**
 * 角色-权限关联存储接口
 */
export interface RolePermissionRepository {
  /**
   * 分配权限给角色
   */
  assign: (roleId: string, permissionId: string, permissionCode: string, tx?: ReldbTxHandle) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   */
  remove: (roleId: string, permissionId: string, permissionCode: string, tx?: ReldbTxHandle) => Promise<Result<void, IamError>>

  /**
   * 获取角色的所有权限 ID
   */
  getPermissionIds: (roleId: string, tx?: ReldbTxHandle) => Promise<Result<string[], IamError>>

  /**
   * 获取角色的所有权限
   */
  getPermissions: (roleId: string, tx?: ReldbTxHandle) => Promise<Result<Permission[], IamError>>

  /**
   * 获取角色的权限代码（缓存优先）
   *
   * 优先从缓存读取，未命中时回源数据库并回写缓存。
   * 可能返回非最新数据；写操作已自动同步缓存。
   */
  getPermissionCodesCached: (roleId: string, tx?: ReldbTxHandle) => Promise<Result<string[], IamError>>

  /**
   * 清理角色权限缓存
   */
  clearRolePermissionsCache: (roleId: string) => Promise<Result<void, IamError>>

  /**
   * 从全部角色权限缓存移除权限代码
   */
  removePermissionCodeFromCache: (permissionCode: string) => Promise<Result<void, IamError>>

  /**
   * 检查角色是否有某权限（缓存优先）
   *
   * 优先从缓存判断，未命中时加载全量权限代码到缓存后再判断。
   */
  hasPermissionCached: (roleId: string, permissionCode: string, tx?: ReldbTxHandle) => Promise<Result<boolean, IamError>>

  /**
   * 删除角色的所有权限关联（仅 DB 操作）
   *
   * 不清理缓存；调用方应在事务提交后调用 `clearRolePermissionsCache` 清理缓存。
   */
  removeByRoleId: (roleId: string, tx?: ReldbTxHandle) => Promise<Result<void, IamError>>

  /**
   * 删除权限的所有角色关联（仅 DB 操作）
   *
   * 不清理缓存；调用方应在事务提交后调用 `removePermissionCodeFromCache` 清理缓存。
   */
  removeByPermissionId: (permissionId: string, tx?: ReldbTxHandle) => Promise<Result<void, IamError>>

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
  assign: (userId: string, roleId: string, tx?: ReldbTxHandle) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   */
  remove: (userId: string, roleId: string, tx?: ReldbTxHandle) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有角色 ID
   */
  getRoleIds: (userId: string, tx?: ReldbTxHandle) => Promise<Result<string[], IamError>>

  /**
   * 获取用户的所有角色
   */
  getRoles: (userId: string, tx?: ReldbTxHandle) => Promise<Result<Role[], IamError>>

  /**
   * 删除角色的所有用户关联（仅 DB 操作）
   *
   * 返回受影响的用户 ID 列表。
   * 不同步会话；调用方应在事务提交后调用 `syncUserSessionRoles` 逐一同步。
   */
  removeByRoleId: (roleId: string, tx?: ReldbTxHandle) => Promise<Result<string[], IamError>>

  /**
   * 查询拥有指定角色的所有用户 ID
   *
   * @param roleId - 角色 ID
   * @returns 用户 ID 数组
   */
  getUserIdsByRoleId: (roleId: string) => Promise<Result<string[], IamError>>

  /**
   * 同步用户会话中的角色列表
   *
   * 角色变更后将用户最新角色列表回写到缓存中的所有活跃会话。
   */
  syncUserSessionRoles: (userId: string) => Promise<Result<void, IamError>>

  /**
   * 同步用户会话中的权限列表
   *
   * 将预计算好的权限 code 列表写入用户所有活跃会话。
   *
   * @param userId - 用户 ID
   * @param permissionCodes - 预计算的权限 code 列表
   */
  syncUserSessionPermissions: (userId: string, permissionCodes: string[]) => Promise<Result<void, IamError>>

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

const ROLE_PERMISSION_TABLE = 'iam_role_permissions'
const ROLE_PERMS_PREFIX = 'iam:role:'
const PERMISSION_ROLES_PREFIX = 'iam:permission:'
const logger = core.logger.child({ module: 'iam', scope: 'rbac-relation' })
const ROLE_PERMISSION_SCHEMA = {
  role_id: { type: 'TEXT' as const, notNull: true },
  permission_id: { type: 'TEXT' as const, notNull: true },
}

/**
 * 创建基于数据库的角色-权限关联存储
 *
 * 自动创建关联表和索引，提供分配/移除/查询权限以及缓存管理能力。
 *
 * @param db - 数据库服务实例
 * @param permissionRepository - 权限存储（用于查询权限详情）
 * @param cache - 缓存服务（用于权限代码缓存）
 * @returns 角色-权限关联存储接口实现（失败返回 IamError）
 */
export async function createDbRolePermissionRepository(
  db: ReldbFunctions,
  permissionRepository: PermissionRepository,
  cache: CacheFunctions,
): Promise<Result<RolePermissionRepository, IamError>> {
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
  async function getPermissionIdsInternal(roleId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
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

  /**
   * 查询角色的所有权限对象
   *
   * 先获取权限 ID 列表，再批量查询权限详情。
   *
   * @param roleId - 角色 ID
   * @param tx - 可选事务句柄
   * @returns Permission 数组
   */
  async function getPermissionsInternal(roleId: string, tx?: ReldbTxHandle): Promise<Result<Permission[], IamError>> {
    const idsResult = await getPermissionIdsInternal(roleId, tx)
    if (!idsResult.success)
      return idsResult

    if (idsResult.data.length === 0) {
      return ok([])
    }
    const placeholders = idsResult.data.map(() => '?').join(', ')
    const permResult = await permissionRepository.findAll({
      where: `id IN (${placeholders})`,
      params: idsResult.data,
    }, tx)
    if (!permResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryPermissionFailed', { params: { message: permResult.error.message } }),
        cause: permResult.error,
      })
    }

    return ok(permResult.data)
  }

  /**
   * 构建角色权限缓存 key
   *
   * @param roleId - 角色 ID
   * @returns 格式：`iam:role:{roleId}:perms`
   */
  function buildRolePermsKey(roleId: string): string {
    return `${ROLE_PERMS_PREFIX}${roleId}:perms`
  }

  /**
   * 构建权限对应角色集合的缓存 key
   *
   * @param permissionCode - 权限代码
   * @returns 格式：`iam:permission:{code}:roles`
   */
  function buildPermissionRolesKey(permissionCode: string): string {
    return `${PERMISSION_ROLES_PREFIX}${permissionCode}:roles`
  }

  /**
   * 将角色 ID 添加到权限缓存的角色集合中
   *
   * @param roleId - 角色 ID
   * @param permissionCodes - 权限代码列表
   */
  async function addRoleToPermissionCache(roleId: string, permissionCodes: string[]): Promise<Result<void, IamError>> {
    if (permissionCodes.length === 0) {
      return ok(undefined)
    }

    const addResults = await Promise.all(
      permissionCodes.map(code => cache.set_.sadd(buildPermissionRolesKey(code), roleId)),
    )
    for (const addResult of addResults) {
      if (!addResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_setPermissionCacheFailed', { params: { message: addResult.error.message } }),
          cause: addResult.error,
        })
      }
    }

    return ok(undefined)
  }

  /**
   * 从权限缓存的角色集合中移除角色 ID
   *
   * @param roleId - 角色 ID
   * @param permissionCodes - 权限代码列表
   */
  async function removeRoleFromPermissionCache(roleId: string, permissionCodes: string[]): Promise<Result<void, IamError>> {
    if (permissionCodes.length === 0) {
      return ok(undefined)
    }

    const removeResults = await Promise.all(
      permissionCodes.map(code => cache.set_.srem(buildPermissionRolesKey(code), roleId)),
    )
    for (const removeResult of removeResults) {
      if (!removeResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_setPermissionCacheFailed', { params: { message: removeResult.error.message } }),
          cause: removeResult.error,
        })
      }
    }

    return ok(undefined)
  }

  /**
   * 获取角色的权限代码列表（带缓存）
   *
   * 优先从缓存读取，缓存未命中时从数据库加载并回写缓存。
   *
   * @param roleId - 角色 ID
   * @param tx - 可选事务句柄
   * @returns 权限代码数组
   */
  async function getPermissionCodesCached(roleId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
    const key = buildRolePermsKey(roleId)

    const existsResult = await cache.kv.exists(key)
    if (!existsResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryPermissionCacheFailed', { params: { message: existsResult.error.message } }),
        cause: existsResult.error,
      })
    }

    if (existsResult.data > 0) {
      const cached = await cache.set_.smembers<string>(key)
      if (!cached.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionCacheFailed', { params: { message: cached.error.message } }),
          cause: cached.error,
        })
      }
      return ok(cached.data)
    }

    const permsResult = await getPermissionsInternal(roleId, tx)
    if (!permsResult.success) {
      return permsResult as Result<string[], IamError>
    }

    const codes = permsResult.data.map(perm => perm.code)
    if (codes.length > 0) {
      const setResult = await cache.set_.sadd(key, ...codes)
      if (!setResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_setPermissionCacheFailed', { params: { message: setResult.error.message } }),
          cause: setResult.error,
        })
      }

      const addRoleResult = await addRoleToPermissionCache(roleId, codes)
      if (!addRoleResult.success) {
        return addRoleResult
      }
    }

    return ok(codes)
  }

  return ok({
    async assign(roleId: string, permissionId: string, permissionCode: string, tx?: ReldbTxHandle): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
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

      const cacheResult = await cache.set_.sadd(buildRolePermsKey(roleId), permissionCode)
      if (!cacheResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_setPermissionCacheFailed', { params: { message: cacheResult.error.message } }),
          cause: cacheResult.error,
        })
      }

      const addRoleResult = await addRoleToPermissionCache(roleId, [permissionCode])
      if (!addRoleResult.success) {
        return addRoleResult
      }

      return ok(undefined)
    },

    async remove(roleId: string, permissionId: string, permissionCode: string, tx?: ReldbTxHandle): Promise<Result<void, IamError>> {
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

      const cacheResult = await cache.set_.srem(buildRolePermsKey(roleId), permissionCode)
      if (!cacheResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_setPermissionCacheFailed', { params: { message: cacheResult.error.message } }),
          cause: cacheResult.error,
        })
      }

      const removeRoleResult = await removeRoleFromPermissionCache(roleId, [permissionCode])
      if (!removeRoleResult.success) {
        return removeRoleResult
      }

      return ok(undefined)
    },

    async getPermissionIds(roleId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
      return getPermissionIdsInternal(roleId, tx)
    },

    async getPermissions(roleId: string, tx?: ReldbTxHandle): Promise<Result<Permission[], IamError>> {
      return getPermissionsInternal(roleId, tx)
    },

    async getPermissionCodesCached(roleId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
      return getPermissionCodesCached(roleId, tx)
    },

    async clearRolePermissionsCache(roleId: string): Promise<Result<void, IamError>> {
      const cachedCodes = await cache.set_.smembers<string>(buildRolePermsKey(roleId))
      if (!cachedCodes.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionCacheFailed', { params: { message: cachedCodes.error.message } }),
          cause: cachedCodes.error,
        })
      }

      const removeRoleResult = await removeRoleFromPermissionCache(roleId, cachedCodes.data)
      if (!removeRoleResult.success) {
        return removeRoleResult
      }

      const result = await cache.kv.del(buildRolePermsKey(roleId))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_clearPermissionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },

    async removePermissionCodeFromCache(permissionCode: string): Promise<Result<void, IamError>> {
      const roleIdsResult = await cache.set_.smembers<string>(buildPermissionRolesKey(permissionCode))
      if (!roleIdsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionCacheFailed', { params: { message: roleIdsResult.error.message } }),
          cause: roleIdsResult.error,
        })
      }

      const removeResults = await Promise.all(
        roleIdsResult.data.map(roleId => cache.set_.srem(buildRolePermsKey(roleId), permissionCode)),
      )
      for (const removeResult of removeResults) {
        if (!removeResult.success) {
          return err({
            code: IamErrorCode.REPOSITORY_ERROR,
            message: iamM('iam_setPermissionCacheFailed', { params: { message: removeResult.error.message } }),
            cause: removeResult.error,
          })
        }
      }

      const deleteResult = await cache.kv.del(buildPermissionRolesKey(permissionCode))
      if (!deleteResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_clearPermissionCacheFailed', { params: { message: deleteResult.error.message } }),
          cause: deleteResult.error,
        })
      }

      return ok(undefined)
    },

    async hasPermissionCached(roleId: string, permissionCode: string, tx?: ReldbTxHandle): Promise<Result<boolean, IamError>> {
      const cacheKey = buildRolePermsKey(roleId)
      const existsResult = await cache.kv.exists(cacheKey)
      if (!existsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionCacheFailed', { params: { message: existsResult.error.message } }),
          cause: existsResult.error,
        })
      }

      if (existsResult.data > 0) {
        const memberResult = await cache.set_.sismember(cacheKey, permissionCode)
        if (!memberResult.success) {
          return err({
            code: IamErrorCode.REPOSITORY_ERROR,
            message: iamM('iam_queryPermissionCacheFailed', { params: { message: memberResult.error.message } }),
            cause: memberResult.error,
          })
        }
        return ok(memberResult.data)
      }

      const codesResult = await getPermissionCodesCached(roleId, tx)
      if (!codesResult.success) {
        return codesResult as Result<boolean, IamError>
      }

      return ok(codesResult.data.includes(permissionCode))
    },

    async removeByRoleId(roleId: string, tx?: ReldbTxHandle): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
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

    async removeByPermissionId(permissionId: string, tx?: ReldbTxHandle): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
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
      const result = await db.sql.query<{ role_id: string }>(
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
      // 空列表直接返回空 Map
      if (roleIds.length === 0) {
        return ok(result)
      }

      // 批量查询所有角色的权限关联
      const placeholders = roleIds.map(() => '?').join(', ')
      const relationsResult = await db.sql.query<{ role_id: string, permission_id: string }>(
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

      // 初始化所有 roleId → 空数组
      for (const rid of roleIds) {
        result.set(rid, [])
      }

      if (relationsResult.data.length === 0) {
        return ok(result)
      }

      // 收集去重的 permissionId，批量查询权限详情
      const uniquePermIds = [...new Set(relationsResult.data.map(r => r.permission_id))]
      const permPlaceholders = uniquePermIds.map(() => '?').join(', ')
      const permsResult = await permissionRepository.findAll({
        where: `id IN (${permPlaceholders})`,
        params: uniquePermIds,
      })
      if (!permsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionFailed', { params: { message: permsResult.error.message } }),
          cause: permsResult.error,
        })
      }

      // permissionId → Permission 索引
      const permMap = new Map<string, Permission>()
      for (const perm of permsResult.data) {
        permMap.set(perm.id, perm)
      }

      // 按 roleId 分组填充
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

const USER_ROLE_TABLE = 'iam_user_roles'
const USER_ROLE_SCHEMA = {
  user_id: { type: 'TEXT' as const, notNull: true },
  role_id: { type: 'TEXT' as const, notNull: true },
}

/**
 * 创建基于数据库的用户-角色关联存储
 *
 * 自动创建关联表和索引。分配/移除角色时会自动同步用户会话中的角色列表。
 *
 * @param db - 数据库服务实例
 * @param roleRepository - 角色存储（用于查询角色详情）
 * @param cache - 缓存服务（用于同步会话角色）
 * @returns 用户-角色关联存储接口实现（失败返回 IamError）
 */
export async function createDbUserRoleRepository(
  db: ReldbFunctions,
  roleRepository: RoleRepository,
  cache: CacheFunctions,
): Promise<Result<UserRoleRepository, IamError>> {
  /**
   * 确保关联表和索引已创建
   *
   * 创建 `iam_user_roles` 表及唯一约束索引。
   */
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
  async function getRoleIdsInternal(userId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
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

  /**
   * 同步用户会话中的角色列表
   *
   * 角色变更后将用户最新角色列表回写到缓存中的所有活跃会话，
   * 同时清理已失效的会话令牌。
   *
   * @param userId - 用户 ID
   */
  async function syncUserSessionRoles(userId: string): Promise<Result<void, IamError>> {
    const idsResult = await getRoleIdsInternal(userId)
    if (!idsResult.success) {
      return idsResult as Result<void, IamError>
    }

    let roleCodes: string[] = []
    if (idsResult.data.length > 0) {
      const placeholders = idsResult.data.map(() => '?').join(', ')
      const roleResult = await roleRepository.findAll({
        where: `id IN (${placeholders})`,
        params: idsResult.data,
      })
      if (!roleResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: roleResult.error.message } }),
          cause: roleResult.error,
        })
      }
      roleCodes = roleResult.data.map(r => r.code)
    }

    const tokensResult = await cache.set_.smembers<string>(buildUserTokensKey(userId))
    if (!tokensResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryUserSessionCacheFailed', { params: { message: tokensResult.error.message } }),
        cause: tokensResult.error,
      })
    }

    const staleTokens: string[] = []
    let updatedTokens = 0

    for (const token of tokensResult.data) {
      const sessionKey = buildTokenKey(token)
      const sessionResult = await cache.kv.get<Record<string, unknown>>(sessionKey)
      if (!sessionResult.success || !sessionResult.data) {
        staleTokens.push(token)
        continue
      }

      const ttlResult = await cache.kv.ttl(sessionKey)
      if (!ttlResult.success || ttlResult.data <= 0) {
        staleTokens.push(token)
        continue
      }

      const updated = {
        ...sessionResult.data,
        roleCodes,
      }

      const setResult = await cache.kv.set(sessionKey, updated, { ex: ttlResult.data })
      if (!setResult.success) {
        logger.error('Failed to update user session roles cache', { userId, error: setResult.error.message })
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveUserSessionCacheFailed', { params: { message: setResult.error.message } }),
          cause: setResult.error,
        })
      }
      updatedTokens += 1
    }

    if (staleTokens.length > 0) {
      const removeResult = await cache.set_.srem(buildUserTokensKey(userId), ...staleTokens)
      if (!removeResult.success) {
        logger.error('Failed to remove stale user session tokens', { userId, error: removeResult.error.message })
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteUserSessionCacheFailed', { params: { message: removeResult.error.message } }),
          cause: removeResult.error,
        })
      }
    }

    if (updatedTokens > 0 || staleTokens.length > 0) {
      logger.info('User session roles synced', {
        userId,
        updatedTokens,
        staleTokens: staleTokens.length,
      })
    }

    return ok(undefined)
  }

  /**
   * 将预计算的权限 code 列表同步到用户所有活跃会话
   *
   * 遍历用户缓存中的所有 session token，更新 permissionCodes 字段，
   * 同时清理已失效的会话令牌。
   *
   * @param userId - 用户 ID
   * @param permissionCodes - 预计算的权限 code 列表
   */
  async function syncUserSessionPermissions(userId: string, permissionCodes: string[]): Promise<Result<void, IamError>> {
    const tokensResult = await cache.set_.smembers<string>(buildUserTokensKey(userId))
    if (!tokensResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryUserSessionCacheFailed', { params: { message: tokensResult.error.message } }),
        cause: tokensResult.error,
      })
    }

    const staleTokens: string[] = []
    let updatedTokens = 0

    for (const token of tokensResult.data) {
      const sessionKey = buildTokenKey(token)
      const sessionResult = await cache.kv.get<Record<string, unknown>>(sessionKey)
      if (!sessionResult.success || !sessionResult.data) {
        staleTokens.push(token)
        continue
      }

      const ttlResult = await cache.kv.ttl(sessionKey)
      if (!ttlResult.success || ttlResult.data <= 0) {
        staleTokens.push(token)
        continue
      }

      const updated = {
        ...sessionResult.data,
        permissionCodes,
      }

      const setResult = await cache.kv.set(sessionKey, updated, { ex: ttlResult.data })
      if (!setResult.success) {
        logger.error('Failed to update user session permissions cache', { userId, error: setResult.error.message })
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveUserSessionCacheFailed', { params: { message: setResult.error.message } }),
          cause: setResult.error,
        })
      }
      updatedTokens += 1
    }

    if (staleTokens.length > 0) {
      const removeResult = await cache.set_.srem(buildUserTokensKey(userId), ...staleTokens)
      if (!removeResult.success) {
        logger.error('Failed to remove stale user session tokens', { userId, error: removeResult.error.message })
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteUserSessionCacheFailed', { params: { message: removeResult.error.message } }),
          cause: removeResult.error,
        })
      }
    }

    if (updatedTokens > 0 || staleTokens.length > 0) {
      logger.info('User session permissions synced', {
        userId,
        updatedTokens,
        staleTokens: staleTokens.length,
      })
    }

    return ok(undefined)
  }

  return ok({
    async assign(userId: string, roleId: string, tx?: ReldbTxHandle): Promise<Result<void, IamError>> {
      const runner = tx ?? db.sql
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

      const syncResult = await syncUserSessionRoles(userId)
      if (!syncResult.success) {
        return syncResult
      }

      return ok(undefined)
    },

    async remove(userId: string, roleId: string, tx?: ReldbTxHandle): Promise<Result<void, IamError>> {
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

      const syncResult = await syncUserSessionRoles(userId)
      if (!syncResult.success) {
        return syncResult
      }

      return ok(undefined)
    },

    async getRoleIds(userId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
      return getRoleIdsInternal(userId, tx)
    },

    async getRoles(userId: string, tx?: ReldbTxHandle): Promise<Result<Role[], IamError>> {
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

    async removeByRoleId(roleId: string, tx?: ReldbTxHandle): Promise<Result<string[], IamError>> {
      const runner = tx ?? db.sql

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
      const result = await db.sql.query<{ user_id: string }>(
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

    syncUserSessionRoles,
    syncUserSessionPermissions,

    async getRolesForUsers(userIds: string[]): Promise<Result<Map<string, Role[]>, IamError>> {
      const result = new Map<string, Role[]>()
      // 空列表直接返回空 Map
      if (userIds.length === 0) {
        return ok(result)
      }

      // 批量查询所有用户的角色关联
      const placeholders = userIds.map(() => '?').join(', ')
      const relationsResult = await db.sql.query<{ user_id: string, role_id: string }>(
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
