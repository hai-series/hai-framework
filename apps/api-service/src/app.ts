import { apiServiceContract } from '@h-ai/api-contract/presets/api-service'
import { serv } from '@h-ai/serv'
import { createApiServiceProcedures } from './server/procedures/index.js'

/** 创建 Hono API Service 应用。 */
export function createApiServiceApp() {
  return serv.createApp({
    contract: apiServiceContract,
    procedures: createApiServiceProcedures(),
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
      health: { path: '/health', readyPath: '/ready' },
      rpc: false,
    },
  })
}

/** 默认 Hono app，供测试和 Fetch Runtime 复用。 */
export const app = createApiServiceApp()
