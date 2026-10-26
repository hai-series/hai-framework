/**
 * Admin Console - IAM 管理辅助函数
 *
 * 应用层只保留后台管理需要的编排逻辑；用户、角色、权限的底层读写都委托给 `@h-ai/iam`。
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { Permission, PermissionQueryOptions, PermissionType, Role } from '@h-ai/iam'
import * as m from '$lib/paraglide/messages.js'
import { core, err, ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { error } from '@sveltejs/kit'

interface IamUserInput {
  id: string
  username: string
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  enabled?: boolean
  createdAt: Date
  updatedAt: Date
}

interface IamProfileInput {
  id: string
  username: string
  email?: string | null
  displayName?: string | null
  phone?: string | null
  avatarUrl?: string | null
}

export interface RoleWithPermissions extends Role {
  permissions: string[]
}

export interface CreateRoleInput {
  code: string
  name: string
  description?: string
  permissions?: string[]
}

export interface UpdateRoleInput {
  name?: string
  description?: string
  permissions?: string[]
}

export interface CreatePermissionInput {
  code: string
  name: string
  description?: string
  resource?: string
  action?: string
  type?: PermissionType
}

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
  is_system: boolean
}

const SEED_PERMISSION_CODES = new Set([
  'dashboard:view',
  'user:read',
  'role:read',
  'permission:read',
  'system:logs',
  'system:settings',
  'system:modules',
  'profile:read',
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
  'user:create',
  'user:update',
  'user:delete',
  'role:create',
  'role:update',
  'role:delete',
  'permission:create',
  'permission:delete',
])

/** HTTP 应用读取边界：记录底层错误并中止响应，不返回伪造的空数据。 */
export function requireAdminData<T>(result: HaiResult<T>): T {
  if (!result.success) {
    core.logger.error('Admin data read failed', { error: result.error })
    throw error(503, { message: m.common_network_error() })
  }
  return result.data
}

async function listAllPages<T>(
  loadPage: (page: number, pageSize: number) => Promise<HaiResult<PaginatedResult<T>>>,
  pageSize = 200,
): Promise<T[]> {
  const first = requireAdminData(await loadPage(1, pageSize))
  const totalPages = Math.ceil(first.total / pageSize)
  const items = [...first.items]
  for (let page = 2; page <= totalPages; page++) {
    items.push(...requireAdminData(await loadPage(page, pageSize)).items)
  }
  return items
}

function toPermissionWithSystem(permission: Permission): PermissionWithSystem {
  return {
    ...permission,
    is_system: SEED_PERMISSION_CODES.has(permission.code),
  }
}

/** 批量把权限 code 转为权限 ID；不存在的 code 或查询失败时中止请求。 */
export async function resolvePermissionIds(codes: string[] | undefined): Promise<string[] | undefined> {
  if (codes === undefined)
    return undefined
  if (codes.length === 0)
    return []

  const permissions = await Promise.all(codes.map(code => getAdminPermissionByCode(code)))
  return permissions.map((permission) => {
    if (!permission)
      throw error(400, { message: m.api_iam_permissions_not_found() })
    return permission.id
  })
}

/** 创建角色，并同步初始权限。 */
export async function createAdminRole(input: CreateRoleInput): Promise<HaiResult<RoleWithPermissions>> {
  const createResult = await iam.authz.createRole({
    code: input.code,
    name: input.name,
    description: input.description,
    permissionIds: input.permissions,
  })

  if (!createResult.success) {
    return err({ code: 'iam.role.create_failed', message: m.api_iam_roles_create_failed(), httpStatus: createResult.error.httpStatus ?? 500, cause: createResult.error })
  }

  const role = await getAdminRole(createResult.data.id)
  if (!role)
    throw error(503, { message: m.common_network_error() })
  return ok(role)
}

/** 根据 ID 获取带权限 code 的角色。 */
export async function getAdminRole(id: string): Promise<RoleWithPermissions | null> {
  const result = await iam.authz.getRole(id)
  const data = requireAdminData(result)
  if (!data)
    return null

  const permissionsResult = await iam.authz.getRolePermissions(id)
  const permissions = requireAdminData(permissionsResult).map(p => p.code)
  return { ...data, permissions }
}

/** 获取全部角色，并一次性带出权限 code。 */
export async function listAdminRoles(): Promise<RoleWithPermissions[]> {
  const roles = await listAllPages((page, pageSize) => iam.authz.getAllRoles({ page, pageSize }))
  if (roles.length === 0)
    return []

  const roleIds = roles.map(role => role.id)
  const permissionsResult = await iam.authz.getRolePermissionsForMany(roleIds)
  const permissionsMap = requireAdminData(permissionsResult)

  return roles.map(role => ({
    ...role,
    permissions: (permissionsMap.get(role.id) ?? []).map(permission => permission.code),
  }))
}

