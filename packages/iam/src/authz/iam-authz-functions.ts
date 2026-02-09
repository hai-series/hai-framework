/**
 * @hai/iam — 授权子功能工厂（RBAC）
 *
 * 提供角色/权限的 CRUD、用户角色分配、权限检查等能力。
 */

import type { CacheFunctions } from '@hai/cache'
import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { DbFunctions } from '@hai/db'

import type { IamConfig, RbacConfig } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
import type { PermissionRepository } from './iam-authz-repository-permission.js'
import type { RolePermissionRepository, UserRoleRepository } from './iam-authz-repository-relation.js'
import type { RoleRepository } from './iam-authz-repository-role.js'
import type {
  AuthzContext,
  IamAuthzFunctions,
  Permission,
  Role,
} from './iam-authz-types.js'

import { core, err, ok } from '@hai/core'

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
   * 解析用户角色 ID 列表
   *
   * 优先使用上下文中已有的 roles，若为空则从数据库查询。
   *
   * @param ctx - 授权上下文
   * @returns 角色 ID 数组
   */
  async function resolveRoleIds(ctx: AuthzContext): Promise<Result<string[], IamError>> {
    if (ctx.roles.length > 0) {
      return ok(ctx.roles)
    }

    const rolesResult = await userRoleRepository.getRoleIds(ctx.userId)
    if (!rolesResult.success) {
      return rolesResult
    }

    return ok(rolesResult.data)
  }

  /**
   * 批量查询多个角色的权限代码，并判断是否匹配指定权限
   */
  async function hasPermissionInRoles(roleIds: string[], permission: string): Promise<Result<boolean, IamError>> {
    const codesResults = await Promise.all(
      roleIds.map(id => rolePermissionRepository.getPermissionCodes(id)),
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
    async checkPermission(ctx: AuthzContext, permission: string): Promise<Result<boolean, IamError>> {
      const roleIdsResult = await resolveRoleIds(ctx)
      if (!roleIdsResult.success)
        return roleIdsResult as Result<boolean, IamError>

      const superAdminResult = await resolveSuperAdminRoleId()
      if (!superAdminResult.success)
        return superAdminResult as Result<boolean, IamError>

      const roleIds = roleIdsResult.data

      // 超级管理员拥有所有权限
      if (superAdminResult.data && roleIds.includes(superAdminResult.data)) {
        return ok(true)
      }

      // 并行查询所有角色的权限
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
      return ok(createdResult.data)
    },

    async getRole(roleId): Promise<Result<Role | null, IamError>> {
      const result = await roleRepository.findById(roleId)
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
      return ok(updatedResult.data)
    },

    async deleteRole(roleId): Promise<Result<void, IamError>> {
      const deleteResult = await roleRepository.deleteById(roleId)
      if (!deleteResult.success) {
        return mapRepositoryError('iam_deleteRoleFailed', deleteResult.error.message) as Result<void, IamError>
      }
      if (deleteResult.data.changes === 0) {
        return err({ code: IamErrorCode.ROLE_NOT_FOUND, message: iamM('iam_roleNotExist') })
      }

      if (superAdminRoleId && superAdminRoleId === roleId) {
        superAdminRoleId = null
      }
      await rolePermissionRepository.clearRolePermissionsCache(roleId)

      logger.info('Role deleted', { roleId })
      return ok(undefined)
    },

    // =========================================================================
    // 权限管理
    // =========================================================================

    async createPermission(permission): Promise<Result<Permission, IamError>> {
      const createResult = await permissionRepository.create(permission)
      if (!createResult.success) {
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

      const deleteResult = await permissionRepository.deleteById(permissionId)
      if (!deleteResult.success) {
        return mapRepositoryError('iam_deletePermissionFailed', deleteResult.error.message) as Result<void, IamError>
      }
      if (deleteResult.data.changes === 0) {
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }

      await rolePermissionRepository.removePermissionCodeFromCache(permissionResult.data.code)

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
