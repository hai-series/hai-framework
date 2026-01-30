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
 *
 * @module iam-type-authz
 * =============================================================================
 */

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
