/**
 * @h-ai/iam — 授权子功能工厂（RBAC）
 *
 * 提供角色/权限的 CRUD、用户角色分配、权限检查等能力。
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { PaginatedResult, PaginationOptionsInput, Result } from '@h-ai/core'
import type { DbFunctions } from '@h-ai/db'

import type { IamConfig, RbacConfig } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
import type { PermissionRepository } from './iam-authz-repository-permission.js'
import type { RolePermissionRepository, UserRoleRepository } from './iam-authz-repository-relation.js'
import type { RoleRepository } from './iam-authz-repository-role.js'
import type {
  IamAuthzFunctions,
  Permission,
  Role,
} from './iam-authz-types.js'

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
export interface IamAuthzFunctionsDeps {
  config: IamConfig
  db: DbFunctions
  cache: CacheFunctions
}

/**
 * 创建授权子功能
 *
 * 内部创建 RBAC 所需的存储层，返回授权管理接口。
 */
export async function createIamAuthzFunctions(deps: IamAuthzFunctionsDeps): Promise<Result<IamAuthzFunctions, IamError>> {
  try {
    const { config, db, cache } = deps

    const roleRepository = await createDbRoleRepository(db)
    const permissionRepository = await createDbPermissionRepository(db)
    const rolePermissionRepository = await createDbRolePermissionRepository(db, permissionRepository, cache)
    const userRoleRepository = await createDbUserRoleRepository(db, roleRepository, cache)

    const manager = createRbacManager({
      rbacConfig: config.rbac,
      db,
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      userRoleRepository,
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
  db: DbFunctions
  roleRepository: RoleRepository
  permissionRepository: PermissionRepository
  rolePermissionRepository: RolePermissionRepository
  userRoleRepository: UserRoleRepository
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
function createRbacManager(config: RbacManagerConfig): IamAuthzFunctions {
  const rbacConfig = config.rbacConfig
    ? RbacConfigSchema.parse(config.rbacConfig)
    : RbacConfigSchema.parse({})

  const {
    db,
    roleRepository,
    permissionRepository,
    rolePermissionRepository,
    userRoleRepository,
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
    const codesResults = await Promise.all(
      roleIds.map(id => rolePermissionRepository.getPermissionCodesCached(id)),
    )

    for (const codesResult of codesResults) {
      if (!codesResult.success)
        return codesResult as Result<boolean, IamError>
      for (const code of codesResult.data) {
        if (matchesPermission(permission, code))
          return ok(true)
      }
    }

    return ok(false)
  }

  /**
   * 获取用户所有权限（通过角色聚合，并行查询）
   */
  async function getUserPermissionsInternal(userId: string): Promise<Result<Permission[], IamError>> {
    const rolesResult = await userRoleRepository.getRoles(userId)
    if (!rolesResult.success)
      return rolesResult as Result<Permission[], IamError>
    if (rolesResult.data.length === 0)
      return ok([])

    const permResults = await Promise.all(
      rolesResult.data.map(role => rolePermissionRepository.getPermissions(role.id)),
    )

    const permissions: Permission[] = []
    const seen = new Set<string>()
    for (const permResult of permResults) {
      if (!permResult.success)
        return permResult as Result<Permission[], IamError>
      for (const perm of permResult.data) {
        if (!seen.has(perm.id)) {
          permissions.push(perm)
          seen.add(perm.id)
        }
      }
    }

    return ok(permissions)
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

      // 无角色用户直接返回 false，跳过超管解析和权限缓存查询
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

      // 并行查询所有角色的权限（缓存优先）
      return hasPermissionInRoles(roleIds, permission)
    },

    async getUserPermissions(userId: string): Promise<Result<Permission[], IamError>> {
      return getUserPermissionsInternal(userId)
    },

    async getUserRoles(userId: string): Promise<Result<Role[], IamError>> {
      return userRoleRepository.getRoles(userId)
    },

    async assignRole(userId: string, roleId: string): Promise<Result<void, IamError>> {
      const roleExistsResult = await roleRepository.existsById(roleId)
      if (!roleExistsResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleExistsResult.error.message) as Result<void, IamError>
      }
      if (!roleExistsResult.data) {
        return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
      }

      const result = await userRoleRepository.assign(userId, roleId)
      if (result.success) {
        logger.info('Role assigned to user', { userId, roleId })
      }
      return result
    },

    async removeRole(userId: string, roleId: string): Promise<Result<void, IamError>> {
      const result = await userRoleRepository.remove(userId, roleId)
      if (result.success) {
        logger.info('Role removed from user', { userId, roleId })
      }
      return result
    },

    // =========================================================================
    // 角色管理
    // =========================================================================

    async createRole(role): Promise<Result<Role, IamError>> {
      const createResult = await roleRepository.create(role)
      if (!createResult.success) {
        const msg = createResult.error.message.toLowerCase()
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return err({ code: IamErrorCode.ROLE_ALREADY_EXISTS, message: iamM('iam_roleAlreadyExist') })
        }
        return mapRepositoryError('iam_createRoleFailed', createResult.error.message) as Result<Role, IamError>
      }

      const createdResult = await roleRepository.findByCode(role.code)
      if (!createdResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', createdResult.error.message) as Result<Role, IamError>
      }
      if (!createdResult.data) {
        return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
      }

      logger.info('Role created', { roleId: createdResult.data.id, code: role.code })

      // 创建的角色可能是超管角色，强制下次 checkPermission 重新解析
      if (role.code === rbacConfig.superAdminRole) {
        superAdminRoleId = undefined
      }

      return ok(createdResult.data)
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

    async updateRole(roleId, data): Promise<Result<Role, IamError>> {
      const updateResult = await roleRepository.updateById(roleId, data)
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateRoleFailed', updateResult.error.message) as Result<Role, IamError>
      }
      if (updateResult.data.changes === 0) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      const updatedResult = await roleRepository.findById(roleId)
      if (!updatedResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', updatedResult.error.message) as Result<Role, IamError>
      }
      if (!updatedResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      // 角色代码可能变更，强制下次 checkPermission 重新解析超管角色
      superAdminRoleId = undefined

      return ok(updatedResult.data)
    },

    async deleteRole(roleId): Promise<Result<void, IamError>> {
      // 校验角色存在且非系统角色
      const roleResult = await roleRepository.findById(roleId)
      if (!roleResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleResult.error.message) as Result<void, IamError>
      }
      if (!roleResult.data) {
        return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
      }
      if (roleResult.data.isSystem) {
        return err({ code: IamErrorCode.PERMISSION_DENIED, message: iamM('iam_cannotDeleteSystemRole') })
      }

      // 事务：所有 DB 删除原子执行
      const txResult = await db.tx.begin()
      if (!txResult.success) {
        return mapRepositoryError('iam_deleteRoleFailed', txResult.error.message) as Result<void, IamError>
      }
      const tx = txResult.data

      let affectedUserIds: string[] = []
      try {
        // 级联删除：用户-角色关联
        const userIdsResult = await userRoleRepository.removeByRoleId(roleId, tx)
        if (!userIdsResult.success) {
          await tx.rollback()
          return userIdsResult as Result<void, IamError>
        }
        affectedUserIds = userIdsResult.data

        // 级联删除：角色-权限关联
        const rpResult = await rolePermissionRepository.removeByRoleId(roleId, tx)
        if (!rpResult.success) {
          await tx.rollback()
          return rpResult
        }

        // 删除角色本身
        const delResult = await roleRepository.deleteById(roleId, tx)
        if (!delResult.success) {
          await tx.rollback()
          return mapRepositoryError('iam_deleteRoleFailed', delResult.error.message) as Result<void, IamError>
        }

        const commitResult = await tx.commit()
        if (!commitResult.success) {
          return mapRepositoryError('iam_deleteRoleFailed', commitResult.error.message) as Result<void, IamError>
        }
      }
      catch (error) {
        await tx.rollback()
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteRoleFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }

      // 事务提交后：缓存清理（最大努力）
      const cacheResult = await rolePermissionRepository.clearRolePermissionsCache(roleId)
      if (!cacheResult.success) {
        logger.error('Failed to clear role permission cache after deleteRole', { roleId, error: cacheResult.error.message })
      }

      // 事务提交后：同步受影响用户的会话角色（最大努力）
      for (const userId of affectedUserIds) {
        const syncResult = await userRoleRepository.syncUserSessionRoles(userId)
        if (!syncResult.success) {
          logger.error('Failed to sync user session after deleteRole', { userId, roleId, error: syncResult.error.message })
        }
      }

      // 强制下次 checkPermission 重新解析超管角色
      superAdminRoleId = undefined

      logger.info('Role deleted', { roleId })
      return ok(undefined)
    },

    // =========================================================================
    // 权限管理
    // =========================================================================

    async createPermission(permission): Promise<Result<Permission, IamError>> {
      const createResult = await permissionRepository.create(permission)
      if (!createResult.success) {
        const msg = createResult.error.message.toLowerCase()
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return err({ code: IamErrorCode.PERMISSION_ALREADY_EXISTS, message: iamM('iam_permissionAlreadyExist') })
        }
        return mapRepositoryError('iam_createPermissionFailed', createResult.error.message) as Result<Permission, IamError>
      }

      const createdResult = await permissionRepository.findByCode(permission.code)
      if (!createdResult.success) {
        return mapRepositoryError('iam_queryPermissionFailed', createdResult.error.message) as Result<Permission, IamError>
      }
      if (!createdResult.data) {
        return err({ code: IamErrorCode.PERMISSION_NOT_FOUND, message: iamM('iam_permissionNotExist') })
      }

      logger.info('Permission created', { permissionId: createdResult.data.id, code: permission.code })
      return ok(createdResult.data)
    },

    async getPermission(permissionId): Promise<Result<Permission | null, IamError>> {
      const result = await permissionRepository.findById(permissionId)
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionFailed', result.error.message) as Result<Permission | null, IamError>
      }
      return ok(result.data)
    },

    async getAllPermissions(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<Permission>, IamError>> {
      const result = await permissionRepository.findPage({
        orderBy: 'created_at DESC',
        pagination: options,
      })
      if (!result.success) {
        return mapRepositoryError('iam_queryPermissionListFailed', result.error.message) as Result<PaginatedResult<Permission>, IamError>
      }
      return ok(result.data)
    },

    async deletePermission(permissionId): Promise<Result<void, IamError>> {
      const permissionResult = await permissionRepository.findById(permissionId)
      if (!permissionResult.success) {
        return mapRepositoryError('iam_queryPermissionFailed', permissionResult.error.message) as Result<void, IamError>
      }
      if (!permissionResult.data) {
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }

      const permCode = permissionResult.data.code

      // 事务：所有 DB 删除原子执行
      const txResult = await db.tx.begin()
      if (!txResult.success) {
        return mapRepositoryError('iam_deletePermissionFailed', txResult.error.message) as Result<void, IamError>
      }
      const tx = txResult.data

      try {
        // 级联删除：角色-权限关联
        const cascadeResult = await rolePermissionRepository.removeByPermissionId(permissionId, tx)
        if (!cascadeResult.success) {
          await tx.rollback()
          return cascadeResult
        }

        // 删除权限本身
        const delResult = await permissionRepository.deleteById(permissionId, tx)
        if (!delResult.success) {
          await tx.rollback()
          return mapRepositoryError('iam_deletePermissionFailed', delResult.error.message) as Result<void, IamError>
        }

        const commitResult = await tx.commit()
        if (!commitResult.success) {
          return mapRepositoryError('iam_deletePermissionFailed', commitResult.error.message) as Result<void, IamError>
        }
      }
      catch (error) {
        await tx.rollback()
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deletePermissionFailed', { params: { message: String(error) } }),
          cause: error,
        })
      }

      // 事务提交后：缓存清理（最大努力）
      const cacheResult = await rolePermissionRepository.removePermissionCodeFromCache(permCode)
      if (!cacheResult.success) {
        logger.error('Failed to clear permission cache after deletePermission', { permissionId, permCode, error: cacheResult.error.message })
      }

      logger.info('Permission deleted', { permissionId })
      return ok(undefined)
    },

    async assignPermissionToRole(roleId, permissionId): Promise<Result<void, IamError>> {
      // 检查角色和权限是否存在
      const [roleResult, permResult] = await Promise.all([
        roleRepository.existsById(roleId),
        permissionRepository.findById(permissionId),
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

      const assignResult = await rolePermissionRepository.assign(roleId, permissionId, permResult.data.code)
      if (assignResult.success) {
        logger.info('Permission assigned to role', { roleId, permissionId })
      }
      return assignResult
    },

    async removePermissionFromRole(roleId, permissionId): Promise<Result<void, IamError>> {
      const permResult = await permissionRepository.findById(permissionId)
      if (!permResult.success) {
        return mapRepositoryError('iam_queryPermissionFailed', permResult.error.message) as Result<void, IamError>
      }
      if (!permResult.data) {
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }

      const removeResult = await rolePermissionRepository.remove(roleId, permissionId, permResult.data.code)
      if (removeResult.success) {
        logger.info('Permission removed from role', { roleId, permissionId })
      }
      return removeResult
    },

    async getRolePermissions(roleId): Promise<Result<Permission[], IamError>> {
      return rolePermissionRepository.getPermissions(roleId)
    },
  }
}
