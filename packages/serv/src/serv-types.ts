/**
 * @h-ai/serv — 公开类型聚合
 *
 * 将各模块对外暴露的类型集中在此重导出，方便消费方按需 `import type`。
 * @module serv-types
 */

import type { HaiResult } from '@h-ai/core'
import type { ContractRouter, Meta } from '@orpc/server'
import type { toFetch } from './adapters/serv-adapter-fetch.js'
import type { listen } from './adapters/serv-adapter-node.js'
import type { createApp } from './serv-app.js'
import type { CreateServContext, CreateServContextInput, ServContext, ServSession } from './serv-context.js'
import type { cors } from './serv-cors.js'
import type { servM } from './serv-i18n.js'
import type { generateSpec } from './serv-openapi.js'
import type { ServImplementer } from './serv-router.js'
import type { createRuntimeSecurityPolicy } from './serv-runtime-security.js'
import type { storageAssets } from './serv-storage-assets.js'
import type { resolveRequestLocale, validateInputOrFail } from './serv-validation.js'

/**
 * Serv 公开命名空间；显式函数签名避免消费者声明引用内部共享构建块。
 * @example
 * ```ts
 * import type { ServFunctions } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const runtime: ServFunctions = serv
 * const context = runtime.parseRequestContext({ request: new Request('https://example.com') })
 * void context.requestId
 * ```
 */
export interface ServFunctions {
  createApp: typeof createApp
  parseRequestContext: (input: CreateServContextInput) => ServContext
  buildAuthContextFactory: (verifyToken: (accessToken: string) => Promise<HaiResult<ServSession>>) => CreateServContext
  resolveRequestLocale: typeof resolveRequestLocale
  listen: typeof listen
  toFetch: typeof toFetch
  cors: typeof cors
  storageAssets: typeof storageAssets
  createRuntimeSecurityPolicy: typeof createRuntimeSecurityPolicy
  generateSpec: typeof generateSpec
  implement: <TContract extends ContractRouter<Meta>>(contract: TContract) => ServImplementer<TContract>
  validateInputOrFail: typeof validateInputOrFail
  WILDCARD_PERMISSION: string
  WILDCARD_ROLE: string
  m: typeof servM
}

export type { ServFetchHandler } from './adapters/serv-adapter-fetch.js'
export type { ServListenOptions, ServNodeServer } from './adapters/serv-adapter-node.js'
export type {
  ServMiddleware,
  ServMiddlewareFactory,
  ServProcedureHandler,
  ServProcedureOptions,
} from './pipelines/serv-pipeline-types.js'
export type { AudioTicketGrant, AudioTicketVerification, AuthorizedAudioRequest, CreateServAppOptions, ServAudioConfig, ServHttpApp, ServMiddlewareMount } from './serv-app.js'
export type {
  ServConfig,
  ServConfigInput,
  ServCorsRuntimeConfig,
  ServCorsRuntimeConfigInput,
  ServDocsHttpConfig,
  ServHealthHttpConfig,
  ServHttpConfig,
  ServHttpConfigInput,
  ServOpenAPIHttpConfig,
  ServServerConfig,
  ServServerConfigInput,
  ServTransportRuntimeConfig,
  ServTransportRuntimeConfigInput,
} from './serv-config.js'
export type { CreateServContext, CreateServContextInput, ServContext, ServIam, ServRequestMetadata, ServSession } from './serv-context.js'
export type { NativeRefreshTokenTransportConfig, RefreshCookieConfig, RefreshTokenPair } from './serv-cookie-auth.js'
export type { ServCorsConfig } from './serv-cors.js'
export type { GenerateOpenAPISpecOptions } from './serv-openapi.js'
export type { ServRuntimeSecurityPolicy, ServRuntimeSecurityPolicyInput } from './serv-runtime-security.js'
export type { ServStorageAssetsConfig } from './serv-storage-assets.js'
export type { ServTransportConfig } from './serv-transport.js'
export type { ServValidationFailureBody } from './serv-validation.js'
