/**
 * =============================================================================
 * @hai/iam - 授权相关类型定义（RBAC）
 * =============================================================================
 *
 * 包含：
 * - 权限类型（Permission）
 * - 角色类型（Role）
 * - 关联类型（RolePermission、UserRole）
 * - 授权上下文（AuthzContext）
 * - 授权管理接口（AuthzManager）
 *
 * @module authz/rbac/iam-authz-rbac-types
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { IamError } from '../../iam-core-types.js'

// =============================================================================
// 授权类型（RBAC）
// =============================================================================

/**
 * 权限
 */
export interface Permission {
  /** 权限 ID */
  id: string
  /** 权限代码（如 users:read, posts:write） */
  code: string
  /** 权限名称 */
  name: string
  /** 权限描述 */
  description?: string
  /** 资源类型 */
  resource?: string
  /** 操作类型（create/read/update/delete） */
  action?: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 角色
 */
export interface Role {
  /** 角色 ID */
  id: string
  /** 角色代码 */
  code: string
  /** 角色名称 */
  name: string
  /** 角色描述 */
  description?: string
  /** 是否系统角色（不可删除） */
  isSystem?: boolean
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 角色与权限关联
 */
export interface RolePermission {
  /** 角色 ID */
  roleId: string
  /** 权限 ID */
  permissionId: string
}

/**
 * 用户与角色关联
 */
export interface UserRole {
  /** 用户 ID */
  userId: string
  /** 角色 ID */
  roleId: string
}

/**
 * 授权检查上下文
 */
export interface AuthzContext {
  /** 用户 ID */
  userId: string
  /** 用户角色代码列表 */
  roles: string[]
  /** 资源标识 */
  resource?: string
  /** 操作类型 */
  action?: string
  /** 扩展上下文 */
  context?: Record<string, unknown>
}

// =============================================================================
// 授权管理接口
// =============================================================================

/**
 * 授权管理器接口（RBAC）
 */
export interface AuthzManager {
  /**
   * 检查权限
   */
  checkPermission: (ctx: AuthzContext, permission: string) => Promise<Result<boolean, IamError>>

  /**
   * 检查角色
   * @param ctx 授权上下文（使用 userId 检查）
   * @param role 角色 ID
   */
  hasRole: (ctx: AuthzContext, role: string) => Promise<Result<boolean, IamError>>

  /**
   * 获取用户权限列表
   */
  getUserPermissions: (userId: string) => Promise<Result<Permission[], IamError>>

  /**
   * 获取用户角色列表
   */
  getUserRoles: (userId: string) => Promise<Result<Role[], IamError>>

  /**
   * 分配角色给用户
   */
  assignRole: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   */
  removeRole: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  // =========================================================================
  // 角色管理
  // =========================================================================

  /**
   * 创建角色
   */
  createRole: (role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Role, IamError>>

  /**
   * 获取角色
   */
  getRole: (roleId: string) => Promise<Result<Role | null, IamError>>

  /**
   * 获取所有角色
   */
  getAllRoles: (options?: PaginationOptionsInput) => Promise<Result<PaginatedResult<Role>, IamError>>

  /**
   * 更新角色
   */
  updateRole: (roleId: string, data: Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Result<Role, IamError>>

  /**
   * 删除角色
   */
  deleteRole: (roleId: string) => Promise<Result<void, IamError>>

  // =========================================================================
  // 权限管理
  // =========================================================================

  /**
   * 创建权限
   */
  createPermission: (permission: Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Permission, IamError>>

  /**
   * 获取权限
   */
  getPermission: (permissionId: string) => Promise<Result<Permission | null, IamError>>

  /**
   * 获取所有权限
   */
  getAllPermissions: (options?: PaginationOptionsInput) => Promise<Result<PaginatedResult<Permission>, IamError>>

  /**
   * 删除权限
   */
  deletePermission: (permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 为角色分配权限
   */
  assignPermissionToRole: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   */
  removePermissionFromRole: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 获取角色的权限列表
   */
  getRolePermissions: (roleId: string) => Promise<Result<Permission[], IamError>>
}
