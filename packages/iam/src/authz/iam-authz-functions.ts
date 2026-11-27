/**
 * @h-ai/iam — 授权子功能工厂（RBAC）
 *
 * 提供角色/权限的 CRUD、用户角色分配、权限检查等能力。
 * @module iam-authz-functions
 */

import type { HaiResult, PaginatedResult, PaginationOptionsInput } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { IamConfig, RbacConfig } from '../iam-config.js'
import type { SessionOperations } from '../session/iam-session-types.js'
import type { PermissionRepository } from './iam-authz-repository-permission.js'
import type { RolePermissionRepository, UserRoleRepository } from './iam-authz-repository-relation.js'

import type { RoleRepository } from './iam-authz-repository-role.js'
import type {
  AuthzOperations,
  Permission,
  PermissionQueryOptions,
  Role,
} from './iam-authz-types.js'
import { core } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'

import { protectIamTransaction, readIamCache } from '../iam-cache.js'
import { RbacConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { lockIamUser } from '../user/iam-user-repository-user.js'
import { createDbPermissionRepository } from './iam-authz-repository-permission.js'
import { createDbRolePermissionRepository, createDbUserRoleRepository } from './iam-authz-repository-relation.js'
import { createDbRoleRepository } from './iam-authz-repository-role.js'

const logger = core.logger.child({ module: 'iam', scope: 'authz' })
const sessionSyncBatchSize = 200
const sessionSyncConcurrency = 8
const waitingSessionSyncs: Array<() => void> = []
let activeSessionSyncs = 0

/** 各授权写入口共用额度。完成的任务直接将额度交给队首。 */
async function limitSessionSync<T>(run: () => Promise<T>): Promise<T> {
  if (activeSessionSyncs < sessionSyncConcurrency)
    activeSessionSyncs++
  else
    await new Promise<void>(resolve => waitingSessionSyncs.push(resolve))

  try {
    return await run()
  }
  finally {
    const next = waitingSessionSyncs.shift()
    if (next)
      next()
    else
      activeSessionSyncs--
  }
}

// ─── 子功能依赖 ───

/**
 * 授权子功能依赖
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function assemble(config: IamConfig, session: SessionOperations, getUserAuthorization: AuthzOperations['getUserAuthorization']) {
 *   const deps: AuthzOperationsDeps = { config, session, getUserAuthorization }
 *   return createAuthzOperations(deps)
 * }
 * ```
 */
export interface AuthzOperationsDeps {
  config: IamConfig
  session: SessionOperations
  /** 使用与验签共享的记录读取角色码和权限码。 */
  getUserAuthorization: AuthzOperations['getUserAuthorization']
}

/**
 * 创建授权子功能
 *
 * 内部创建 RBAC 所需的存储层，返回授权管理接口。
 * @param deps - 由 IAM 生命周期按依赖顺序创建的内部组件。
 * @returns 成功返回数据，失败返回业务或基础设施错误；调用方必须先判断 success。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function permission(deps: AuthzOperationsDeps) {
 *   const result = await createAuthzOperations(deps)
 *   if (!result.success)
 *     return result
 *   return result.data.checkPermission('user-1', 'report:read')
 * }
 * ```
 */
export async function createAuthzOperations(deps: AuthzOperationsDeps): Promise<HaiResult<AuthzOperations>> {
  try {
    const { config, session, getUserAuthorization } = deps

    const roleRepository = await createDbRoleRepository()
    const permissionRepository = await createDbPermissionRepository()

    const rolePermResult = await createDbRolePermissionRepository(permissionRepository)
    if (!rolePermResult.success) {
      return rolePermResult
    }

    const userRoleResult = await createDbUserRoleRepository(roleRepository)
    if (!userRoleResult.success) {
      return userRoleResult
    }

    const manager = createRbacManager({
      rbacConfig: config.rbac,
      roleRepository,
      permissionRepository,
      rolePermissionRepository: rolePermResult.data,
      userRoleRepository: userRoleResult.data,
      session,
      getUserAuthorization,
    })

    logger.info('Authz sub-feature initialized')
    return core.ok(manager)
  }
  catch (error) {
    logger.error('Authz sub-feature initialization failed', { error })
    return core.err(
      HaiIamError.CONFIG_ERROR,
      iamM('iam_initComponentFailed'),
      error,
    )
  }
}

// ─── 内部实现 ───

/**
 * RBAC 管理器内部配置
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function authorization(config: RbacManagerConfig) {
 *   return config.getUserAuthorization('user-1')
 * }
 * ```
 */
interface RbacManagerConfig {
  rbacConfig?: RbacConfig
  roleRepository: RoleRepository
  permissionRepository: PermissionRepository
  rolePermissionRepository: RolePermissionRepository
  userRoleRepository: UserRoleRepository
  session: SessionOperations
  getUserAuthorization: AuthzOperations['getUserAuthorization']
}

/**
 * 创建 RBAC 授权管理器
 *
 * 提供角色/权限的 CRUD、用户角色分配、权限检查等能力。
 * 内置超级管理员角色识别：超管角色自动拥有所有权限。
 *
 * @param config - RBAC 配置和存储层依赖
 * @returns 授权管理器接口实现
 */
function createRbacManager(config: RbacManagerConfig): AuthzOperations {
  const rbacConfig = config.rbacConfig
    ? RbacConfigSchema.parse(config.rbacConfig)
    : RbacConfigSchema.parse({})

  const {
    roleRepository,
    permissionRepository,
    rolePermissionRepository,
    userRoleRepository,
    session,
    getUserAuthorization,
  } = config

  /**
   * 构建存储层错误响应
   *
   * @param messageKey - i18n 消息键
   * @param message - 原始错误消息
   */
  function mapRepositoryError(messageKey: Parameters<typeof iamM>[0], message: string) {
    return core.err(
      HaiIamError.REPOSITORY_ERROR,
      iamM(messageKey, {
        params: { message },
      }),
    )
  }

  /** 在真实事务登记缓存失效，数据库确认完成后才返回给会话同步逻辑。 */
  async function writeAuthorization<T>(
    tx: DmlWithTxOperations | undefined,
    errorKey: Parameters<typeof iamM>[0],
    write: (transaction: DmlWithTxOperations) => Promise<HaiResult<T>>,
  ): Promise<HaiResult<T>> {
    async function guarded(transaction: DmlWithTxOperations): Promise<HaiResult<T>> {
      const protectedTx = await protectIamTransaction(transaction)
      return protectedTx.success
        ? write(transaction)
        : protectedTx
    }

    try {
      const result = tx
        ? await guarded(tx)
        : await reldb.tx.wrapResult(guarded)
      return !result.success && result.error.code === HaiReldbError.TRANSACTION_FAILED.code
        ? mapRepositoryError(errorKey, result.error.message)
        : result
    }
    catch (error) {
      return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionExpired'), error)
    }
  }

  /**
   * 判断权限代码是否匹配指定权限
   *
   * 支持通配符 `*`，如 `user:*` 匹配 `user:read`、`user:write`。
   *
   * @param permission - 要检查的权限
   * @param code - 角色拥有的权限代码
   * @returns 匹配返回 true
   */
  function matchesPermission(permission: string, code: string): boolean {
    if (code === permission) {
      return true
    }

    if (code.endsWith(':*')) {
      const prefix = code.slice(0, -1)
      return permission.startsWith(prefix)
    }

    return false
  }

  /**
   * 获取用户所有权限（通过角色聚合，批量 JOIN 查询避免 N+1）
   */
  async function getUserPermissionsInternal(userId: string): Promise<HaiResult<Permission[]>> {
    const roleIdsResult = await userRoleRepository.getRoleIds(userId)
    if (!roleIdsResult.success)
      return roleIdsResult as HaiResult<Permission[]>
    if (roleIdsResult.data.length === 0)
      return core.ok([])

    const permMapResult = await rolePermissionRepository.getPermissionsForRoles(roleIdsResult.data)
    if (!permMapResult.success)
      return permMapResult as HaiResult<Permission[]>

    const permissions: Permission[] = []
    const seen = new Set<string>()
    for (const perms of permMapResult.data.values()) {
      for (const perm of perms) {
        if (!seen.has(perm.id)) {
          permissions.push(perm)
          seen.add(perm.id)
        }
      }
    }

    return core.ok(permissions)
  }

  /** 用同一份数据库授权结果更新会话快照。失败只影响所在批次或用户。 */
  async function syncSessionAuthorization(userIds: string[], permissionsOnly = false): Promise<void> {
    const ids = [
      ...new Set(userIds),
    ]
    for (let offset = 0; offset < ids.length; offset += sessionSyncBatchSize) {
      const batch = ids.slice(offset, offset + sessionSyncBatchSize)
      try {
        const authorization = await limitSessionSync(() => userRoleRepository.getAuthorizationForUsers(batch))
        if (!authorization.success) {
          logger.error('Failed to read authorization for session sync', { userCount: batch.length, code: authorization.error.code })
          continue
        }

        await core.async.parallel([...authorization.data], async ([userId, grants]) => {
          try {
            const updates = permissionsOnly
              ? { permissions: grants.permissions }
              : grants
            const synced = await limitSessionSync(() => session.patchUserSessions(userId, updates))
            if (!synced.success)
              logger.error('Failed to patch user sessions', { userId, code: synced.error.code })
          }
          catch (error) {
            logger.error('Failed to patch user sessions', { userId, error })
          }
        }, sessionSyncConcurrency)
      }
      catch (error) {
        logger.error('Failed to read authorization for session sync', { userCount: batch.length, error })
      }
    }
  }

  /** 提交后读取当前角色成员。一个用户经不同角色受到影响时只同步一次。 */
  async function syncRoleSessions(roleIds: string[], permissionsOnly = false): Promise<void> {
    const affected = new Set<string>()
    for (let offset = 0; offset < roleIds.length; offset += sessionSyncBatchSize) {
      const batch = roleIds.slice(offset, offset + sessionSyncBatchSize)
      try {
        const found = await limitSessionSync(() => userRoleRepository.getUserIdsByRoleIds(batch))
        if (!found.success) {
          logger.error('Failed to query users for session sync', { roleCount: batch.length, code: found.error.code })
          continue
        }
        for (const userId of found.data)
          affected.add(userId)
      }
      catch (error) {
        logger.error('Failed to query users for session sync', { roleCount: batch.length, error })
      }
    }
    await syncSessionAuthorization([...affected], permissionsOnly)
  }

  /** 在调用方事务中完整替换权限，任何一步失败由外层统一回滚。 */
  async function replaceRolePermissions(roleId: string, permissionIds: string[], tx: DmlWithTxOperations): Promise<HaiResult<void>> {
    const uniqueIds = [
      ...new Set(permissionIds),
    ]
    for (const id of uniqueIds) {
      const permission = await permissionRepository.findById(id, tx)
      if (!permission.success)
        return permission
      if (!permission.data)
        return core.err(HaiIamError.PERMISSION_NOT_FOUND, iamM('iam_permissionNotExist'))
    }
    const removed = await rolePermissionRepository.removeByRoleId(roleId, tx)
    if (!removed.success)
      return removed
    for (const id of uniqueIds) {
      const assigned = await rolePermissionRepository.assign(roleId, id, tx)
      if (!assigned.success)
        return assigned
    }
    return core.ok(undefined)
  }

  async function updateRolePermission(
    roleId: string,
    permissionId: string,
    write: RolePermissionRepository['assign'] | RolePermissionRepository['remove'],
    tx: DmlWithTxOperations | undefined,
    errorKey: 'iam_assignPermissionFailed' | 'iam_removePermissionFailed',
  ): Promise<HaiResult<void>> {
    return writeAuthorization(tx, errorKey, async (transaction) => {
      const role = await roleRepository.lock(roleId, transaction)
      if (!role.success)
        return mapRepositoryError('iam_queryRoleFailed', role.error.message)
      if (!role.data)
        return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
      const permission = await permissionRepository.findById(permissionId, transaction)
      if (!permission.success)
        return mapRepositoryError('iam_queryPermissionFailed', permission.error.message)
      if (!permission.data)
        return core.err(HaiIamError.PERMISSION_NOT_FOUND, iamM('iam_permissionNotExist'))
      return write(roleId, permissionId, transaction)
    })
  }

  return {
    getSensitiveOperations: operation => rbacConfig.enabled
      ? readIamCache(`sensitive:${operation ?? '*'}`, () => permissionRepository.getSensitiveOperations(operation))
      : Promise.resolve(core.ok([])),
    async setPermissionSensitiveOperations(permissionId, operations) {
      if (!Array.isArray(operations) || operations.length > 1000 || operations.some(value => typeof value !== 'string' || !value.trim() || value.length > 128))
        return core.err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sensitiveOperationsInvalid'))
      return writeAuthorization(undefined, 'iam_queryPermissionFailed', async (tx) => {
        const updated = await permissionRepository.updateById(permissionId, {
          sensitiveOperations: [
            ...new Set(operations.map(value => value.trim())),
          ],
        }, tx)
        if (!updated.success)
          return updated
        // MySQL 对相同值的幂等更新可能返回 0，需区分记录不存在与内容未变化。
        if (updated.data.changes === 0) {
          const existing = await permissionRepository.findById(permissionId, tx)
          if (!existing.success)
            return existing
          if (!existing.data)
            return core.err(HaiIamError.PERMISSION_NOT_FOUND, iamM('iam_permissionNotExist'))
        }
        return core.ok(undefined)
      })
    },
    async checkPermission(userId: string, permission: string): Promise<HaiResult<boolean>> {
      // RBAC 未启用时，所有权限检查直接放行
      if (!rbacConfig.enabled) {
        return core.ok(true)
      }
      const authorization = await getUserAuthorization(userId)
      if (!authorization.success)
        return authorization
      return core.ok(authorization.data.roles.includes(rbacConfig.superAdminRole) || authorization.data.permissions.some(code => matchesPermission(permission, code)))
    },

    async getUserPermissions(userId: string): Promise<HaiResult<Permission[]>> {
      return getUserPermissionsInternal(userId)
    },

    getUserAuthorization,

    async getUserRoles(userId: string): Promise<HaiResult<Role[]>> {
      return userRoleRepository.getRoles(userId)
    },

    async assignRole(userId, roleId, tx): Promise<HaiResult<void>> {
      const result = await writeAuthorization(tx, 'iam_assignRoleFailed', async (transaction) => {
        const roleExists = await roleRepository.existsById(roleId, transaction)
        if (!roleExists.success)
          return mapRepositoryError('iam_queryRoleFailed', roleExists.error.message)
        if (!roleExists.data)
          return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
        return userRoleRepository.assign(userId, roleId, transaction)
      })
      if (result.success) {
        logger.info('Role assigned to user', { userId, roleId })
        if (!tx)
          await syncSessionAuthorization([userId])
      }
      return result
    },

    async removeRole(userId, roleId, tx): Promise<HaiResult<void>> {
      const result = await writeAuthorization(tx, 'iam_removeRoleFailed', transaction => userRoleRepository.remove(userId, roleId, transaction))
      if (result.success) {
        logger.info('Role removed from user', { userId, roleId })
        if (!tx)
          await syncSessionAuthorization([userId])
      }
      return result
    },

    async syncRoles(userId: string, roleIds: string[], tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
      const changed = await writeAuthorization(tx, 'iam_syncRolesFailed', async (transaction) => {
        // 独立替换角色和资料加角色的组合更新使用同一个账号锁，避免并发从同一旧集合计算差集。
        const locked = await lockIamUser(transaction, userId)
        if (!locked.success)
          return locked
        const current = await userRoleRepository.getRoles(userId, transaction)
        if (!current.success)
          return current

        const currentIds = new Set(current.data.map(role => role.id))
        const targetIds = new Set(roleIds)
        const toRemove = [...currentIds].filter(id => !targetIds.has(id))
        const toAdd = [...targetIds].filter(id => !currentIds.has(id))
        if (toRemove.length === 0 && toAdd.length === 0)
          return core.ok(false)

        for (const roleId of toAdd) {
          const exists = await roleRepository.existsById(roleId, transaction)
          if (!exists.success)
            return mapRepositoryError('iam_queryRoleFailed', exists.error.message)
          if (!exists.data)
            return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
        }

        for (const roleId of toRemove) {
          const result = await userRoleRepository.remove(userId, roleId, transaction)
          if (!result.success)
            return result
        }
        for (const roleId of toAdd) {
          const result = await userRoleRepository.assign(userId, roleId, transaction)
          if (!result.success)
            return result
        }
        return core.ok(true)
      })
      if (!changed.success)
        return changed
      if (changed.data && !tx) {
        logger.info('Roles synced for user', { userId })
        await syncSessionAuthorization([userId])
      }
      return core.ok(undefined)
    },

    // ─── 角色管理 ───

    async createRole(role, tx): Promise<HaiResult<Role>> {
      const { permissionIds, ...metadata } = role
      const result = await writeAuthorization(tx, 'iam_createRoleFailed', async (transaction) => {
        const created = await roleRepository.create(metadata, transaction)
        if (!created.success) {
          if (created.error.code === HaiReldbError.DUPLICATE_ENTRY.code)
            return core.err(HaiIamError.ROLE_ALREADY_EXISTS, iamM('iam_roleAlreadyExist'))
          return mapRepositoryError('iam_createRoleFailed', created.error.message)
        }
        const found = await roleRepository.findByCode(role.code, transaction)
        if (!found.success)
          return mapRepositoryError('iam_queryRoleFailed', found.error.message)
        if (!found.data)
          return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))

        if (permissionIds !== undefined) {
          const replaced = await replaceRolePermissions(found.data.id, permissionIds, transaction)
          if (!replaced.success)
            return replaced
        }
        return core.ok(found.data)
      })
      if (result.success)
        logger.info('Role created', { roleId: result.data.id, code: role.code })
      return result
    },

    async getRole(roleId): Promise<HaiResult<Role | null>> {
      const result = await roleRepository.findById(roleId)
      if (!result.success) {
        return mapRepositoryError('iam_queryRoleFailed', result.error.message) as HaiResult<Role | null>
      }
      return core.ok(result.data)
    },

    async getRoleByCode(code): Promise<HaiResult<Role | null>> {
      const result = await roleRepository.findByCode(code)
      if (!result.success) {
        return mapRepositoryError('iam_queryRoleFailed', result.error.message) as HaiResult<Role | null>
      }
      return core.ok(result.data)
    },

    async getAllRoles(options?: PaginationOptionsInput): Promise<HaiResult<PaginatedResult<Role>>> {
      const result = await roleRepository.findPage({
        orderBy: 'created_at DESC',
        pagination: options,
      })
      if (!result.success) {
        return mapRepositoryError('iam_queryRoleListFailed', result.error.message) as HaiResult<PaginatedResult<Role>>
      }
      return core.ok(result.data)
    },

    getRoleUserCounts(roleIds): Promise<HaiResult<Map<string, number>>> {
      return userRoleRepository.getUserCounts(roleIds)
    },

    async updateRole(roleId, data, tx): Promise<HaiResult<Role>> {
      const { permissionIds, expectedPermissionIds, ...metadata } = data
      const result = await writeAuthorization(tx, 'iam_updateRoleFailed', async (transaction) => {
        if (permissionIds !== undefined && expectedPermissionIds !== undefined) {
          const locked = await roleRepository.lock(roleId, transaction)
          if (!locked.success)
            return mapRepositoryError('iam_queryRoleFailed', locked.error.message)
          if (!locked.data)
            return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
          if (locked.data.isSystem || locked.data.code === rbacConfig.superAdminRole)
            return core.err(HaiIamError.FORBIDDEN, core.i18n.coreM('core_errorForbidden'))

          const current = await rolePermissionRepository.getPermissionIds(roleId, transaction)
          if (!current.success)
            return current
          const expected = new Set(expectedPermissionIds)
          if (current.data.length !== expected.size || current.data.some(id => !expected.has(id)))
            return core.err(HaiIamError.CONFLICT, iamM('iam_rolePermissionsChanged'))
        }

        const updated = Object.values(metadata).some(value => value !== undefined)
          ? await roleRepository.updateById(roleId, metadata, transaction)
          : await roleRepository.touch(roleId, transaction)
        if (!updated.success)
          return mapRepositoryError('iam_updateRoleFailed', updated.error.message)
        if (updated.data.changes === 0)
          return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))

        if (permissionIds !== undefined) {
          const replaced = await replaceRolePermissions(roleId, permissionIds, transaction)
          if (!replaced.success)
            return replaced
        }

        const found = await roleRepository.findById(roleId, transaction)
        if (!found.success)
          return mapRepositoryError('iam_queryRoleFailed', found.error.message)
        if (!found.data)
          return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
        return core.ok(found.data)
      })
      if (result.success && !tx)
        await syncRoleSessions([roleId])
      return result
    },

    async deleteRole(roleId, tx): Promise<HaiResult<void>> {
      const result = await writeAuthorization(tx, 'iam_deleteRoleFailed', async (transaction) => {
        const role = await roleRepository.findById(roleId, transaction)
        if (!role.success)
          return mapRepositoryError('iam_queryRoleFailed', role.error.message)
        if (!role.data)
          return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
        if (role.data.isSystem)
          return core.err(HaiIamError.PERMISSION_DENIED, iamM('iam_cannotDeleteSystemRole'))

        const affectedUsers = await userRoleRepository.removeByRoleId(roleId, transaction)
        if (!affectedUsers.success)
          return affectedUsers
        const permissionsRemoved = await rolePermissionRepository.removeByRoleId(roleId, transaction)
        if (!permissionsRemoved.success)
          return permissionsRemoved
        const deleted = await roleRepository.deleteById(roleId, transaction)
        if (!deleted.success)
          return mapRepositoryError('iam_deleteRoleFailed', deleted.error.message)
        return affectedUsers
      })
      if (!result.success)
        return result
      if (!tx)
        await syncSessionAuthorization(result.data)
      logger.info('Role deleted', { roleId })
      return core.ok(undefined)
    },

    // ─── 权限管理 ───

    async createPermission(permission, tx): Promise<HaiResult<Permission>> {
      const operations = permission.sensitiveOperations ?? []
      if (!Array.isArray(operations) || operations.length > 1000 || operations.some(value => typeof value !== 'string' || !value.trim() || value.length > 128))
        return core.err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sensitiveOperationsInvalid'))
      const input = {
        ...permission,
        sensitiveOperations: [
          ...new Set(operations.map(value => value.trim())),
        ],
      }
      const result = await writeAuthorization(tx, 'iam_createPermissionFailed', async (transaction) => {
        const created = await permissionRepository.create(input, transaction)
        if (!created.success) {
          if (created.error.code === HaiReldbError.DUPLICATE_ENTRY.code)
            return core.err(HaiIamError.PERMISSION_ALREADY_EXISTS, iamM('iam_permissionAlreadyExist'))
          return mapRepositoryError('iam_createPermissionFailed', created.error.message)
        }

        const found = await permissionRepository.findByCode(permission.code, transaction)
        if (!found.success)
          return mapRepositoryError('iam_queryPermissionFailed', found.error.message)
        if (!found.data)
          return core.err(HaiIamError.PERMISSION_NOT_FOUND, iamM('iam_permissionNotExist'))
        return core.ok(found.data)
      })
      if (result.success)
        logger.info('Permission created', { permissionId: result.data.id, code: permission.code })
      return result
    },

    async getPermission(permissionId): Promise<HaiResult<Permission | null>> {
      const result = await permissionRepository.findById(permissionId)
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionFailed', result.error.message) as HaiResult<Permission | null>
      }
      return core.ok(result.data)
    },

    async getPermissionByCode(code): Promise<HaiResult<Permission | null>> {
      const result = await permissionRepository.findByCode(code)
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionFailed', result.error.message) as HaiResult<Permission | null>
      }
      return core.ok(result.data)
    },

    async getAllPermissions(options?: PermissionQueryOptions): Promise<HaiResult<PaginatedResult<Permission>>> {
      const whereClauses: string[] = []
      const whereParams: unknown[] = []

      if (options?.type) {
        whereClauses.push('type = ?')
        whereParams.push(options.type)
      }

      if (options?.search) {
        const escaped = options.search.replace(/[%_\\]/g, '\\$&')
        const pattern = `%${escaped}%`
        whereClauses.push('(code LIKE ? ESCAPE \'\\\' OR name LIKE ? ESCAPE \'\\\')')
        whereParams.push(pattern, pattern)
      }

      const result = await permissionRepository.findPage({
        where: whereClauses.length > 0
          ? whereClauses.join(' AND ')
          : undefined,
        params: whereParams.length > 0
          ? whereParams
          : undefined,
        orderBy: 'created_at DESC',
        pagination: options,
      })
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionListFailed', result.error.message) as HaiResult<PaginatedResult<Permission>>
      }
      return core.ok(result.data)
    },

    async deletePermission(permissionId, tx): Promise<HaiResult<void>> {
      // 删除关联前定位受影响的角色，提交后再读取这些角色的当前成员。
      let affectedRoleIds: string[] = []
      if (!tx) {
        try {
          const found = await rolePermissionRepository.getRoleIdsByPermissionId(permissionId)
          if (found.success)
            affectedRoleIds = found.data
          else
            logger.error('Failed to query roles for permission sync', { permissionId, code: found.error.code })
        }
        catch (error) {
          logger.error('Failed to query roles for permission sync', { permissionId, error })
        }
      }

      const result = await writeAuthorization(tx, 'iam_deletePermissionFailed', async (transaction) => {
        const found = await permissionRepository.findById(permissionId, transaction)
        if (!found.success)
          return mapRepositoryError('iam_queryPermissionFailed', found.error.message)
        if (!found.data)
          return core.err(HaiIamError.PERMISSION_NOT_FOUND, iamM('iam_permissionNotExist'))
        const relations = await rolePermissionRepository.removeByPermissionId(permissionId, transaction)
        if (!relations.success)
          return relations
        const deleted = await permissionRepository.deleteById(permissionId, transaction)
        return deleted.success
          ? core.ok(undefined)
          : mapRepositoryError('iam_deletePermissionFailed', deleted.error.message)
      })
      if (!result.success)
        return result
      if (!tx)
        await syncRoleSessions(affectedRoleIds, true)
      logger.info('Permission deleted', { permissionId })
      return core.ok(undefined)
    },

    async assignPermissionToRole(roleId, permissionId, tx): Promise<HaiResult<void>> {
      const result = await updateRolePermission(roleId, permissionId, rolePermissionRepository.assign, tx, 'iam_assignPermissionFailed')
      if (result.success) {
        logger.info('Permission assigned to role', { roleId, permissionId })
        if (!tx)
          await syncRoleSessions([roleId], true)
      }
      return result
    },

    async removePermissionFromRole(roleId, permissionId, tx): Promise<HaiResult<void>> {
      const result = await updateRolePermission(roleId, permissionId, rolePermissionRepository.remove, tx, 'iam_removePermissionFailed')
      if (result.success) {
        logger.info('Permission removed from role', { roleId, permissionId })
        if (!tx)
          await syncRoleSessions([roleId], true)
      }
      return result
    },

    async getRolePermissions(roleId): Promise<HaiResult<Permission[]>> {
      return rolePermissionRepository.getPermissions(roleId)
    },

    async getUserRolesForMany(userIds): Promise<HaiResult<Map<string, Role[]>>> {
      return userRoleRepository.getRolesForUsers(userIds)
    },

    async getRolePermissionsForMany(roleIds): Promise<HaiResult<Map<string, Permission[]>>> {
      return rolePermissionRepository.getPermissionsForRoles(roleIds)
    },
  }
}
