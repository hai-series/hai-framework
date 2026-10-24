import type { ServConfig, ServTransportConfig } from '@h-ai/serv'
import process from 'node:process'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { core } from '@h-ai/core'
import { createReldbTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
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
  let transport: ServTransportConfig | undefined
  if (transportMode !== 'disabled' && servConfig.transport !== false) {
    const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
    if (!ring.success)
      throw new Error(ring.error.message)
    transport = {
      crypto,
      serverKeyRing: ring.data,
      keyStore: createReldbTransportKeyStore({ reldb, ttlSeconds: 3600 }),
      keyExchangePath: servConfig.transport.keyExchangePath,
      maxPlaintextBytes: servConfig.transport.maxPlaintextBytes,
      excludePaths: [...servConfig.transport.excludePaths],
    }
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
    // 公开路径来自 _serv.yml；服务端密钥环仅从私有 Secret 注入，registry 复用 reldb。
    transport,
  })
}
