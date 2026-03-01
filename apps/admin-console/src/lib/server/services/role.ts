/**
 * =============================================================================
 * Admin Console - 角色服务
 * =============================================================================
 *
 * 委托给 @h-ai/iam 的 authz 模块实现角色管理。
 * =============================================================================
 */

import type { Permission, Role } from '@h-ai/iam'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 带权限的角色
 */
export interface RoleWithPermissions extends Role {
  permissions: string[]
}

/**
 * 创建角色输入
 */
export interface CreateRoleInput {
  code: string
  name: string
  description?: string
  permissions?: string[]
}

/**
 * 更新角色输入
 */
export interface UpdateRoleInput {
  name?: string
  description?: string
  permissions?: string[]
}

// =============================================================================
// 内部辅助
// =============================================================================

async function listAllRoles(pageSize = 200): Promise<Role[]> {
  const roles: Role[] = []
  let page = 1
  let total = 0

  while (true) {
    const result = await iam.authz.getAllRoles({ page, pageSize })
    if (!result.success) {
      return roles
    }

    if (page === 1) {
      total = result.data.total
    }

    roles.push(...result.data.items)

    if (roles.length >= total || result.data.items.length === 0) {
      return roles
    }

    page += 1
  }
}

// =============================================================================
// 角色服务
// =============================================================================

/**
 * 角色服务
 *
 * 所有操作委托给 iam.authz 实现
 */
export const roleService = {
  /**
   * 创建角色
   */
  async create(input: CreateRoleInput): Promise<RoleWithPermissions> {
    const result = await iam.authz.createRole({
      code: input.code,
      name: input.name,
      description: input.description,
    })

    if (!result.success) {
      throw new Error(`${m.api_iam_roles_create_failed()}: ${result.error.message}`)
    }

    const role = result.data

    // 分配权限
    if (input.permissions?.length) {
      for (const permId of input.permissions) {
        await iam.authz.assignPermissionToRole(role.id, permId)
      }
    }

    return {
      ...role,
      permissions: input.permissions ?? [],
    }
  },

  /**
   * 根据 ID 获取角色
   */
  async getById(id: string): Promise<RoleWithPermissions | null> {
    const result = await iam.authz.getRole(id)
    if (!result.success || !result.data)
      return null

    const role = result.data
    const permissions = await this.getRolePermissions(id)

    return { ...role, permissions }
  },

  /**
   * 获取角色列表
   */
  async list(): Promise<RoleWithPermissions[]> {
    const result = await listAllRoles()
    if (result.length === 0) {
      return []
    }

    return Promise.all(
      result.map(async (role) => {
        const permissions = await this.getRolePermissions(role.id)
        return { ...role, permissions }
      }),
    )
  },

  /**
   * 更新角色
   */
  async update(id: string, input: UpdateRoleInput): Promise<RoleWithPermissions | null> {
    // 检查角色是否存在
    const existing = await this.getById(id)
    if (!existing)
      return null

    // 系统角色保护：忽略名称和权限变更，仅允许修改描述
    if (existing.isSystem) {
      input = { description: input.description }
    }

    // 更新角色基本信息（仅传入已定义的字段，避免传 undefined 给 DB 层）
    const updateData: Record<string, unknown> = {}
    if (input.name !== undefined)
      updateData.name = input.name
    if (input.description !== undefined)
      updateData.description = input.description

    if (Object.keys(updateData).length > 0) {
      const updateResult = await iam.authz.updateRole(id, updateData)
      if (!updateResult.success) {
        throw new Error(`${m.api_iam_roles_update_failed()}: ${updateResult.error.message}`)
      }
    }

    // 更新权限（input.permissions 是权限 ID 列表）
    if (input.permissions !== undefined) {
      // 获取当前权限 ID 列表
      const currentResult = await iam.authz.getRolePermissions(id)
      const currentIds = currentResult.success ? currentResult.data.map(p => p.id) : []

      // 移除不在新列表中的权限
      for (const permId of currentIds) {
        if (!input.permissions.includes(permId)) {
          await iam.authz.removePermissionFromRole(id, permId)
        }
      }

      // 添加新权限
      for (const permId of input.permissions) {
        if (!currentIds.includes(permId)) {
          await iam.authz.assignPermissionToRole(id, permId)
        }
      }
    }

    return this.getById(id)
  },

  /**
   * 删除角色
   */
  async delete(id: string): Promise<boolean> {
    // 检查是否为系统角色
    const existing = await this.getById(id)
    if (!existing)
      return false
    if (existing.isSystem) {
      throw new Error(m.api_iam_roles_system_cannot_delete())
    }

    const result = await iam.authz.deleteRole(id)
    return result.success
  },

  /**
   * 获取角色权限（权限代码列表，用于表单匹配与 API 调用）
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    const result = await iam.authz.getRolePermissions(roleId)
    if (!result.success)
      return []
    return result.data.map(p => p.code)
  },

  /**
   * 获取角色权限（完整权限对象）
   */
  async getRolePermissionObjects(roleId: string): Promise<Permission[]> {
    const result = await iam.authz.getRolePermissions(roleId)
    return result.success ? result.data : []
  },

  /**
   * 获取拥有某角色的用户数
   *
   * 当前 IAM 模块暂不支持按角色统计用户数，后续版本实现。
   */
  async getUserCount(_roleId: string): Promise<number> {
    return 0
  },
}
