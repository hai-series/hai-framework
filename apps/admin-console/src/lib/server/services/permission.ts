/**
 * =============================================================================
 * Admin Console - 权限服务
 * =============================================================================
 *
 * 委托给 @hai/iam 的 authz 模块实现权限管理。
 * =============================================================================
 */

import type { Permission } from '@hai/iam'
import { iam } from '@hai/iam'

// =============================================================================
// 类型定义（兼容旧接口）
// =============================================================================

/**
 * 创建权限输入
 */
export interface CreatePermissionInput {
  /** 权限代码（如 user:read） */
  code: string
  /** 权限名称 */
  name: string
  /** 权限描述 */
  description?: string
  /** 资源类型 */
  resource?: string
  /** 操作类型 */
  action?: string
}

/**
 * 带 is_system 的权限（兼容旧 UI）
 */
export interface PermissionWithSystem {
  id: string
  code: string
  name: string
  description?: string
  resource?: string
  action?: string
  createdAt: Date
  updatedAt: Date
  /** 是否系统权限（兼容旧 UI 的 is_system） */
  is_system: boolean
}

/**
 * 更新权限输入
 */
export interface UpdatePermissionInput {
  name?: string
  description?: string
}

// =============================================================================
// 权限服务
// =============================================================================

/**
 * 权限服务
 *
 * 所有操作委托给 iam.authz 实现
 */
export const permissionService = {
  /**
   * 创建权限
   */
  async create(input: CreatePermissionInput): Promise<PermissionWithSystem> {
    const result = await iam.authz.createPermission({
      code: input.code,
      name: input.name,
      description: input.description,
      resource: input.resource,
      action: input.action,
    })

    if (!result.success) {
      throw new Error(`创建权限失败: ${result.error.message}`)
    }

    return this.toPermissionWithSystem(result.data)
  },

  /**
   * 根据 ID 获取权限
   */
  async getById(id: string): Promise<PermissionWithSystem | null> {
    const result = await iam.authz.getPermission(id)
    if (!result.success || !result.data)
      return null
    return this.toPermissionWithSystem(result.data)
  },

  /**
   * 根据名称（code）获取权限
   */
  async getByName(name: string): Promise<PermissionWithSystem | null> {
    const all = await this.list()
    return all.find(p => p.code === name || p.name === name) ?? null
  },

  /**
   * 获取权限列表
   */
  async list(options?: { resource?: string }): Promise<PermissionWithSystem[]> {
    const result = await iam.authz.getAllPermissions()
    if (!result.success)
      return []

    let permissions = result.data.map(p => this.toPermissionWithSystem(p))

    if (options?.resource) {
      permissions = permissions.filter(p => p.resource === options.resource)
    }

    return permissions
  },

  /**
   * 获取按资源分组的权限
   */
  async listGroupedByResource(): Promise<Record<string, PermissionWithSystem[]>> {
    const permissions = await this.list()
    const grouped: Record<string, PermissionWithSystem[]> = {}

    for (const perm of permissions) {
      const resource = perm.resource ?? 'other'
      if (!grouped[resource]) {
        grouped[resource] = []
      }
      grouped[resource].push(perm)
    }

    return grouped
  },

  /**
   * 更新权限
   *
   * 注意：IAM 模块目前不支持更新权限，只能删除后重建
   */
  async update(_id: string, _input: UpdatePermissionInput): Promise<Permission | null> {
    // IAM 模块目前不支持更新权限
    throw new Error('暂不支持更新权限，请删除后重建')
  },

  /**
   * 删除权限
   */
  async delete(id: string): Promise<boolean> {
    const result = await iam.authz.deletePermission(id)
    return result.success
  },

  /**
   * 获取所有资源名称
   */
  async getResources(): Promise<string[]> {
    const permissions = await this.list()
    const resources = new Set<string>()
    for (const perm of permissions) {
      if (perm.resource) {
        resources.add(perm.resource)
      }
    }
    return [...resources].sort()
  },

  /**
   * 获取所有操作名称
   */
  async getActions(): Promise<string[]> {
    const permissions = await this.list()
    const actions = new Set<string>()
    for (const perm of permissions) {
      if (perm.action) {
        actions.add(perm.action)
      }
    }
    return [...actions].sort()
  },

  /**
   * 转换为带 is_system 的权限对象（兼容旧 UI）
   */
  toPermissionWithSystem(perm: Permission): PermissionWithSystem {
    return {
      ...perm,
      // 系统权限以 system: 开头
      is_system: perm.code.startsWith('system:'),
    }
  },
}
