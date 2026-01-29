/**
 * =============================================================================
 * @hai/iam - HAI Provider: Authz (访问授权)
 * =============================================================================
 * HAI 默认授权提供者实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AuthzContext,
  AuthzProvider,
  IAMConfig,
  IAMError,
  Permission,
  Role,
} from '../../iam-types.js'
import { err, ok } from '@hai/core'

/**
 * HAI 授权提供者实现
 */
class HaiAuthzProvider implements AuthzProvider {
  readonly name = 'hai-authz'

  private roles: Map<string, Role> = new Map()
  private permissions: Map<string, Permission> = new Map()
  private userRoles: Map<string, Set<string>> = new Map()
  private userPermissions: Map<string, Set<string>> = new Map()

  constructor(_config: IAMConfig) {
    this.initializeDefaultRoles()
  }

  private initializeDefaultRoles(): void {
    // 超级管理员
    this.roles.set('super_admin', {
      id: 'super_admin',
      code: 'super_admin',
      name: 'Super Admin',
      description: 'Full system access',
      permissions: [],
      isSystem: true,
    })

    // 管理员
    this.roles.set('admin', {
      id: 'admin',
      code: 'admin',
      name: 'Admin',
      description: 'Administrative access',
      permissions: [],
      isSystem: true,
    })

    // 普通用户
    this.roles.set('user', {
      id: 'user',
      code: 'user',
      name: 'User',
      description: 'Standard user access',
      permissions: [],
      isSystem: true,
    })
  }

  async checkPermission(ctx: AuthzContext, permission: string): Promise<Result<boolean, IAMError>> {
    try {
      // 超级管理员拥有所有权限
      if (ctx.roles.includes('super_admin')) {
        return ok(true)
      }

      // 检查用户直接权限
      const directPermissions = this.userPermissions.get(ctx.userId)
      if (directPermissions?.has(permission)) {
        return ok(true)
      }

      // 检查角色权限
      for (const roleCode of ctx.roles) {
        const role = this.roles.get(roleCode)
        if (role?.permissions.some(p => p.code === permission)) {
          return ok(true)
        }
      }

      return ok(false)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Permission check failed', cause: error })
    }
  }

  async hasRole(userId: string, role: string): Promise<Result<boolean, IAMError>> {
    try {
      const userRoleSet = this.userRoles.get(userId)
      return ok(userRoleSet?.has(role) ?? false)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Role check failed', cause: error })
    }
  }

  async getUserPermissions(userId: string): Promise<Result<Permission[], IAMError>> {
    try {
      const permissions: Permission[] = []
      const seen = new Set<string>()

      // 收集直接权限
      const directPermissions = this.userPermissions.get(userId)
      if (directPermissions) {
        for (const code of directPermissions) {
          const perm = this.permissions.get(code)
          if (perm && !seen.has(code)) {
            permissions.push(perm)
            seen.add(code)
          }
        }
      }

      // 收集角色权限
      const userRoleSet = this.userRoles.get(userId)
      if (userRoleSet) {
        for (const roleCode of userRoleSet) {
          const role = this.roles.get(roleCode)
          if (role) {
            for (const perm of role.permissions) {
              if (!seen.has(perm.code)) {
                permissions.push(perm)
                seen.add(perm.code)
              }
            }
          }
        }
      }

      return ok(permissions)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to get user permissions', cause: error })
    }
  }

  async getUserRoles(userId: string): Promise<Result<Role[], IAMError>> {
    try {
      const roles: Role[] = []
      const userRoleSet = this.userRoles.get(userId)

      if (userRoleSet) {
        for (const roleCode of userRoleSet) {
          const role = this.roles.get(roleCode)
          if (role) {
            roles.push(role)
          }
        }
      }

      return ok(roles)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to get user roles', cause: error })
    }
  }

  async assignRole(userId: string, roleId: string): Promise<Result<void, IAMError>> {
    try {
      if (!this.roles.has(roleId)) {
        return err({ type: 'ROLE_NOT_FOUND', message: `Role '${roleId}' not found` })
      }

      let userRoleSet = this.userRoles.get(userId)
      if (!userRoleSet) {
        userRoleSet = new Set()
        this.userRoles.set(userId, userRoleSet)
      }

      userRoleSet.add(roleId)
      return ok(undefined)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to assign role', cause: error })
    }
  }

  async removeRole(userId: string, roleId: string): Promise<Result<void, IAMError>> {
    try {
      const userRoleSet = this.userRoles.get(userId)
      if (userRoleSet) {
        userRoleSet.delete(roleId)
      }
      return ok(undefined)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to remove role', cause: error })
    }
  }
}

export function createHaiAuthzProvider(config: IAMConfig): AuthzProvider {
  return new HaiAuthzProvider(config)
}
