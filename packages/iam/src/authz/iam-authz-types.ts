/**
 * @h-ai/iam — 授权子功能类型定义（RBAC）
 *
 * @h-ai/iam — 授权子功能类型定义（RBAC）
 * @module iam-authz-types
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@h-ai/core'
import type { IamError } from '../iam-types.js'

// ─── 授权类型（RBAC） ───

/**
 * 权限类型
 *
 * - menu：菜单/导航可见性控制
 * - api：接口级访问控制
 * - button：操作按钮显隐控制
 */
export type PermissionType = 'menu' | 'api' | 'button'

/**
 * 权限查询参数
 *
 * 扩展分页参数，支持按类型和关键字筛选。
 */
export interface PermissionQueryOptions extends PaginationOptionsInput {
  /** 按权限类型筛选 */
  type?: PermissionType
  /** 按关键字搜索（匹配 code 或 name） */
  search?: string
}

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
  /** 权限类型（menu / api / button） */
  type?: PermissionType
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

// ─── 授权管理接口 ───

/**
 * 授权子功能接口
 */
export interface AuthzOperations {
  /**
   * 检查权限
   *
   * 超级管理员角色自动拥有所有权限。
   * 支持通配符匹配（如 `user:*` 匹配 `user:read`）。
   *
   * **数据来源**：角色列表从数据库实时查询；权限代码走缓存优先策略（可能非最新）。
   *
   * @param userId - 用户 ID
   * @param permission - 权限代码（如 `user:read`）
   * @returns 成功返回 true/false
   */
  checkPermission: (userId: string, permission: string) => Promise<Result<boolean, IamError>>

  /**
   * 获取用户权限列表
   *
   * 通过用户角色聚合所有权限（自动去重）。
   *
   * **数据来源**：直接查询数据库，返回最新数据。
   *
   * @param userId - 用户 ID
   * @returns 成功返回去重后的权限列表
   */
  getUserPermissions: (userId: string) => Promise<Result<Permission[], IamError>>

  /**
   * 获取用户角色列表
   *
   * **数据来源**：直接查询数据库，返回最新数据。
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

  /**
   * 同步用户角色（替换为目标角色列表）
   *
   * 自动计算当前角色与目标角色的差集，批量移除多余角色、添加缺失角色，
   * 最终同步一次会话权限。若目标与当前一致则跳过操作。
   *
   * @param userId - 用户 ID
   * @param roleIds - 目标角色 ID 列表
   * @returns 成功返回 ok
   */
  syncRoles: (userId: string, roleIds: string[]) => Promise<Result<void, IamError>>

  // ─── 角色管理 ───

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
   * 根据角色代码获取角色
   *
   * @param code - 角色代码（如 'admin'、'user'）
   * @returns 成功返回角色或 null（不存在时）
   */
  getRoleByCode: (code: string) => Promise<Result<Role | null, IamError>>

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

  // ─── 权限管理 ───

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
   * 根据权限代码获取权限
   *
   * @param code - 权限代码（如 `user:read`）
   * @returns 成功返回权限或 null（不存在时）
   */
  getPermissionByCode: (code: string) => Promise<Result<Permission | null, IamError>>

  /**
   * 获取所有权限（分页）
   *
   * 支持按权限类型（menu/api/button）和关键字（code/name）筛选。
   *
   * @param options - 分页及筛选参数，可选
   * @returns 成功返回分页权限列表
   */
  getAllPermissions: (options?: PermissionQueryOptions) => Promise<Result<PaginatedResult<Permission>, IamError>>

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
   * **数据来源**：直接查询数据库，返回最新数据。
   *
   * @param roleId - 角色 ID
   * @returns 成功返回角色关联的权限列表
   */
  getRolePermissions: (roleId: string) => Promise<Result<Permission[], IamError>>

  /**
   * 批量获取多个用户的角色列表
   *
   * 单次查询替代 N 次 getUserRoles 调用，避免 N+1 问题。
   * 返回 Map：key 为 userId，value 为该用户的角色列表；无角色的用户返回空数组。
   *
   * **数据来源**：直接查询数据库，返回最新数据。
   *
   * @param userIds - 用户 ID 列表
   * @returns Map<userId, Role[]>
   */
  getUserRolesForMany: (userIds: string[]) => Promise<Result<Map<string, Role[]>, IamError>>

  /**
   * 批量获取多个角色的权限列表
   *
   * 单次查询替代 N 次 getRolePermissions 调用，避免 N+1 问题。
   * 返回 Map：key 为 roleId，value 为该角色的权限列表；无权限的角色返回空数组。
   *
   * **数据来源**：直接查询数据库，返回最新数据。
   *
   * @param roleIds - 角色 ID 列表
   * @returns Map<roleId, Permission[]>
   */
  getRolePermissionsForMany: (roleIds: string[]) => Promise<Result<Map<string, Permission[]>, IamError>>
}
