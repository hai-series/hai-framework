/**
 * =============================================================================
 * @h-ai/iam — 授权子功能类型定义（RBAC）
 * =============================================================================
 *
 * 包含：
 * - 权限类型（Permission）
 * - 角色类型（Role）
 * - 关联类型（RolePermission、UserRole）
 * - 授权上下文（AuthzContext）
 * - 授权管理接口（IamAuthzFunctions）
 *
 * @module authz/iam-authz-types
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@h-ai/core'
import type { IamError } from '../iam-types.js'

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
  /** 用户角色 ID 列表 */
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
 * 授权子功能接口
 */
export interface IamAuthzFunctions {
  /**
   * 检查权限
   *
   * 超级管理员角色自动拥有所有权限。
   * 支持通配符匹配（如 `user:*` 匹配 `user:read`）。
   *
   * @param ctx - 授权上下文（用户 ID、角色列表）
   * @param permission - 权限代码（如 `user:read`）
   * @returns 成功返回 true/false
   */
  checkPermission: (ctx: AuthzContext, permission: string) => Promise<Result<boolean, IamError>>

  /**
   * 获取用户权限列表
   *
   * 通过用户角色聚合所有权限（自动去重）。
   *
   * @param userId - 用户 ID
   * @returns 成功返回去重后的权限列表
   */
  getUserPermissions: (userId: string) => Promise<Result<Permission[], IamError>>

  /**
   * 获取用户角色列表
   *
   * @param userId - 用户 ID
   * @returns 成功返回角色列表
   */
  getUserRoles: (userId: string) => Promise<Result<Role[], IamError>>

  /**
   * 分配角色给用户
   *
   * @param userId - 用户 ID
   * @param roleId - 角色 ID
   * @returns 成功返回 ok；角色不存在返回 ROLE_NOT_FOUND
   */
  assignRole: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   *
   * @param userId - 用户 ID
   * @param roleId - 角色 ID
   * @returns 成功返回 ok
   */
  removeRole: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  // =========================================================================
  // 角色管理
  // =========================================================================

  /**
   * 创建角色
   *
   * @param role - 角色数据（code、name、description、isSystem）
   * @returns 成功返回创建的角色（含 id 和时间戳）
   */
  createRole: (role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Role, IamError>>

  /**
   * 获取角色
   *
   * @param roleId - 角色 ID
   * @returns 成功返回角色或 null（不存在时）
   */
  getRole: (roleId: string) => Promise<Result<Role | null, IamError>>

  /**
   * 获取所有角色（分页）
   *
   * @param options - 分页参数，可选
   * @returns 成功返回分页角色列表
   */
  getAllRoles: (options?: PaginationOptionsInput) => Promise<Result<PaginatedResult<Role>, IamError>>

  /**
   * 更新角色
   *
   * @param roleId - 角色 ID
   * @param data - 要更新的字段（name、description 等）
   * @returns 成功返回更新后的角色；角色不存在返回 ROLE_NOT_FOUND
   */
  updateRole: (roleId: string, data: Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Result<Role, IamError>>

  /**
   * 删除角色
   *
   * 同时清除角色相关的权限缓存。
   *
   * @param roleId - 角色 ID
   * @returns 成功返回 ok；角色不存在返回 ROLE_NOT_FOUND
   */
  deleteRole: (roleId: string) => Promise<Result<void, IamError>>

  // =========================================================================
  // 权限管理
  // =========================================================================

  /**
   * 创建权限
   *
   * @param permission - 权限数据（code、name、resource、action）
   * @returns 成功返回创建的权限（含 id 和时间戳）
   */
  createPermission: (permission: Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Permission, IamError>>

  /**
   * 获取权限
   *
   * @param permissionId - 权限 ID
   * @returns 成功返回权限或 null（不存在时）
   */
  getPermission: (permissionId: string) => Promise<Result<Permission | null, IamError>>

  /**
   * 获取所有权限（分页）
   *
   * @param options - 分页参数，可选
   * @returns 成功返回分页权限列表
   */
  getAllPermissions: (options?: PaginationOptionsInput) => Promise<Result<PaginatedResult<Permission>, IamError>>

  /**
   * 删除权限
   *
   * 同时从相关角色的缓存中移除权限代码。
   *
   * @param permissionId - 权限 ID
   * @returns 成功返回 ok；权限不存在返回 PERMISSION_NOT_FOUND
   */
  deletePermission: (permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 为角色分配权限
   *
   * @param roleId - 角色 ID
   * @param permissionId - 权限 ID
   * @returns 成功返回 ok；角色/权限不存在返回对应错误码
   */
  assignPermissionToRole: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   *
   * @param roleId - 角色 ID
   * @param permissionId - 权限 ID
   * @returns 成功返回 ok；权限不存在返回 PERMISSION_NOT_FOUND
   */
  removePermissionFromRole: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 获取角色的权限列表
   *
   * @param roleId - 角色 ID
   * @returns 成功返回角色关联的权限列表
   */
  getRolePermissions: (roleId: string) => Promise<Result<Permission[], IamError>>
}
