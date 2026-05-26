/**
 * Admin Console - IAM 管理辅助函数
 *
 * 应用层只保留后台管理需要的编排逻辑；用户、角色、权限的底层读写都委托给 `@h-ai/iam`。
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { Permission, PermissionQueryOptions, PermissionType, Role } from '@h-ai/iam'
import * as m from '$lib/paraglide/messages.js'
import { err, ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'

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

async function listAllPages<T>(
  loadPage: (page: number, pageSize: number) => Promise<HaiResult<PaginatedResult<T>>>,
  pageSize = 200,
): Promise<T[]> {
  const first = await loadPage(1, pageSize)
  if (!first.success)
    return []

  const totalPages = Math.ceil(first.data.total / pageSize)
  if (totalPages <= 1)
    return first.data.items

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_unused, index) => loadPage(index + 2, pageSize)),
  )

  return [
    ...first.data.items,
    ...remaining.flatMap(result => result.success ? result.data.items : []),
  ]
}

function toPermissionWithSystem(permission: Permission): PermissionWithSystem {
  return {
    ...permission,
    is_system: SEED_PERMISSION_CODES.has(permission.code),
  }
}

async function syncRolePermissionIds(roleId: string, permissionIds: string[], failedMessage: string): Promise<HaiResult<void>> {
  const currentResult = await iam.authz.getRolePermissions(roleId)
  const currentIds = currentResult.success ? currentResult.data.map(p => p.id) : []
  const toRemove = currentIds.filter(permId => !permissionIds.includes(permId))
  const toAdd = permissionIds.filter(permId => !currentIds.includes(permId))

  const results = await Promise.all([
    ...toRemove.map(permId => iam.authz.removePermissionFromRole(roleId, permId)),
    ...toAdd.map(permId => iam.authz.assignPermissionToRole(roleId, permId)),
  ])
  const failed = results.find(result => !result.success)
  if (failed && !failed.success) {
    return err({ code: 'iam.role.permission_sync_failed', message: `${failedMessage}: ${failed.error.message}` })
  }

  return ok(undefined)
}

/** 将角色名称转为稳定的角色 code。 */
export function createRoleCode(name: string): string {
  return `role_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
}

/** 批量把权限 code 转为权限 ID；不存在的 code 会被忽略。 */
export async function resolvePermissionIds(codes: string[] | undefined): Promise<string[] | undefined> {
  if (codes === undefined)
    return undefined
  if (codes.length === 0)
    return []

  const permissions = await Promise.all(codes.map(code => getAdminPermissionByCode(code)))
  return permissions.filter((permission): permission is PermissionWithSystem => permission !== null).map(permission => permission.id)
}

/** 创建角色，并同步初始权限。 */
export async function createAdminRole(input: CreateRoleInput): Promise<HaiResult<RoleWithPermissions>> {
  const createResult = await iam.authz.createRole({
    code: input.code,
    name: input.name,
    description: input.description,
  })

  if (!createResult.success) {
    return err({ code: 'iam.role.create_failed', message: `${m.api_iam_roles_create_failed()}: ${createResult.error.message}` })
  }

  const syncResult = await syncRolePermissionIds(createResult.data.id, input.permissions ?? [], m.api_iam_roles_create_failed())
  if (!syncResult.success) {
    await iam.authz.deleteRole(createResult.data.id)
    return err(syncResult.error)
  }

  const role = await getAdminRole(createResult.data.id)
  return ok(role ?? { ...createResult.data, permissions: [] })
}

/** 根据 ID 获取带权限 code 的角色。 */
export async function getAdminRole(id: string): Promise<RoleWithPermissions | null> {
  const result = await iam.authz.getRole(id)
  if (!result.success || !result.data)
    return null

  const permissionsResult = await iam.authz.getRolePermissions(id)
  const permissions = permissionsResult.success ? permissionsResult.data.map(p => p.code) : []
  return { ...result.data, permissions }
}

/** 获取全部角色，并一次性带出权限 code。 */
export async function listAdminRoles(): Promise<RoleWithPermissions[]> {
  const roles = await listAllPages((page, pageSize) => iam.authz.getAllRoles({ page, pageSize }))
  if (roles.length === 0)
    return []

  const roleIds = roles.map(role => role.id)
  const permissionsResult = await iam.authz.getRolePermissionsForMany(roleIds)
  const permissionsMap = permissionsResult.success ? permissionsResult.data : new Map<string, Permission[]>()

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

  if (Object.keys(updateData).length > 0) {
    const updateResult = await iam.authz.updateRole(id, updateData)
    if (!updateResult.success) {
      return err({ code: 'iam.role.update_failed', message: `${m.api_iam_roles_update_failed()}: ${updateResult.error.message}` })
    }
  }

  if (editableInput.permissions !== undefined) {
    const syncResult = await syncRolePermissionIds(id, editableInput.permissions, m.api_iam_roles_update_failed())
    if (!syncResult.success)
      return err(syncResult.error)
  }

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
    return err({ code: 'iam.role.delete_failed', message: `${m.api_iam_roles_delete_failed()}: ${deleteResult.error.message}` })
  }

  return ok(true)
}

/** 当前 IAM 暂未提供按角色统计用户数，页面保持 0 作为显式占位。 */
export function getAdminRoleUserCount(_roleId: string): number {
  return 0
}

/** 创建权限。 */
export async function createAdminPermission(input: CreatePermissionInput): Promise<HaiResult<PermissionWithSystem>> {
  const result = await iam.authz.createPermission(input)
  if (!result.success) {
    return err({ code: 'iam.permission.create_failed', message: `${m.api_iam_permissions_create_failed()}: ${result.error.message}` })
  }

  return ok(toPermissionWithSystem(result.data))
}

/** 根据 ID 获取权限。 */
export async function getAdminPermission(id: string): Promise<PermissionWithSystem | null> {
  const result = await iam.authz.getPermission(id)
  if (!result.success || !result.data)
    return null
  return toPermissionWithSystem(result.data)
}

/** 根据 code 获取权限。 */
export async function getAdminPermissionByCode(code: string): Promise<PermissionWithSystem | null> {
  const result = await iam.authz.getPermissionByCode(code)
  if (!result.success || !result.data)
    return null
  return toPermissionWithSystem(result.data)
}

/** 分页获取权限列表。 */
export async function listAdminPermissionsPage(options: PermissionQueryOptions): Promise<{
  items: PermissionWithSystem[]
  total: number
  page: number
  pageSize: number
}> {
  const result = await iam.authz.getAllPermissions(options)
  if (!result.success) {
    return { items: [], total: 0, page: options.page ?? 1, pageSize: options.pageSize ?? 20 }
  }

  return {
    items: result.data.items.map(toPermissionWithSystem),
    total: result.data.total,
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
    return err({ code: 'iam.permission.delete_failed', message: `${m.api_iam_permissions_delete_failed()}: ${result.error.message}` })
  }
  return ok(undefined)
}

/** 将底层唯一键冲突错误映射为稳定的用户可读提示。 */
export function normalizeUniqueConstraintError(message: string | undefined, fallback: string): string {
  const lower = message?.toLowerCase() ?? ''
  if (lower.includes('unique constraint') || lower.includes('duplicate')) {
    return m.api_auth_username_or_email_taken()
  }
  return message ?? fallback
}

/** IAM 用户对象转后台用户列表响应格式（含角色 code）。 */
export async function toIamUserResponse(user: IamUserInput) {
  const userResult = await iam.user.getUser(user.id, { include: ['roles'] })
  const roles = userResult.success && userResult.data?.roles
    ? userResult.data.roles.map(role => role.code)
    : []

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatarUrl,
    status: user.enabled !== false ? 'active' as const : 'inactive' as const,
    roles,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }
}

/** IAM 用户对象转当前用户资料响应格式。 */
export async function toIamProfileResponse(user: IamProfileInput) {
  const userResult = await iam.user.getUser(user.id, { include: ['roles'] })
  const roles = userResult.success && userResult.data?.roles
    ? userResult.data.roles.map(role => role.code)
    : []

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
