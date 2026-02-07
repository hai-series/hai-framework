/**
 * =============================================================================
 * @hai/iam - RBAC 授权管理器
 * =============================================================================
 *
 * 基于角色的访问控制（RBAC）实现
 *
 * @module authz/rbac/iam-authz-rbac-service
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { RbacConfig } from '../../iam-config.js'
import type { IamError } from '../../iam-core-types.js'
import type { PermissionRepository } from './iam-authz-rbac-repository-permission.js'
import type { RolePermissionRepository, UserRoleRepository } from './iam-authz-rbac-repository-relation.js'
import type { RoleRepository } from './iam-authz-rbac-repository-role.js'
import type {
  AuthzContext,
  AuthzManager,
  Permission,
  Role,
} from './iam-authz-rbac-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode, RbacConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

/**
 * RBAC 授权管理器配置
 */
export interface RbacManagerConfig {
  /** RBAC 配置 */
  rbacConfig?: RbacConfig
  /** 角色存储 */
  roleRepository: RoleRepository
  /** 权限存储 */
  permissionRepository: PermissionRepository
  /** 角色-权限关联存储 */
  rolePermissionRepository: RolePermissionRepository
  /** 用户-角色关联存储 */
  userRoleRepository: UserRoleRepository
}

/**
 * 创建 RBAC 授权管理器
 */
export function createRbacManager(config: RbacManagerConfig): AuthzManager {
  const rbacConfig = config.rbacConfig
    ? RbacConfigSchema.parse(config.rbacConfig)
    : RbacConfigSchema.parse({})

  const {
    roleRepository,
    permissionRepository,
    rolePermissionRepository,
    userRoleRepository,
  } = config

  function mapRepositoryError(messageKey: Parameters<typeof iamM>[0], message: string) {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM(messageKey, { params: { message } }),
    })
  }

  /**
   * 获取用户权限列表（无缓存）
   */
  async function getUserPermissionsInternal(userId: string): Promise<Result<Permission[], IamError>> {
    // 从存储获取
    const rolesResult = await userRoleRepository.getRoles(userId)
    if (!rolesResult.success) {
      return rolesResult as Result<Permission[], IamError>
    }

    const permissions: Permission[] = []
    const seen = new Set<string>()

    for (const role of rolesResult.data) {
      const rolePermsResult = await rolePermissionRepository.getPermissions(role.id)
      if (rolePermsResult.success) {
        for (const perm of rolePermsResult.data) {
          if (!seen.has(perm.id)) {
            permissions.push(perm)
            seen.add(perm.id)
          }
        }
      }
    }

    return ok(permissions)
  }

  /**
   * 根据角色列表获取权限（直接从角色获取，不需要用户 ID）
   */
  async function getPermissionsByRoles(roleIds: string[]): Promise<Result<Permission[], IamError>> {
    const permissions: Permission[] = []
    const seen = new Set<string>()

    for (const roleId of roleIds) {
      const rolePermsResult = await rolePermissionRepository.getPermissions(roleId)
      if (rolePermsResult.success) {
        for (const perm of rolePermsResult.data) {
          if (!seen.has(perm.id)) {
            permissions.push(perm)
            seen.add(perm.id)
          }
        }
      }
    }

    return ok(permissions)
  }

  return {
    async checkPermission(ctx: AuthzContext, permission: string): Promise<Result<boolean, IamError>> {
      // 超级管理员拥有所有权限
      if (ctx.roles.includes(rbacConfig.superAdminRole)) {
        return ok(true)
      }

      // 优先使用传入的 roles（如果有的话）
      let permissionsResult: Result<Permission[], IamError>
      if (ctx.roles.length > 0) {
        permissionsResult = await getPermissionsByRoles(ctx.roles)
      }
      else {
        // 否则从数据库查询用户的角色
        permissionsResult = await getUserPermissionsInternal(ctx.userId)
      }

      if (!permissionsResult.success) {
        return permissionsResult as Result<boolean, IamError>
      }

      // 检查是否有匹配的权限
      const hasPermission = permissionsResult.data.some((p) => {
        // 精确匹配
        if (p.code === permission) {
          return true
        }
        // 通配符匹配（如 users:* 匹配 users:read）
        if (p.code.endsWith(':*')) {
          const prefix = p.code.slice(0, -1)
          if (permission.startsWith(prefix)) {
            return true
          }
        }
        return false
      })

      return ok(hasPermission)
    },

    async hasRole(ctx: AuthzContext, role: string): Promise<Result<boolean, IamError>> {
      // 如果 ctx.roles 中有该角色，直接返回 true
      if (ctx.roles?.includes(role)) {
        return ok(true)
      }
      // 否则从数据库查询
      return userRoleRepository.hasRole(ctx.userId, role)
    },

    async getUserPermissions(userId: string): Promise<Result<Permission[], IamError>> {
      return getUserPermissionsInternal(userId)
    },

    async getUserRoles(userId: string): Promise<Result<Role[], IamError>> {
      return userRoleRepository.getRoles(userId)
    },

    async assignRole(userId: string, roleId: string): Promise<Result<void, IamError>> {
      // 检查角色是否存在
      const roleExistsResult = await roleRepository.existsById(roleId)
      if (!roleExistsResult.success) {
        return mapRepositoryError('iam_queryRoleFailed', roleExistsResult.error.message) as Result<void, IamError>
      }

      if (!roleExistsResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      // 分配角色
      return userRoleRepository.assign(userId, roleId)
    },

    async removeRole(userId: string, roleId: string): Promise<Result<void, IamError>> {
      return userRoleRepository.remove(userId, roleId)
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
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
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
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }
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
        return err({
          code: IamErrorCode.PERMISSION_NOT_FOUND,
          message: iamM('iam_permissionNotExist'),
        })
      }
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

      return rolePermissionRepository.assign(roleId, permissionId)
    },

    async removePermissionFromRole(roleId, permissionId): Promise<Result<void, IamError>> {
      return rolePermissionRepository.remove(roleId, permissionId)
    },

    async getRolePermissions(roleId): Promise<Result<Permission[], IamError>> {
      return rolePermissionRepository.getPermissions(roleId)
    },
  }
}
