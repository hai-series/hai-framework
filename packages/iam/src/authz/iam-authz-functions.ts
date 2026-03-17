/**
 * @h-ai/iam — 授权子功能工厂（RBAC）
 *
 * 提供角色/权限的 CRUD、用户角色分配、权限检查等能力。
 * @module iam-authz-functions
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbFunctions } from '@h-ai/reldb'

import type { IamConfig, RbacConfig } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
import type { SessionFieldUpdates, SessionOperations } from '../session/iam-session-types.js'
import type { PermissionRepository } from './iam-authz-repository-permission.js'
import type { RolePermissionRepository, UserRoleRepository } from './iam-authz-repository-relation.js'
import type { RoleRepository } from './iam-authz-repository-role.js'
import type {
  AuthzOperations,
  Permission,
  PermissionQueryOptions,
  Role,
} from './iam-authz-types.js'

import { audit } from '@h-ai/audit'
import { core, err, ok } from '@h-ai/core'

import { IamErrorCode, RbacConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { createDbPermissionRepository } from './iam-authz-repository-permission.js'
import { createDbRolePermissionRepository, createDbUserRoleRepository } from './iam-authz-repository-relation.js'
import { createDbRoleRepository } from './iam-authz-repository-role.js'

const logger = core.logger.child({ module: 'iam', scope: 'authz' })

// ─── 子功能依赖 ───

/**
 * 授权子功能依赖
 */
export interface AuthzOperationsDeps {
  config: IamConfig
  db: ReldbFunctions
  session: SessionOperations
}

/**
 * 创建授权子功能
 *
 * 内部创建 RBAC 所需的存储层，返回授权管理接口。
 */
export async function createAuthzOperations(deps: AuthzOperationsDeps): Promise<Result<AuthzOperations, IamError>> {
  try {
    const { config, db, session } = deps

    const roleRepository = await createDbRoleRepository(db)
    const permissionRepository = await createDbPermissionRepository(db)

    const rolePermResult = await createDbRolePermissionRepository(db)
    if (!rolePermResult.success) {
      return rolePermResult
    }

    const userRoleResult = await createDbUserRoleRepository(db, roleRepository)
    if (!userRoleResult.success) {
      return userRoleResult
    }

    const manager = createRbacManager({
      rbacConfig: config.rbac,
      db,
      roleRepository,
      permissionRepository,
      rolePermissionRepository: rolePermResult.data,
      userRoleRepository: userRoleResult.data,
      session,
    })

    logger.info('Authz sub-feature initialized')
    return ok(manager)
  }
  catch (error) {
    logger.error('Authz sub-feature initialization failed', { error })
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: iamM('iam_initComponentFailed'),
      cause: error,
    })
  }
}

// ─── 内部实现 ───

/**
 * RBAC 管理器内部配置
 */
