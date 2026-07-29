import type { ServConfig } from '@h-ai/serv'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import pkg from '../package.json' with { type: 'json' }
import { createApiServiceProcedures } from './server/procedures/index.js'

/** 进程启动时间戳，用于 `app.info.uptimeMs`。 */
const startedAt = Date.now()

interface CreateApiServiceAppOptions {
  transport?: 'config' | 'disabled'
  refreshCookie?: 'enabled' | 'disabled'
}

interface AppCoreConfig {
  readonly env?: string
}
/**
 * 创建 API Service HTTP 应用。
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
  const coreConfig = core.config.get<AppCoreConfig>('core')
  const security = serv.createRuntimeSecurityPolicy({
    environment: coreConfig?.env,
    corsOrigin: servConfig.cors.origin,
    nativeOrigins: servConfig.cors.nativeOrigins,
  })
  const transportMode = options.transport ?? 'config'
  const refreshCookieMode = options.refreshCookie ?? 'enabled'
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
    http: {
      ...servConfig.http,
      openapi: security.exposeApiDocs ? servConfig.http.openapi : false,
      docs: security.exposeApiDocs ? servConfig.http.docs : false,
    },
    iam,
    middlewares: [
      {
        middleware: serv.cors({
          origin: security.allowOrigin,
          credentials: servConfig.cors.credentials,
          allowedHeaders: [...servConfig.cors.allowedHeaders],
          exposedHeaders: [...servConfig.cors.exposedHeaders],
        }),
      },
    ],
    refreshCookie: refreshCookieMode === 'disabled' ? undefined : { secure: security.secureRefreshCookie },
    // transport 配置统一来自 config/_serv.yml，避免 key-exchange / 白名单路径散落在代码里。
    transport,
  })
}
