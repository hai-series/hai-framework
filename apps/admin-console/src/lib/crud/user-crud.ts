import type { CrudFieldDef, CrudResourceDef } from '@h-ai/kit'
/**
 * 用户管理 CRUD 定义
 */
import * as m from '$lib/paraglide/messages'
import { apiFetch } from '$lib/utils/api'

import { kit } from '@h-ai/kit'

export function createUserCrud(roles: Array<{ id: string, name: string }>) {
  const roleOptions = () => roles.map(r => ({ label: r.name, value: r.id }))

  const fields: CrudFieldDef[] = [
    {
      id: 'username',
      label: () => m.iam_users_col_username(),
      type: 'string',
      validation: { required: true, pattern: '^[a-zA-Z0-9_]{3,20}$' },
      placeholder: () => '3-20位字母、数字或下划线',
      order: 1,
    },
    {
      id: 'email',
      label: () => m.iam_users_col_email(),
      type: 'email',
      validation: { required: true },
      placeholder: () => 'user@example.com',
      order: 2,
    },
    {
      id: 'display_name',
      label: () => m.iam_users_form_display_name(),
      type: 'string',
      inList: false,
      placeholder: () => m.iam_users_form_display_name_placeholder(),
      order: 3,
    },
    {
      id: 'roles',
      label: () => m.iam_users_col_roles(),
      type: 'multi-select',
      options: roleOptions,
      inList: true,
      render: (_value, item) => {
        // 列表中显示角色名而非 ID
        const roleNames = item.roles as string[] ?? []
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
      render: value => value ? new Date(value as string).toLocaleDateString('zh-CN') : '-',
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
      // 数据由 +page.server.ts 提供，list 不实际使用
      list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      create: async (data) => {
        const response = await apiFetch('/api/iam/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_users_operation_failed())
        }
        return result.data
      },
      update: async (id, data) => {
        const response = await apiFetch(`/api/iam/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_users_operation_failed())
        }
        return result.data
      },
      remove: async (id) => {
        const response = await apiFetch(`/api/iam/users/${id}`, {
          method: 'DELETE',
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_users_delete_failed())
        }
      },
    },
  }

  return kit.crud.define(resource)
}
