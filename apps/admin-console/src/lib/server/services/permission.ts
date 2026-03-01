/**
 * =============================================================================
 * Admin Console - 权限服务
 * =============================================================================
 *
 * 委托给 @h-ai/iam 的 authz 模块实现权限管理。
 * =============================================================================
 */

import type { Permission, PermissionQueryOptions, PermissionType } from '@h-ai/iam'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'

// =============================================================================
// 类型定义
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
  /** 权限类型 */
  type?: PermissionType
}

/**
 * 带 is_system 的权限
 */
export interface PermissionWithSystem {
  id: string
  code: string
  name: string
  description?: string
  resource?: string
  action?: string
  type?: PermissionType
  createdAt: Date
  updatedAt: Date
  /** 是否系统权限 */
  is_system: boolean
}

/**
 * 更新权限输入
 */
export interface UpdatePermissionInput {
  name?: string
  description?: string
}

/**
 * 种子权限代码集合
 *
 * 与 @h-ai/iam iam-seed.ts 中定义的默认权限保持一致。
 * 用于判断权限是否为系统内置——系统权限不可删除。
 */
const SEED_PERMISSION_CODES = new Set([
  // 菜单
  'dashboard:view',
  'user:read',
  'role:read',
  'permission:read',
  'system:logs',
  'system:settings',
  'system:modules',
  'profile:read',
  // API
  'user:list',
  'user:api:create',
  'user:api:update',
  'user:api:delete',
  'role:list',
  'role:api:create',
  'role:api:update',
  'role:api:delete',
  'permission:list',
  'permission:manage',
  'permission:api:create',
  'permission:api:delete',
  'audit:read',
  // 按钮
  'user:create',
  'user:update',
  'user:delete',
  'role:create',
  'role:update',
  'role:delete',
  'permission:create',
  'permission:delete',
])

// =============================================================================
// 内部辅助
// =============================================================================

async function listAllPermissions(pageSize = 200): Promise<Permission[]> {
  const permissions: Permission[] = []
  let page = 1
  let total = 0

  while (true) {
    const result = await iam.authz.getAllPermissions({ page, pageSize })
    if (!result.success) {
      return permissions
    }

    if (page === 1) {
      total = result.data.total
    }

    permissions.push(...result.data.items)

    if (permissions.length >= total || result.data.items.length === 0) {
      return permissions
    }

    page += 1
  }
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
      type: input.type,
    })

    if (!result.success) {
      throw new Error(`${m.api_iam_permissions_create_failed()}: ${result.error.message}`)
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
   * 根据权限代码（code）查找权限
   *
   * 通过 IAM 层 getPermissionByCode 直接查询，避免加载全表。
   */
  async getByCode(code: string): Promise<PermissionWithSystem | null> {
    const result = await iam.authz.getPermissionByCode(code)
    if (!result.success || !result.data)
      return null
    return this.toPermissionWithSystem(result.data)
  },

  /**
   * 获取权限列表
   */
  async list(options?: { resource?: string }): Promise<PermissionWithSystem[]> {
    const permissionsResult = await listAllPermissions()
    if (permissionsResult.length === 0)
      return []

    let permissions = permissionsResult.map(p => this.toPermissionWithSystem(p))

    if (options?.resource) {
      permissions = permissions.filter(p => p.resource === options.resource)
    }

    return permissions
  },

  /**
   * 分页获取权限列表（支持按类型和关键词过滤）
   */
  async listPaginated(options: PermissionQueryOptions): Promise<{
    items: PermissionWithSystem[]
    total: number
    page: number
    pageSize: number
  }> {
    const result = await iam.authz.getAllPermissions(options)
    if (!result.success) {
      return { items: [], total: 0, page: options.page ?? 1, pageSize: options.pageSize ?? 20 }
    }

    const { items, total } = result.data
    return {
      items: items.map(p => this.toPermissionWithSystem(p)),
      total,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
    }
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
    throw new Error(m.api_iam_permissions_update_not_supported())
  },

  /**
   * 删除权限
   */
  async delete(id: string): Promise<boolean> {
    const result = await iam.authz.deletePermission(id)
    return result.success
  },

  /**
   * 转换为带 is_system 的权限对象
   *
   * 系统权限 = 种子数据中定义的权限，不可删除。
   */
  toPermissionWithSystem(perm: Permission): PermissionWithSystem {
    return {
      ...perm,
      type: perm.type,
      is_system: SEED_PERMISSION_CODES.has(perm.code),
    }
  },
}
