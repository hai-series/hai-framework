import type { CrudFieldDef, CrudResourceDef } from '@h-ai/kit'
import * as m from '$lib/paraglide/messages'
import { getLocale } from '$lib/paraglide/runtime'
import { apiFetch } from '$lib/utils/api'
import { kit } from '@h-ai/kit'

type ApiResult<T>
  = | { success: true, data: T }
    | { success: false, error?: { message?: string } }

interface PermissionOptionItem {
  code: string
  name: string
}

type PermissionsByResource = Record<string, PermissionOptionItem[]>

const emptyList = async () => ({ items: [], total: 0, page: 1, pageSize: 20 })

async function requestJson<T>(url: string, init: RequestInit, fallbackMessage: string): Promise<T> {
  const response = await apiFetch(url, init)
  const result = await response.json() as ApiResult<T>
  if (!result.success) {
    throw new Error(result.error?.message || fallbackMessage)
  }
  return result.data
}

function postJson<T>(url: string, data: Record<string, unknown>, fallbackMessage: string): Promise<T> {
  return requestJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, fallbackMessage)
}

function putJson<T>(url: string, data: Record<string, unknown>, fallbackMessage: string): Promise<T> {
  return requestJson<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, fallbackMessage)
}

async function deleteJson(url: string, fallbackMessage: string): Promise<void> {
  await requestJson<null>(url, { method: 'DELETE' }, fallbackMessage)
}

function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function createPermissionOptions(permissions: PermissionsByResource) {
  return Object.entries(permissions).flatMap(([resource, perms]) =>
    perms.map(perm => ({
      label: `${resource} / ${perm.name}`,
      value: perm.code,
    })),
  )
}

function translateAuditAction(action: string): string {
  const translations: Record<string, () => string> = {
    login: m.activity_login,
    logout: m.activity_logout,
    register: m.activity_register,
    create: m.activity_create,
    read: m.activity_read,
    update: m.activity_update,
    delete: m.activity_delete,
    password_reset: m.activity_password_reset,
    password_reset_request: m.activity_password_reset_request,
  }
  return translations[action]?.() ?? action
}

/** 创建用户管理 CRUD 定义。 */
export function createUserCrud(roles: Array<{ id: string, name: string }>) {
  const roleOptions = () => roles.map(r => ({ label: r.name, value: r.id }))

  const fields: CrudFieldDef[] = [
    {
      id: 'username',
      label: () => m.iam_users_col_username(),
      type: 'string',
      validation: { required: true, pattern: '^[a-zA-Z0-9_]{3,20}$' },
      placeholder: () => m.iam_users_form_username_placeholder(),
      order: 1,
    },
    {
      id: 'email',
      label: () => m.iam_users_col_email(),
      type: 'email',
      validation: { required: true },
      placeholder: () => m.iam_users_form_email_placeholder(),
      order: 2,
    },
    {
      id: 'display_name',
      label: () => m.iam_users_form_display_name(),
      type: 'string',
      inList: false,
      placeholder: () => m.iam_users_form_display_name_placeholder(),
      order: 4,
    },
    {
      id: 'password',
      label: () => m.iam_users_form_password(),
      type: 'password',
      inList: false,
      inDetail: false,
      placeholder: () => m.iam_users_form_password_placeholder(),
      order: 3,
    },
    {
      id: 'roles',
      label: () => m.iam_users_col_roles(),
      type: 'multi-select',
      options: roleOptions,
      inList: true,
      render: (_value, item) => {
        const roleNames = item.roleNames as string[] ?? []
        return roleNames.join(', ')
      },
      order: 4,
    },
    {
      id: 'status',
      label: () => m.iam_users_col_status(),
      type: 'select',
      filterable: true,
      options: () => [
        { label: m.iam_users_status_active(), value: 'active' },
        { label: m.iam_users_status_disabled(), value: 'suspended' },
      ],
      defaultValue: 'active',
      render: (value) => {
        switch (value) {
          case 'active': return m.iam_users_status_active()
          case 'inactive': return m.iam_users_status_inactive()
          case 'suspended': return m.iam_users_status_disabled()
          default: return String(value)
        }
      },
      order: 5,
    },
    {
      id: 'created_at',
      label: () => m.iam_users_col_created_at(),
      type: 'datetime',
      inCreate: false,
      inEdit: false,
      render: value => value ? new Date(value as string).toLocaleDateString(getLocale()) : '-',
      order: 6,
    },
  ]

  const resource: CrudResourceDef = {
    name: 'user',
    label: () => m.iam_users_title(),
    keyField: 'id',
    fields,
    searchable: true,
    searchPlaceholder: () => m.iam_users_search_placeholder(),
    defaultPageSize: 20,
    api: {
      list: emptyList,
      create: data => postJson('/api/iam/users', data, m.iam_users_operation_failed()),
      update: (id, data) => putJson(`/api/iam/users/${id}`, data, m.iam_users_operation_failed()),
      remove: id => deleteJson(`/api/iam/users/${id}`, m.iam_users_delete_failed()),
    },
  }

  return kit.crud.define(resource)
}

