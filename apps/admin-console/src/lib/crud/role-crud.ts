import type { CrudFieldDef, CrudResourceDef } from '@h-ai/kit'
/**
 * 角色管理 CRUD 定义
 */
import * as m from '$lib/paraglide/messages'
import { apiFetch } from '$lib/utils/api'

import { kit } from '@h-ai/kit'

export function createRoleCrud() {
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
      // permissions 选项需要页面传入
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
      list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      create: async (data) => {
        const response = await apiFetch('/api/iam/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_roles_operation_failed())
        }
        return result.data
      },
      update: async (id, data) => {
        const response = await apiFetch(`/api/iam/roles/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_roles_operation_failed())
        }
        return result.data
      },
      remove: async (id) => {
        const response = await apiFetch(`/api/iam/roles/${id}`, {
          method: 'DELETE',
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_roles_delete_failed())
        }
      },
    },
  }

  return kit.crud.define(resource)
}
