import type { CrudFieldDef, CrudResourceDef } from '@h-ai/kit'
/**
 * 权限管理 CRUD 定义
 */
import * as m from '$lib/paraglide/messages'
import { apiFetch } from '$lib/utils/api'

import { kit } from '@h-ai/kit'

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
      list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      create: async (data) => {
        // 自动生成 name: resource:action
        const submitData = { ...data }
        if (submitData.resource && submitData.action) {
          submitData.name = `${submitData.resource}:${submitData.action}`
        }
        const response = await apiFetch('/api/iam/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitData),
        })
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error?.message || m.iam_users_operation_failed())
        }
        return result.data
      },
      remove: async (id) => {
        const response = await apiFetch(`/api/iam/permissions/${id}`, {
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