/** 创建角色管理 CRUD 定义。 */
export function createRoleCrud(permissions: PermissionsByResource = {}) {
  const permissionOptions = () => createPermissionOptions(permissions)

  const fields: CrudFieldDef[] = [
    {
      id: 'name',
      label: () => m.iam_roles_form_name(),
      type: 'string',
      validation: { required: true },
      placeholder: () => m.iam_roles_form_name_placeholder(),
      order: 1,
    },
    {
      id: 'description',
      label: () => m.iam_roles_form_description(),
      type: 'textarea',
      placeholder: () => m.iam_roles_form_description_placeholder(),
      inList: true,
      render: value => value ? String(value) : '-',
      order: 2,
    },
    {
      id: 'userCount',
      label: () => m.iam_roles_user_count({ count: 0 }).replace('0', ''),
      type: 'number',
      inCreate: false,
      inEdit: false,
      render: value => String(value ?? 0),
      order: 3,
    },
    {
      id: 'permissions',
      label: () => m.iam_roles_form_permissions(),
      type: 'multi-select',
      inList: true,
      options: permissionOptions,
      render: (value) => {
        const perms = value as string[] ?? []
        if (perms.length === 0)
          return '-'
        return perms.length <= 3 ? perms.join(', ') : `${perms.slice(0, 3).join(', ')} +${perms.length - 3}`
      },
      order: 4,
    },
    {
      id: 'isSystem',
      label: () => m.iam_roles_type_system(),
      type: 'boolean',
      inList: true,
      inCreate: false,
      inEdit: false,
      render: value => value ? m.iam_roles_type_system() : '-',
      order: 5,
    },
  ]

  const resource: CrudResourceDef = {
    name: 'role',
    label: () => m.iam_roles_title(),
    keyField: 'id',
    fields,
    searchable: true,
    searchPlaceholder: () => m.iam_roles_search_placeholder(),
    defaultPageSize: 20,
    api: {
      list: emptyList,
      create: data => postJson('/api/iam/roles', data, m.iam_roles_operation_failed()),
      update: (id, data) => putJson(`/api/iam/roles/${id}`, data, m.iam_roles_operation_failed()),
      remove: id => deleteJson(`/api/iam/roles/${id}`, m.iam_roles_delete_failed()),
    },
  }

  return kit.crud.define(resource)
}

