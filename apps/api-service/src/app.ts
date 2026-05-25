import type { ServConfig } from '@h-ai/serv'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import pkg from '../package.json' with { type: 'json' }
import { appContract } from './server/contract/index.js'
import { createApiServiceProcedures } from './server/procedures/index.js'

/**
 * api-service 应用级 contract。
 *
 * 合并了 @h-ai/api-contract 提供的领域 contract（iam/storage/ai）以及本服务自有的 `app` contract，
 * 同步导出给 api-client 使用（构造类型安全的客户端、运行集成测试）。
 */
export const apiServiceContract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  app: appContract,
})

export type ApiServiceContract = typeof apiServiceContract

/** 进程启动时间戳，用于 `app.info.uptimeMs`。 */
const startedAt = Date.now()

interface CreateApiServiceAppOptions {
  transport?: 'config' | 'disabled'
}

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
export function createApiServiceApp(options: CreateApiServiceAppOptions = {}) {
  const servConfig = core.config.getOrThrow<ServConfig>('serv')
  const transportMode = options.transport ?? 'config'
  const transport = transportMode === 'disabled' || servConfig.transport === false
    ? undefined
    : {
        crypto,
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
        maxClients: servConfig.transport.maxClients,
      }

  return serv.createApp({
    contract: apiServiceContract,
    procedures: createApiServiceProcedures({
      app: {
        info: {
          name: pkg.name,
          version: pkg.version,
          transportEnabled: transport !== undefined,
        },
        startedAt,
      },
    }),
    http: servConfig.http,
    iam,
    // transport 配置统一来自 config/_serv.yml，避免 key-exchange / 白名单路径散落在代码里。
    transport,
  })
}
