/**
 * =============================================================================
 * @hai/iam - RBAC 授权管理器
 * =============================================================================
 *
 * 基于角色的访问控制（RBAC）实现
 *
 * @module iam-authz-rbac
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { RbacConfig } from '../iam-config.js'
import type {
  AuthzContext,
  AuthzManager,
  IamError,
  Permission,
  PermissionRepository,
  Role,
  RolePermissionRepository,
  RoleRepository,
  UserRoleRepository,
} from '../iam-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode, RbacConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

/**
 * 权限缓存接口
 */
export interface PermissionCache {
  /**
   * 获取用户权限列表
   */
  getUserPermissions: (userId: string) => Promise<Result<Permission[] | null, IamError>>

  /**
   * 设置用户权限列表
   */
  setUserPermissions: (userId: string, permissions: Permission[], ttl: number) => Promise<Result<void, IamError>>

  /**
   * 清除用户权限缓存
   */
  clearUserPermissions: (userId: string) => Promise<Result<void, IamError>>
}

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
  /** 权限缓存（可选） */
  permissionCache?: PermissionCache
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
    permissionCache,
  } = config

  /**
   * 获取用户权限列表（带缓存）
   */
  async function getUserPermissionsInternal(userId: string): Promise<Result<Permission[], IamError>> {
    // 尝试从缓存获取
    if (rbacConfig.cachePermissions && permissionCache) {
      const cacheResult = await permissionCache.getUserPermissions(userId)
      if (cacheResult.success && cacheResult.data) {
        return ok(cacheResult.data)
      }
    }

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

    // 存入缓存
    if (rbacConfig.cachePermissions && permissionCache) {
      await permissionCache.setUserPermissions(userId, permissions, rbacConfig.cacheTtl)
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
      const roleExistsResult = await roleRepository.exists(roleId)
      if (!roleExistsResult.success) {
        return roleExistsResult as Result<void, IamError>
      }

      if (!roleExistsResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      // 分配角色
      const assignResult = await userRoleRepository.assign(userId, roleId)

      // 清除权限缓存
      if (assignResult.success && permissionCache) {
        await permissionCache.clearUserPermissions(userId)
      }

      return assignResult
    },

    async removeRole(userId: string, roleId: string): Promise<Result<void, IamError>> {
      const removeResult = await userRoleRepository.remove(userId, roleId)

      // 清除权限缓存
      if (removeResult.success && permissionCache) {
        await permissionCache.clearUserPermissions(userId)
      }

      return removeResult
    },

    // =========================================================================
    // 角色管理
    // =========================================================================

    async createRole(role): Promise<Result<Role, IamError>> {
      return roleRepository.create(role)
    },

    async getRole(roleId): Promise<Result<Role | null, IamError>> {
      return roleRepository.findById(roleId)
    },

    async getAllRoles(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<Role>, IamError>> {
      return roleRepository.findAll(options)
    },

    async updateRole(roleId, data): Promise<Result<Role, IamError>> {
      return roleRepository.update(roleId, data)
    },

    async deleteRole(roleId): Promise<Result<void, IamError>> {
      return roleRepository.delete(roleId)
    },

    // =========================================================================
    // 权限管理
    // =========================================================================

    async createPermission(permission): Promise<Result<Permission, IamError>> {
      return permissionRepository.create(permission)
    },

    async getPermission(permissionId): Promise<Result<Permission | null, IamError>> {
      return permissionRepository.findById(permissionId)
    },

    async getAllPermissions(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<Permission>, IamError>> {
      return permissionRepository.findAll(options)
    },

    async deletePermission(permissionId): Promise<Result<void, IamError>> {
      return permissionRepository.delete(permissionId)
    },

    async assignPermissionToRole(roleId, permissionId): Promise<Result<void, IamError>> {
      // 检查角色和权限是否存在
      const [roleResult, permResult] = await Promise.all([
        roleRepository.exists(roleId),
        permissionRepository.findById(permissionId),
      ])

      if (!roleResult.success) {
        return roleResult as Result<void, IamError>
      }
      if (!roleResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      if (!permResult.success) {
        return permResult as Result<void, IamError>
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
