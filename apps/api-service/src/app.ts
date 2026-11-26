import type { ServConfig, ServTransportConfig } from '@h-ai/serv'
import process from 'node:process'
import { ai } from '@h-ai/ai'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { cache } from '@h-ai/cache'
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
 * **认证装配（最小知识原则）**：只需在 `auth.iam` 注入 IAM，serv 自动派生：
 * - access token 校验（填充 `context.session`）
 * - refresh token 轮换（若启用 `refreshCookie`）
 */
export function createApiServiceApp(options: CreateApiServiceAppOptions = {}) {
  const servConfig = core.config.getOrThrow<ServConfig>('serv')
  const coreConfig = core.config.get<AppCoreConfig>('core')
  const rateLimit = servConfig.http.rateLimit && {
    ...servConfig.http.rateLimit,
    store: core.access.createCacheRateLimitStore(cache, { namespace: pkg.name, allowMemory: true }),
  }
  const { cors } = servConfig
  const security = serv.createRuntimeSecurityPolicy({
    environment: coreConfig?.env,
    corsOrigin: cors && cors.origin,
    nativeOrigins: cors ? cors.nativeOrigins : undefined,
  })
  const transportMode = options.transport ?? 'config'
  const refreshCookieMode = options.refreshCookie ?? 'enabled'
  let transport: ServTransportConfig | undefined
  if (transportMode !== 'disabled' && servConfig.transport !== false) {
    const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
    if (!ring.success)
      throw new Error(ring.error.message)
    transport = {
      ...servConfig.transport,
      crypto,
      serverKeyRing: ring.data,
      keyStore: crypto.transport.createKeyStore({ cache, ttlSeconds: 3600 }),
      excludePaths: [
        ...new Set([
          ...servConfig.transport.excludePaths,
          ...(servConfig.http.health
            ? [servConfig.http.health.path, servConfig.http.health.readyPath].filter((path): path is `/${string}` => Boolean(path))
            : []),
          ...(servConfig.http.openapi && security.exposeApiDocs
            ? [servConfig.http.openapi.path]
            : []),
          ...(servConfig.http.docs && security.exposeApiDocs
            ? [servConfig.http.docs.path, `${servConfig.http.docs.path.slice(0, servConfig.http.docs.path.lastIndexOf('/') + 1)}_hai/scalar.js`]
            : []),
        ]),
      ],
    }
  }

  const audio = serv.createIamAudio({
    ai,
    iam,
    config: servConfig.audio,
    permission: 'ai:audio:use',
  })
  return serv.createApp({
    audio: audio.config,
    contract: apiServiceContract,
    procedures: createApiServiceProcedures({
      audio,
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
      rateLimit,
      openapi: security.exposeApiDocs ? servConfig.http.openapi : false,
      docs: security.exposeApiDocs ? servConfig.http.docs : false,
    },
    auth: { iam },
    a2a: servConfig.a2a && ai.a2a.createHttpHandler({
      ...servConfig.a2a,
      authenticate: {
        verifyApiKey: key => iam.apiKey.verifyApiKey(key),
      },
    }),
    cors: cors && {
      ...cors,
      origin: security.allowOrigin,
      credentials: cors.credentials,
      allowedHeaders: [
        ...new Set([
          ...cors.allowedHeaders,
          'x-request-client',
          'x-hai-token-transport',
          'x-hai-terminal',
        ]),
      ],
      exposedHeaders: [
        ...cors.exposedHeaders,
        ...(rateLimit
          ? [
              'Retry-After',
              'X-RateLimit-Limit',
              'X-RateLimit-Remaining',
              'X-RateLimit-Reset',
            ]
          : []),
      ],
    },
    refreshCookie: refreshCookieMode === 'disabled'
      ? undefined
      : {
          secure: security.secureRefreshCookie,
          nativeTokenTransport: {
            isRequest: request => request.headers.get('x-hai-token-transport') === 'body'
              && ['hai-mobile-app', 'hai-desktop-app'].includes(request.headers.get('x-request-client') ?? '')
              && security.isNativeOrigin(request.headers.get('origin') ?? ''),
          },
        },
    // 公开路径来自 _serv.yml；服务端密钥环仅从私有 Secret 注入，registry 复用 cache。
    transport,
  })
}
