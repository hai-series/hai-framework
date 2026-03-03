import type { CoreConfig } from '@h-ai/core'
import type { PageServerLoad } from './$types'
import { core } from '@h-ai/core'

interface ApiDoc {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  usage: string
}

export const load: PageServerLoad = async () => {
  const coreConfig = core.config.get<CoreConfig>('core')

  const apis: ApiDoc[] = [
    {
      method: 'GET',
      path: '/api/v1/health',
      description: '健康检查，返回服务与模块状态',
      usage: 'GET /api/v1/health',
    },
    {
      method: 'GET',
      path: '/api/v1/items?page=1&pageSize=20&search=foo',
      description: '分页查询 items，支持 search',
      usage: 'GET /api/v1/items?page=1&pageSize=20',
    },
    {
      method: 'POST',
      path: '/api/v1/items',
      description: '创建 item',
      usage: 'POST /api/v1/items with { name, description }',
    },
    {
      method: 'GET',
      path: '/api/v1/items/:id',
      description: '获取单个 item 详情',
      usage: 'GET /api/v1/items/<id>',
    },
    {
      method: 'PUT',
      path: '/api/v1/items/:id',
      description: '更新 item（支持 name/description/status）',
      usage: 'PUT /api/v1/items/<id> with partial fields',
    },
    {
      method: 'DELETE',
      path: '/api/v1/items/:id',
      description: '删除 item',
      usage: 'DELETE /api/v1/items/<id>',
    },
  ]

  return {
    coreInfo: {
      name: coreConfig?.name ?? 'hai API Service',
      version: coreConfig?.version ?? '0.1.0',
      env: coreConfig?.env ?? 'development',
      debug: coreConfig?.debug ?? false,
      defaultLocale: coreConfig?.defaultLocale ?? 'en-US',
    },
    apis,
  }
}