/** 更新角色基础信息与权限。 */
export async function updateAdminRole(id: string, input: UpdateRoleInput): Promise<HaiResult<RoleWithPermissions | null>> {
  const existing = await getAdminRole(id)
  if (!existing)
    return ok(null)

  const editableInput = existing.isSystem ? { description: input.description } : input
  const updateData: Partial<Pick<Role, 'name' | 'description'>> = {}
  if (editableInput.name !== undefined)
    updateData.name = editableInput.name
  if (editableInput.description !== undefined)
    updateData.description = editableInput.description

  const updateResult = await iam.authz.updateRole(id, { ...updateData, permissionIds: editableInput.permissions })
  if (!updateResult.success)
    return err({ code: 'iam.role.update_failed', message: m.api_iam_roles_update_failed(), httpStatus: updateResult.error.httpStatus ?? 500, cause: updateResult.error })

  return ok(await getAdminRole(id))
}

/** 删除非系统角色。 */
export async function deleteAdminRole(id: string): Promise<HaiResult<boolean>> {
  const existing = await getAdminRole(id)
  if (!existing)
    return ok(false)
  if (existing.isSystem) {
    return err({ code: 'iam.role.system_cannot_delete', message: m.api_iam_roles_system_cannot_delete() })
  }

  const deleteResult = await iam.authz.deleteRole(id)
  if (!deleteResult.success) {
    return err({ code: 'iam.role.delete_failed', message: m.api_iam_roles_delete_failed(), httpStatus: deleteResult.error.httpStatus ?? 500, cause: deleteResult.error })
  }

  return ok(true)
}

/** 创建权限。 */
export async function createAdminPermission(input: CreatePermissionInput): Promise<HaiResult<PermissionWithSystem>> {
  const result = await iam.authz.createPermission(input)
  if (!result.success) {
    return err({ code: 'iam.permission.create_failed', message: m.api_iam_permissions_create_failed(), httpStatus: result.error.httpStatus ?? 500, cause: result.error })
  }

  return ok(toPermissionWithSystem(result.data))
}

/** 根据 ID 获取权限。 */
export async function getAdminPermission(id: string): Promise<PermissionWithSystem | null> {
  const result = await iam.authz.getPermission(id)
  const data = requireAdminData(result)
  if (!data)
    return null
  return toPermissionWithSystem(data)
}

/** 根据 code 获取权限。 */
export async function getAdminPermissionByCode(code: string): Promise<PermissionWithSystem | null> {
  const result = await iam.authz.getPermissionByCode(code)
  const data = requireAdminData(result)
  if (!data)
    return null
  return toPermissionWithSystem(data)
}

/** 分页获取权限列表。 */
export async function listAdminPermissionsPage(options: PermissionQueryOptions): Promise<{
  items: PermissionWithSystem[]
  total: number
  page: number
  pageSize: number
}> {
  const result = await iam.authz.getAllPermissions(options)
  const data = requireAdminData(result)

  return {
    items: data.items.map(toPermissionWithSystem),
    total: data.total,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 20,
  }
}

/** 获取按 resource 分组的全部权限。 */
export async function listPermissionsGroupedByResource(): Promise<Record<string, PermissionWithSystem[]>> {
  const permissions = await listAllPages((page, pageSize) => iam.authz.getAllPermissions({ page, pageSize }))
  const grouped: Record<string, PermissionWithSystem[]> = {}

  for (const permission of permissions.map(toPermissionWithSystem)) {
    const resource = permission.resource ?? 'other'
    grouped[resource] ??= []
    grouped[resource].push(permission)
  }

  return grouped
}

/** 删除权限。 */
export async function deleteAdminPermission(id: string): Promise<HaiResult<void>> {
  const result = await iam.authz.deletePermission(id)
  if (!result.success) {
    return err({ code: 'iam.permission.delete_failed', message: m.api_iam_permissions_delete_failed(), httpStatus: result.error.httpStatus ?? 500, cause: result.error })
  }
  return ok(undefined)
}

/** 将底层唯一键冲突错误映射为稳定的用户可读提示。 */
export function normalizeUniqueConstraintError(message: string | undefined, fallback: string): string {
  const lower = message?.toLowerCase() ?? ''
  if (lower.includes('unique constraint') || lower.includes('duplicate')) {
    return m.api_auth_username_or_email_taken()
  }
  return fallback
}

/** IAM 用户对象转后台用户列表响应格式（含角色 code）。 */
export async function toIamUserResponse(user: IamUserInput) {
  const userResult = await iam.user.getUser(user.id, { include: ['roles'] })
  const loaded = requireAdminData(userResult)
  if (!loaded)
    throw error(503, { message: m.common_network_error() })
  const roles = loaded.roles?.map(role => role.code) ?? []

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatarUrl,
    status: user.enabled !== false ? 'active' as const : 'inactive' as const,
    accountType: loaded.accountType,
    accountStatus: loaded.accountStatus,
    accountExpiresAt: loaded.accountExpiresAt,
    lastLoginAt: loaded.lastLoginAt,
    roles,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }
}

/** IAM 用户对象转当前用户资料响应格式。 */
export async function toIamProfileResponse(user: IamProfileInput) {
  const userResult = await iam.user.getUser(user.id, { include: ['roles'] })
  const loaded = requireAdminData(userResult)
  if (!loaded)
    throw error(503, { message: m.common_network_error() })
  const roles = loaded.roles?.map(role => role.code) ?? []

  return {
    id: user.id,
    username: user.username,
    email: user.email ?? '',
    display_name: user.displayName ?? '',
    phone: user.phone ?? '',
    avatar: user.avatarUrl ?? '',
    roles,
  }
}