/** 创建权限管理 CRUD 定义。 */
export function createPermissionCrud(permissionRolesMap: Record<string, string[]>) {
  const fields: CrudFieldDef[] = [
    {
      id: 'name',
      label: () => m.iam_permissions_col_name(),
      type: 'string',
      validation: { required: true },
      order: 1,
    },
    {
      id: 'code',
      label: () => m.iam_permissions_col_code(),
      type: 'string',
      inCreate: false,
      inEdit: false,
      render: value => String(value ?? '-'),
      order: 2,
    },
    {
      id: 'action',
      label: () => m.iam_permissions_form_action(),
      type: 'string',
      inList: true,
      render: value => value ? String(value) : '-',
      order: 3,
    },
    {
      id: 'description',
      label: () => m.iam_permissions_col_description(),
      type: 'string',
      width: '200px',
      render: value => value ? String(value) : '-',
      order: 4,
    },
    {
      id: 'type',
      label: () => m.iam_permissions_col_type(),
      type: 'select',
      filterable: true,
      options: () => [
        { label: m.iam_permissions_type_menu(), value: 'menu' },
        { label: m.iam_permissions_type_button(), value: 'button' },
        { label: m.iam_permissions_type_api(), value: 'api' },
      ],
      defaultValue: 'api',
      render: (value) => {
        switch (value) {
          case 'menu': return m.iam_permissions_type_menu()
          case 'button': return m.iam_permissions_type_button()
          case 'api': return m.iam_permissions_type_api()
          default: return String(value ?? '-')
        }
      },
      order: 5,
    },
    {
      id: 'roles',
      label: () => m.iam_permissions_col_roles(),
      type: 'string',
      inCreate: false,
      inEdit: false,
      inDetail: true,
      render: (_value, item) => {
        const code = String(item.code ?? '')
        const roles = permissionRolesMap[code] ?? []
        return roles.length > 0 ? roles.slice(0, 3).join(', ') + (roles.length > 3 ? ` +${roles.length - 3}` : '') : '-'
      },
      order: 6,
    },
    {
      id: 'resource',
      label: () => m.iam_permissions_form_resource(),
      type: 'string',
      inList: false,
      validation: { required: true },
      order: 10,
    },
  ]

  const resource: CrudResourceDef = {
    name: 'permission',
    label: () => m.iam_permissions_title(),
    keyField: 'id',
    fields,
    searchable: true,
    searchPlaceholder: () => m.iam_permissions_search_placeholder(),
    defaultPageSize: 20,
    api: {
      list: emptyList,
      create: (data) => {
        const submitData = { ...data }
        if (submitData.resource && submitData.action) {
          submitData.name = `${submitData.resource}:${submitData.action}`
        }
        return postJson('/api/iam/permissions', submitData, m.iam_users_operation_failed())
      },
      remove: id => deleteJson(`/api/iam/permissions/${id}`, m.iam_users_delete_failed()),
    },
  }

  return kit.crud.define(resource)
}

const auditLogFields: CrudFieldDef[] = [
  {
    id: 'createdAt',
    label: () => m.logs_col_time(),
    type: 'datetime',
    inCreate: false,
    inEdit: false,
    render: value => formatDateTime(value as string | Date),
    order: 1,
  },
  {
    id: 'username',
    label: () => m.logs_col_user(),
    type: 'string',
    inCreate: false,
    inEdit: false,
    render: value => String(value ?? '-'),
    order: 2,
  },
  {
    id: 'action',
    label: () => m.logs_col_action(),
    type: 'string',
    inCreate: false,
    inEdit: false,
    render: value => translateAuditAction(String(value ?? '')),
    order: 3,
  },
  {
    id: 'resource',
    label: () => m.logs_col_resource(),
    type: 'string',
    inCreate: false,
    inEdit: false,
    order: 4,
  },
  {
    id: 'details',
    label: () => m.logs_col_detail(),
    type: 'string',
    inCreate: false,
    inEdit: false,
    render: value => value ? String(value) : '-',
    width: '200px',
    order: 5,
  },
  {
    id: 'ipAddress',
    label: () => m.logs_col_ip(),
    type: 'string',
    inCreate: false,
    inEdit: false,
    render: value => String(value ?? '-'),
    order: 6,
  },
]

const auditLogResource: CrudResourceDef = {
  name: 'audit-log',
  label: () => m.logs_title(),
  keyField: 'id',
  fields: auditLogFields,
  searchable: false,
  defaultPageSize: 20,
  api: { list: emptyList },
}

/** 审计日志为只读 CRUD，数据由 server load 提供。 */
export const auditLogCrud = kit.crud.define(auditLogResource)
