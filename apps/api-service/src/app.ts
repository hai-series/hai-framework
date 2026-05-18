import { aiContract, createApiContract, iamContract, storageContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createApiServiceProcedures } from './server/procedures/index.js'

const contract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })

/**
 * 创建 Hono API Service 应用。
 *
 * 调用方负责在调用前完成 `initApp()`。由于返回值持有各业务模块的闭包技术引用，
 * 需避免在模块顶层提前实例化 app（那会在 `initApp()` 之前触发 procedure 创建路径）。
 *
 * **认证装配（最小知识原则）**：只需在顶层传入 `iam`，serv 自动派生：
 * - access token 校验（填充 `context.session`）
 * - refresh token 轮换（若启用 `refreshCookie`）
 */
export function createApiServiceApp() {
  return serv.createApp({
    contract,
    procedures: createApiServiceProcedures(),
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
      health: { path: '/health', readyPath: '/ready' },
      rpc: false,
    },
    iam,
  })
}
