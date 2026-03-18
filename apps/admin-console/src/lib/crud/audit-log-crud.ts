import type { CrudFieldDef, CrudResourceDef } from '@h-ai/kit'
/**
 * 审计日志 CRUD 定义
 *
 * 只读资源，仅 list，无增删改。
 */
import * as m from '$lib/paraglide/messages'
import { getLocale } from '$lib/paraglide/runtime'

import { kit } from '@h-ai/kit'

// 活动动作 → i18n 翻译
function translateAction(action: string): string {
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

function formatDateTime(isoString: string | Date): string {
  return new Date(isoString).toLocaleString(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const fields: CrudFieldDef[] = [
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
    render: value => translateAction(String(value ?? '')),
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

// 这里不定义 api，因为审计日志使用 server-side load
export const auditLogResource: CrudResourceDef = {
  name: 'audit-log',
  label: () => m.logs_title(),
  keyField: 'id',
  fields,
  searchable: false,
  defaultPageSize: 20,
  api: {
    // 审计日志不需要客户端 API 调用，数据由 +page.server.ts 提供
    // 只需要一个空壳 list（不会实际调用）
    list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
  },
}

export const auditLogCrud = kit.crud.define(auditLogResource)
