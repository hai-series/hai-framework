/**
 * =============================================================================
 * Admin Console - 用户服务
 * =============================================================================
 *
 * 委托给 @h-ai/iam 的 user 和 authz 模块实现用户管理。
 * =============================================================================
 */

import type { User } from '@h-ai/iam'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'

// =============================================================================
// 类型定义（兼容旧接口）
// =============================================================================

/**
 * 带角色和权限的用户
 */
export interface UserWithRoles extends User {
  roles: string[]
  permissions: string[]
}

/**
 * 创建用户输入
 */
export interface CreateUserInput {
  username: string
  email: string
  password: string
  displayName?: string
  roles?: string[]
}

/**
 * 更新用户输入
 */
export interface UpdateUserInput {
  username?: string
  email?: string
  displayName?: string
  avatarUrl?: string
  enabled?: boolean
}

// =============================================================================
// 用户服务
// =============================================================================

/**
 * 用户服务
 *
 * 所有操作委托给 iam.user 和 iam.authz 实现
 */
export const userService = {
  /**
   * 创建用户
   */
  async create(input: CreateUserInput): Promise<UserWithRoles> {
    // 使用 IAM 注册用户
    const result = await iam.user.register({
      username: input.username,
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    })

    if (!result.success) {
      throw new Error(`${m.api_iam_users_create_failed()}: ${result.error.message}`)
    }

    const user = result.data.user

    // 分配角色（iam.user.register 已分配 config.rbac.defaultRole）
    // 管理员创建时额外分配指定角色
    if (input.roles?.length) {
      for (const roleId of input.roles) {
        await iam.authz.assignRole(user.id, roleId)
      }
    }

    // 获取用户角色和权限
    const { roles, permissions } = await this.getUserRolesAndPermissions(user.id)

    return { ...user, roles, permissions }
  },

  /**
   * 根据 ID 获取用户
   */
  async getById(id: string): Promise<UserWithRoles | null> {
    const result = await iam.user.getUser(id)
    if (!result.success || !result.data)
      return null

    const user = result.data
    const { roles, permissions } = await this.getUserRolesAndPermissions(id)

    return { ...user, roles, permissions }
  },

  /**
   * 验证密码
   *
   * 使用 iam.auth.login 验证
   */
  async verifyPassword(identifier: string, password: string): Promise<User | null> {
    const result = await iam.auth.login({
      identifier,
      password,
    })
    if (!result.success)
      return null

    // 从 token 获取用户信息
    const tokenResult = await iam.auth.verifyToken(result.data.accessToken)
    if (!tokenResult.success)
      return null

    const userResult = await iam.user.getUser(tokenResult.data.userId)
    return userResult.success ? userResult.data : null
  },

  /**
   * 获取用户列表
   */
  async list(
    options: {
      page?: number
      pageSize?: number
      search?: string
      status?: string
    } = {},
  ): Promise<{ users: UserWithRoles[], total: number }> {
    const enabled = options.status === 'active' ? true : options.status === 'inactive' ? false : undefined

    const result = await iam.user.listUsers({
      page: options.page,
      pageSize: options.pageSize,
      search: options.search,
      enabled,
    })

    if (!result.success) {
      return { users: [], total: 0 }
    }

    // 为每个用户补全角色和权限
    const users: UserWithRoles[] = []
    for (const user of result.data.items) {
      const { roles, permissions } = await this.getUserRolesAndPermissions(user.id)
      users.push({ ...user, roles, permissions })
    }

    return { users, total: result.data.total }
  },

  /**
   * 更新用户
   */
  async update(id: string, input: UpdateUserInput): Promise<UserWithRoles | null> {
    const result = await iam.user.updateUser(id, {
      username: input.username,
      email: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      enabled: input.enabled,
    })

    if (!result.success)
      return null

    return this.getById(id)
  },

  /**
   * 删除用户
   */
  async delete(id: string): Promise<boolean> {
    const result = await iam.user.deleteUser(id)
    return result.success
  },

  /**
   * 修改密码
   */
  async changePassword(id: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const result = await iam.user.changePassword(id, oldPassword, newPassword)
    return result.success
  },

  /**
   * 重置密码（管理员操作）
   */
  async resetPassword(id: string, newPassword: string): Promise<boolean> {
    const result = await iam.user.adminResetPassword(id, newPassword)
    return result.success
  },

  /**
   * 获取用户角色和权限
   */
  async getUserRolesAndPermissions(userId: string): Promise<{ roles: string[], permissions: string[] }> {
    // 获取角色
    const rolesResult = await iam.authz.getUserRoles(userId)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    // 获取权限
    const permsResult = await iam.authz.getUserPermissions(userId)
    const permissions = permsResult.success ? permsResult.data.map(p => p.code) : []

    return { roles, permissions }
  },

  /**
   * 分配角色给用户
   */
  async assignRoles(userId: string, roleIds: string[]): Promise<void> {
    // 先获取当前角色
    const currentRolesResult = await iam.authz.getUserRoles(userId)
    const currentRoleIds = currentRolesResult.success
      ? currentRolesResult.data.map(r => r.id)
      : []

    // 移除不在新列表中的角色
    for (const roleId of currentRoleIds) {
      if (!roleIds.includes(roleId)) {
        await iam.authz.removeRole(userId, roleId)
      }
    }

    // 添加新角色
    for (const roleId of roleIds) {
      if (!currentRoleIds.includes(roleId)) {
        await iam.authz.assignRole(userId, roleId)
      }
    }
  },
}