interface RbacManagerConfig {
  rbacConfig?: RbacConfig
  db: ReldbFunctions
  roleRepository: RoleRepository
  permissionRepository: PermissionRepository
  rolePermissionRepository: RolePermissionRepository
  userRoleRepository: UserRoleRepository
  session: SessionOperations
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
    db,
    roleRepository,
    permissionRepository,
    rolePermissionRepository,
    userRoleRepository,
    session,
  } = config

  let superAdminRoleId: string | null | undefined

  /**
   * 解析超级管理员角色 ID
   *
   * 首次调用时从数据库查询，之后缓存结果。
   *
   * @returns 超管角色 ID，或 null（未配置时）
   */
  async function resolveSuperAdminRoleId(): Promise<Result<string | null, IamError>> {
    if (superAdminRoleId !== undefined) {
      return ok(superAdminRoleId)
    }

    const roleResult = await roleRepository.findByCode(rbacConfig.superAdminRole)
    if (!roleResult.success) {
      return mapRepositoryError('iam_queryRoleFailed', roleResult.error.message) as Result<string | null, IamError>
    }

    superAdminRoleId = roleResult.data?.id ?? null
    return ok(superAdminRoleId)
  }

  /**
   * 构建存储层错误响应
   *
   * @param messageKey - i18n 消息键
   * @param message - 原始错误消息
   */
  function mapRepositoryError(messageKey: Parameters<typeof iamM>[0], message: string) {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM(messageKey, { params: { message } }),
    })
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
   * 批量查询多个角色的权限代码，并判断是否匹配指定权限
   */
  async function hasPermissionInRoles(roleIds: string[], permission: string): Promise<Result<boolean, IamError>> {
    const codesResult = await rolePermissionRepository.getPermissionCodesForRoles(roleIds)
    if (!codesResult.success)
      return codesResult as Result<boolean, IamError>

    for (const code of codesResult.data) {
      if (matchesPermission(permission, code))
        return ok(true)
    }

    return ok(false)
  }

  /**
   * 获取用户所有权限（通过角色聚合，批量 JOIN 查询避免 N+1）
   */
  async function getUserPermissionsInternal(userId: string): Promise<Result<Permission[], IamError>> {
    const roleIdsResult = await userRoleRepository.getRoleIds(userId)
    if (!roleIdsResult.success)
      return roleIdsResult as Result<Permission[], IamError>
    if (roleIdsResult.data.length === 0)
      return ok([])

    const permMapResult = await rolePermissionRepository.getPermissionsForRoles(roleIdsResult.data)
    if (!permMapResult.success)
      return permMapResult as Result<Permission[], IamError>

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

    return ok(permissions)
  }

  /**
   * 解析用户所有权限 code（通过角色聚合）
   *
   * 用于会话权限同步：查用户角色 → 单次 JOIN 查询权限 code → 去重。
   */
  async function resolveUserPermissionCodes(userId: string): Promise<Result<string[], IamError>> {
    const roleIdsResult = await userRoleRepository.getRoleIds(userId)
    if (!roleIdsResult.success) {
      return roleIdsResult as Result<string[], IamError>
    }
    if (roleIdsResult.data.length === 0) {
      return ok([])
    }

    return rolePermissionRepository.getPermissionCodesForRoles(roleIdsResult.data)
  }

  /**
   * 解析用户所有角色 code
   *
   * 用于会话角色同步：查用户角色 → 提取 code。
   */
  async function resolveUserRoleCodes(userId: string): Promise<Result<string[], IamError>> {
    const rolesResult = await userRoleRepository.getRoles(userId)
    if (!rolesResult.success) {
      return rolesResult as Result<string[], IamError>
    }
    return ok(rolesResult.data.map(r => r.code))
  }

  /**
   * 角色权限变更后，同步所有持有该角色用户的 session permissions
   *
   * 最大努力：单用户同步失败仅记录日志，不阻塞其他用户。
   *
   * @param roleId - 发生权限变更的角色 ID
   */
  async function syncSessionPermissionsForRole(roleId: string): Promise<void> {
    const userIdsResult = await userRoleRepository.getUserIdsByRoleId(roleId)
    if (!userIdsResult.success) {
      logger.error('Failed to query users for permission sync', { roleId, error: userIdsResult.error.message })
      return
    }

    // 并行同步所有受影响用户的会话权限，避免 await-in-loop
    await Promise.allSettled(
      userIdsResult.data.map(async (userId) => {
        const permResult = await resolveUserPermissionCodes(userId)
        if (!permResult.success) {
          logger.error('Failed to resolve permissions for session sync', { userId, roleId, error: permResult.error.message })
          return
        }

        const syncResult = await session.patchUserSessions(userId, { permissions: permResult.data })
        if (!syncResult.success) {
          logger.error('Failed to sync session permissions', { userId, roleId, error: syncResult.error.message })
        }
      }),
    )
  }

  /**
   * 用户角色变更后，统一同步会话中的角色和权限
   *
   * 并行解析角色/权限 code，一次调用 patchUserSessions 写入。
   * 最大努力：解析或写入失败仅记录日志。
   *
   * @param userId - 受影响的用户 ID
   */
  async function syncUserSessionAfterRoleChange(userId: string): Promise<void> {
    const [roleCodesResult, permCodesResult] = await Promise.all([
      resolveUserRoleCodes(userId),
      resolveUserPermissionCodes(userId),
    ])

    const updates: SessionFieldUpdates = {}
    if (roleCodesResult.success) {
      updates.roles = roleCodesResult.data
    }
    else {
      logger.error('Failed to resolve roles for session sync', { userId, error: roleCodesResult.error.message })
    }
    if (permCodesResult.success) {
      updates.permissions = permCodesResult.data
    }
    else {
      logger.error('Failed to resolve permissions for session sync', { userId, error: permCodesResult.error.message })
    }

    if (updates.roles !== undefined || updates.permissions !== undefined) {
      const syncResult = await session.patchUserSessions(userId, updates)
      if (!syncResult.success) {
        logger.error('Failed to patch user sessions', { userId, error: syncResult.error.message })
      }
    }
  }

  return {
    async checkPermission(userId: string, permission: string): Promise<Result<boolean, IamError>> {
      // RBAC 未启用时，所有权限检查直接放行
      if (!rbacConfig.enabled) {
        return ok(true)
      }
      const roleIdsResult = await userRoleRepository.getRoleIds(userId)
      if (!roleIdsResult.success)
        return roleIdsResult as Result<boolean, IamError>

      const roleIds = roleIdsResult.data

      // 无角色用户直接返回 false，跳过超管解析和权限查询
      if (roleIds.length === 0) {
        return ok(false)
      }

      const superAdminResult = await resolveSuperAdminRoleId()
      if (!superAdminResult.success)
        return superAdminResult as Result<boolean, IamError>

      // 超级管理员拥有所有权限
      if (superAdminResult.data && roleIds.includes(superAdminResult.data)) {
        return ok(true)
      }

      // 查询所有角色的权限并匹配
      return hasPermissionInRoles(roleIds, permission)
    },

    async getUserPermissions(userId: string): Promise<Result<Permission[], IamError>> {
      return getUserPermissionsInternal(userId)
    },

    async getUserRoles(userId: string): Promise<Result<Role[], IamError>> {
      return userRoleRepository.getRoles(userId)
    },

    async assignRole(userId: string, roleId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const roleExistsResult = await roleRepository.existsById(roleId, tx)
      if (!roleExistsResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleExistsResult.error.message) as Result<void, IamError>
      }
      if (!roleExistsResult.data) {
        return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
      }

      const result = await userRoleRepository.assign(userId, roleId, tx)
      if (result.success) {
        logger.info('Role assigned to user', { userId, roleId })
        void audit.log({ action: 'role.assign', resource: 'iam_user_role', resourceId: userId, details: { roleId } })
        // 仅在非外部事务时同步会话（外部事务由调用方在 commit 后同步）
        if (!tx) {
          await syncUserSessionAfterRoleChange(userId)
        }
      }
      return result
    },

    async removeRole(userId: string, roleId: string, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const result = await userRoleRepository.remove(userId, roleId, tx)
      if (result.success) {
        logger.info('Role removed from user', { userId, roleId })
        void audit.log({ action: 'role.remove', resource: 'iam_user_role', resourceId: userId, details: { roleId } })
        // 仅在非外部事务时同步会话（外部事务由调用方在 commit 后同步）
        if (!tx) {
          await syncUserSessionAfterRoleChange(userId)
        }
      }
      return result
    },

    async syncRoles(userId: string, roleIds: string[], tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const currentResult = await userRoleRepository.getRoles(userId, tx)
      if (!currentResult.success) {
        return currentResult as Result<void, IamError>
      }

      const currentIds = new Set(currentResult.data.map(r => r.id))
      const targetIds = new Set(roleIds)

      const toRemove = [...currentIds].filter(id => !targetIds.has(id))
      const toAdd = [...targetIds].filter(id => !currentIds.has(id))

      // 无变化时直接返回
      if (toRemove.length === 0 && toAdd.length === 0) {
        return ok(undefined)
      }

      // 验证新增角色存在性
      for (const roleId of toAdd) {
        const existsResult = await roleRepository.existsById(roleId, tx)
        if (!existsResult.success) {
          return mapRepositoryError('iam_queryRoleFailed', existsResult.error.message) as Result<void, IamError>
        }
        if (!existsResult.data) {
          return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
        }
      }

      // 使用调用方事务或创建新事务，保证批量操作原子性
      const ownTx = !tx
      if (!tx) {
        const txResult = await db.tx.begin()
        if (!txResult.success) {
          return mapRepositoryError('iam_syncRolesFailed', txResult.error.message) as Result<void, IamError>
        }
        tx = txResult.data
      }

      try {
        // 批量移除
        for (const roleId of toRemove) {
          const result = await userRoleRepository.remove(userId, roleId, tx)
          if (!result.success) {
            if (ownTx)
              await tx.rollback()
            return result
          }
        }

        // 批量添加
        for (const roleId of toAdd) {
          const result = await userRoleRepository.assign(userId, roleId, tx)
          if (!result.success) {
            if (ownTx)
              await tx.rollback()
            return result
          }
        }

        if (ownTx) {
          const commitResult = await tx.commit()
          if (!commitResult.success) {
            return mapRepositoryError('iam_syncRolesFailed', commitResult.error.message) as Result<void, IamError>
          }
        }
      }
      catch (error) {
        if (ownTx)
          await tx.rollback()
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_syncRolesFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }

      logger.info('Roles synced for user', { userId, added: toAdd.length, removed: toRemove.length })
      void audit.log({ action: 'roles.sync', resource: 'iam_user_role', resourceId: userId, details: { added: toAdd, removed: toRemove } })

      // 事务提交后统一同步会话角色和权限
      if (ownTx) {
        await syncUserSessionAfterRoleChange(userId)
      }

      return ok(undefined)
    },

    // ─── 角色管理 ───

    async createRole(role, tx?: DmlWithTxOperations): Promise<Result<Role, IamError>> {
      // 使用调用方事务或创建新事务，保证 create+findByCode 原子性
      const ownTx = !tx
      if (!tx) {
        const txResult = await db.tx.begin()
        if (!txResult.success) {
          return mapRepositoryError('iam_createRoleFailed', txResult.error.message) as Result<Role, IamError>
        }
        tx = txResult.data
      }

      try {
        const createResult = await roleRepository.create(role, tx)
        if (!createResult.success) {
          if (ownTx)
            await tx.rollback()
          const msg = createResult.error.message.toLowerCase()
          if (msg.includes('unique') || msg.includes('duplicate')) {
            return err({ code: IamErrorCode.ROLE_ALREADY_EXISTS, message: iamM('iam_roleAlreadyExist') })
          }
          return mapRepositoryError('iam_createRoleFailed', createResult.error.message) as Result<Role, IamError>
        }

        const createdResult = await roleRepository.findByCode(role.code, tx)
        if (!createdResult.success) {
          if (ownTx)
            await tx.rollback()
          return mapRepositoryError('iam_queryRoleFailed', createdResult.error.message) as Result<Role, IamError>
        }
        if (!createdResult.data) {
          if (ownTx)
            await tx.rollback()
          return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
        }

        if (ownTx) {
          const commitResult = await tx.commit()
          if (!commitResult.success) {
            return mapRepositoryError('iam_createRoleFailed', commitResult.error.message) as Result<Role, IamError>
          }
        }

        logger.info('Role created', { roleId: createdResult.data.id, code: role.code })
        void audit.helper.crud({ action: 'create', resource: 'iam_role', resourceId: createdResult.data.id, details: { code: role.code } })

        // 创建的角色可能是超管角色，强制下次 checkPermission 重新解析
        if (role.code === rbacConfig.superAdminRole) {
          superAdminRoleId = undefined
        }

        return ok(createdResult.data)
      }
      catch (error) {
        if (ownTx)
          await tx.rollback()
        const msg = String(error).toLowerCase()
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return err({ code: IamErrorCode.ROLE_ALREADY_EXISTS, message: iamM('iam_roleAlreadyExist') })
        }
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createRoleFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }
    },

    async getRole(roleId): Promise<Result<Role | null, IamError>> {
      const result = await roleRepository.findById(roleId)
      if (!result.success) {
        return mapRepositoryError('iam_queryRoleFailed', result.error.message) as Result<Role | null, IamError>
      }
      return ok(result.data)
    },

    async getRoleByCode(code): Promise<Result<Role | null, IamError>> {
      const result = await roleRepository.findByCode(code)
      if (!result.success) {
        return mapRepositoryError('iam_queryRoleFailed', result.error.message) as Result<Role | null, IamError>
      }
      return ok(result.data)
    },

    async getAllRoles(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<Role>, IamError>> {
      const result = await roleRepository.findPage({
        orderBy: 'created_at DESC',
        pagination: options,
      })
      if (!result.success) {
        return mapRepositoryError('iam_queryRoleListFailed', result.error.message) as Result<PaginatedResult<Role>, IamError>
      }
      return ok(result.data)
    },

    async updateRole(roleId, data, tx?: DmlWithTxOperations): Promise<Result<Role, IamError>> {
      // 使用调用方事务或创建新事务，保证 update+findById 原子性
      const ownTx = !tx
      if (!tx) {
        const txResult = await db.tx.begin()
        if (!txResult.success) {
          return mapRepositoryError('iam_updateRoleFailed', txResult.error.message) as Result<Role, IamError>
        }
        tx = txResult.data
      }

      try {
        const updateResult = await roleRepository.updateById(roleId, data, tx)
        if (!updateResult.success) {
          if (ownTx)
            await tx.rollback()
          return mapRepositoryError('iam_updateRoleFailed', updateResult.error.message) as Result<Role, IamError>
        }
        if (updateResult.data.changes === 0) {
          if (ownTx)
            await tx.rollback()
          return err({
            code: IamErrorCode.ROLE_NOT_FOUND,
            message: iamM('iam_roleNotExist'),
          })
        }

        const updatedResult = await roleRepository.findById(roleId, tx)
        if (!updatedResult.success) {
          if (ownTx)
            await tx.rollback()
          return mapRepositoryError('iam_queryRoleFailed', updatedResult.error.message) as Result<Role, IamError>
        }
        if (!updatedResult.data) {
          if (ownTx)
            await tx.rollback()
          return err({
            code: IamErrorCode.ROLE_NOT_FOUND,
            message: iamM('iam_roleNotExist'),
          })
        }

        if (ownTx) {
          const commitResult = await tx.commit()
          if (!commitResult.success) {
            return mapRepositoryError('iam_updateRoleFailed', commitResult.error.message) as Result<Role, IamError>
          }
        }

        // 角色代码可能变更，强制下次 checkPermission 重新解析超管角色
        superAdminRoleId = undefined

        // 角色代码变更后同步受影响用户的会话（仅在自管事务时，外部事务由调用方在 commit 后同步）
        if (ownTx) {
          const affectedUsersResult = await userRoleRepository.getUserIdsByRoleId(roleId)
          if (affectedUsersResult.success) {
            for (const userId of affectedUsersResult.data) {
              await syncUserSessionAfterRoleChange(userId)
            }
          }
          else {
            logger.error('Failed to query affected users after updateRole', { roleId, error: affectedUsersResult.error.message })
          }
        }

        void audit.helper.crud({ action: 'update', resource: 'iam_role', resourceId: roleId, details: data as Record<string, unknown> })

        return ok(updatedResult.data)
      }
      catch (error) {
        if (ownTx)
          await tx.rollback()
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_updateRoleFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }
    },

    async deleteRole(roleId, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      // 校验角色存在且非系统角色
      const roleResult = await roleRepository.findById(roleId, tx)
      if (!roleResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleResult.error.message) as Result<void, IamError>
      }
      if (!roleResult.data) {
        return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
      }
      if (roleResult.data.isSystem) {
        return err({ code: IamErrorCode.PERMISSION_DENIED, message: iamM('iam_cannotDeleteSystemRole') })
      }

      // 使用调用方事务或创建新事务，保证级联删除原子执行
      const ownTx = !tx
      if (!tx) {
        const txResult = await db.tx.begin()
        if (!txResult.success) {
          return mapRepositoryError('iam_deleteRoleFailed', txResult.error.message) as Result<void, IamError>
        }
        tx = txResult.data
      }

      let affectedUserIds: string[] = []
      try {
        // 级联删除：用户-角色关联
        const userIdsResult = await userRoleRepository.removeByRoleId(roleId, tx)
        if (!userIdsResult.success) {
          if (ownTx)
            await tx.rollback()
          return userIdsResult as Result<void, IamError>
        }
        affectedUserIds = userIdsResult.data

        // 级联删除：角色-权限关联
        const rpResult = await rolePermissionRepository.removeByRoleId(roleId, tx)
        if (!rpResult.success) {
          if (ownTx)
            await tx.rollback()
          return rpResult
        }

        // 删除角色本身
        const delResult = await roleRepository.deleteById(roleId, tx)
        if (!delResult.success) {
          if (ownTx)
            await tx.rollback()
          return mapRepositoryError('iam_deleteRoleFailed', delResult.error.message) as Result<void, IamError>
        }

        if (ownTx) {
          const commitResult = await tx.commit()
          if (!commitResult.success) {
            return mapRepositoryError('iam_deleteRoleFailed', commitResult.error.message) as Result<void, IamError>
          }
        }
      }
      catch (error) {
        if (ownTx)
          await tx.rollback()
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteRoleFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }

      // 事务提交后：会话同步（仅在自管事务时，外部事务由调用方在 commit 后同步）
      if (ownTx) {
        for (const userId of affectedUserIds) {
          await syncUserSessionAfterRoleChange(userId)
        }
      }

      // 强制下次 checkPermission 重新解析超管角色
      superAdminRoleId = undefined

      logger.info('Role deleted', { roleId })
      void audit.helper.crud({ action: 'delete', resource: 'iam_role', resourceId: roleId })
      return ok(undefined)
    },

    // ─── 权限管理 ───

    async createPermission(permission, tx?: DmlWithTxOperations): Promise<Result<Permission, IamError>> {
      // 使用调用方事务或创建新事务，保证 create+findByCode 原子性
      const ownTx = !tx
      if (!tx) {
        const txResult = await db.tx.begin()
        if (!txResult.success) {
          return mapRepositoryError('iam_createPermissionFailed', txResult.error.message) as Result<Permission, IamError>
        }
        tx = txResult.data
      }

      try {
        const createResult = await permissionRepository.create(permission, tx)
        if (!createResult.success) {
          if (ownTx)
            await tx.rollback()
          const msg = createResult.error.message.toLowerCase()
          if (msg.includes('unique') || msg.includes('duplicate')) {
            return err({ code: IamErrorCode.PERMISSION_ALREADY_EXISTS, message: iamM('iam_permissionAlreadyExist') })
          }
          return mapRepositoryError('iam_createPermissionFailed', createResult.error.message) as Result<Permission, IamError>
        }

        const createdResult = await permissionRepository.findByCode(permission.code, tx)
        if (!createdResult.success) {
          if (ownTx)
            await tx.rollback()
          return mapRepositoryError('iam_queryPermissionFailed', createdResult.error.message) as Result<Permission, IamError>
        }
        if (!createdResult.data) {
          if (ownTx)
            await tx.rollback()
          return err({ code: IamErrorCode.PERMISSION_NOT_FOUND, message: iamM('iam_permissionNotExist') })
        }

        if (ownTx) {
          const commitResult = await tx.commit()
          if (!commitResult.success) {
            return mapRepositoryError('iam_createPermissionFailed', commitResult.error.message) as Result<Permission, IamError>
          }
        }

        logger.info('Permission created', { permissionId: createdResult.data.id, code: permission.code })
        void audit.helper.crud({ action: 'create', resource: 'iam_permission', resourceId: createdResult.data.id, details: { code: permission.code } })
        return ok(createdResult.data)
      }
      catch (error) {
        if (ownTx)
          await tx.rollback()
        const msg = String(error).toLowerCase()
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return err({ code: IamErrorCode.PERMISSION_ALREADY_EXISTS, message: iamM('iam_permissionAlreadyExist') })
        }
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createPermissionFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }
    },

    async getPermission(permissionId): Promise<Result<Permission | null, IamError>> {
      const result = await permissionRepository.findById(permissionId)
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionFailed', result.error.message) as Result<Permission | null, IamError>
      }
      return ok(result.data)
    },

    async getPermissionByCode(code): Promise<Result<Permission | null, IamError>> {
      const result = await permissionRepository.findByCode(code)
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionFailed', result.error.message) as Result<Permission | null, IamError>
      }
      return ok(result.data)
    },

    async getAllPermissions(options?: PermissionQueryOptions): Promise<Result<PaginatedResult<Permission>, IamError>> {
      const whereClauses: string[] = []
      const whereParams: unknown[] = []

      if (options?.type) {
        whereClauses.push('type = ?')
        whereParams.push(options.type)
      }

      if (options?.search) {
        whereClauses.push('(code LIKE ? OR name LIKE ?)')
        const escaped = options.search.replace(/[%_\\]/g, '\\$&')
        const pattern = `%${escaped}%`
        whereParams.push(pattern, pattern)
      }

      const result = await permissionRepository.findPage({
        where: whereClauses.length > 0 ? whereClauses.join(' AND ') : undefined,
        params: whereParams.length > 0 ? whereParams : undefined,
        orderBy: 'created_at DESC',
        pagination: options,
      })
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionListFailed', result.error.message) as Result<PaginatedResult<Permission>, IamError>
      }
      return ok(result.data)
    },

    async deletePermission(permissionId, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      const permissionResult = await permissionRepository.findById(permissionId, tx)
      if (!permissionResult.success) {
        return mapRepositoryError('iam_queryPermissionFailed', permissionResult.error.message) as Result<void, IamError>
      }
      if (!permissionResult.data) {
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }

      // 事务前：从 DB 查询哪些角色关联此权限（事务中会删除关联行）
      const affectedRoleIdsResult = await rolePermissionRepository.getRoleIdsByPermissionId(permissionId)
      const affectedRoleIds = affectedRoleIdsResult.success ? affectedRoleIdsResult.data : []

      // 使用调用方事务或创建新事务，保证级联删除原子执行
      const ownTx = !tx
      if (!tx) {
        const txResult = await db.tx.begin()
        if (!txResult.success) {
          return mapRepositoryError('iam_deletePermissionFailed', txResult.error.message) as Result<void, IamError>
        }
        tx = txResult.data
      }

      try {
        // 级联删除：角色-权限关联
        const cascadeResult = await rolePermissionRepository.removeByPermissionId(permissionId, tx)
        if (!cascadeResult.success) {
          if (ownTx)
            await tx.rollback()
          return cascadeResult
        }

        // 删除权限本身
        const delResult = await permissionRepository.deleteById(permissionId, tx)
        if (!delResult.success) {
          if (ownTx)
            await tx.rollback()
          return mapRepositoryError('iam_deletePermissionFailed', delResult.error.message) as Result<void, IamError>
        }

        if (ownTx) {
          const commitResult = await tx.commit()
          if (!commitResult.success) {
            return mapRepositoryError('iam_deletePermissionFailed', commitResult.error.message) as Result<void, IamError>
          }
        }
      }
      catch (error) {
        if (ownTx)
          await tx.rollback()
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deletePermissionFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }

      // 事务提交后：会话同步（仅在自管事务时，外部事务由调用方在 commit 后同步）
      if (ownTx) {
        for (const roleId of affectedRoleIds) {
          await syncSessionPermissionsForRole(roleId)
        }
      }

      logger.info('Permission deleted', { permissionId })
      void audit.helper.crud({ action: 'delete', resource: 'iam_permission', resourceId: permissionId })
      return ok(undefined)
    },

    async assignPermissionToRole(roleId, permissionId, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      // 检查角色和权限是否存在
      const [roleResult, permResult] = await Promise.all([
        roleRepository.existsById(roleId, tx),
        permissionRepository.findById(permissionId, tx),
      ])

      if (!roleResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleResult.error.message) as Result<void, IamError>
      }
      if (!roleResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      if (!permResult.success) {
        return mapRepositoryError('iam_queryPermissionFailed', permResult.error.message) as Result<void, IamError>
      }
      if (!permResult.data) {
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }

      const assignResult = await rolePermissionRepository.assign(roleId, permissionId, tx)
      if (assignResult.success) {
        logger.info('Permission assigned to role', { roleId, permissionId })
        void audit.log({ action: 'permission.assign', resource: 'iam_role_permission', resourceId: roleId, details: { permissionId } })
        // 仅在非外部事务时同步会话（外部事务由调用方在 commit 后同步）
        if (!tx) {
          await syncSessionPermissionsForRole(roleId)
        }
      }
      return assignResult
    },

    async removePermissionFromRole(roleId, permissionId, tx?: DmlWithTxOperations): Promise<Result<void, IamError>> {
      // 检查角色和权限是否存在
      const [roleResult, permResult] = await Promise.all([
        roleRepository.existsById(roleId, tx),
        permissionRepository.findById(permissionId, tx),
      ])

      if (!roleResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleResult.error.message) as Result<void, IamError>
      }
      if (!roleResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      if (!permResult.success) {
        return mapRepositoryError('iam_queryPermissionFailed', permResult.error.message) as Result<void, IamError>
      }
      if (!permResult.data) {
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }

      const removeResult = await rolePermissionRepository.remove(roleId, permissionId, tx)
      if (removeResult.success) {
        logger.info('Permission removed from role', { roleId, permissionId })
        void audit.log({ action: 'permission.remove', resource: 'iam_role_permission', resourceId: roleId, details: { permissionId } })
        // 仅在非外部事务时同步会话（外部事务由调用方在 commit 后同步）
        if (!tx) {
          await syncSessionPermissionsForRole(roleId)
        }
      }
      return removeResult
    },

    async getRolePermissions(roleId): Promise<Result<Permission[], IamError>> {
      return rolePermissionRepository.getPermissions(roleId)
    },

    async getUserRolesForMany(userIds): Promise<Result<Map<string, Role[]>, IamError>> {
      return userRoleRepository.getRolesForUsers(userIds)
    },

    async getRolePermissionsForMany(roleIds): Promise<Result<Map<string, Permission[]>, IamError>> {
      return rolePermissionRepository.getPermissionsForRoles(roleIds)
    },
  }
}
