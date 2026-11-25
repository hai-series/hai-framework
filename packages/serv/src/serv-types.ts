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
 *
 * import { type ServFunctions, serv } from '@h-ai/serv'
 *
 * const runtime: ServFunctions = serv
 * const context = runtime.parseRequestContext({ request: new Request('https://example.com') })
 * void context.requestId
 * ```
 */
export interface ServFunctions {
  /** 装配 AI procedures；依赖及授权由宿主管理。 */
  createAiProcedures: typeof import('./features/serv-feature-ai.js').createAiProcedures
  /** 装配反馈 procedures；不自动初始化反馈服务。 */
  createFeedbackProcedures: typeof import('./features/serv-feature-feedback.js').createFeedbackProcedures
  /** 装配 IAM procedures。 */
  createIamProcedures: typeof import('./features/serv-feature-iam.js').createIamProcedures
  /** 装配存储 procedures；对象授权仍由宿主提供。 */
  createStorageProcedures: typeof import('./features/serv-feature-storage.js').createStorageProcedures
  /** 装配由宿主配置授权的 ai-extension procedures。 */
  createAiExtensionProcedures: typeof import('./features/serv-feature-ai-extension.js').createAiExtensionProcedures
  /** 装配由宿主配置授权的 audit procedures。 */
  createAuditProcedures: typeof import('./features/serv-feature-audit.js').createAuditProcedures
  /** 装配由宿主配置授权的 iam-extension procedures。 */
  createIamExtensionProcedures: typeof import('./features/serv-feature-iam-extension.js').createIamExtensionProcedures
  /** 装配由宿主配置授权的 payment-extension procedures。 */
  createPaymentExtensionProcedures: typeof import('./features/serv-feature-payment-extension.js').createPaymentExtensionProcedures
  /** 装配由宿主配置授权的 storage-extension procedures。 */
  createStorageExtensionProcedures: typeof import('./features/serv-feature-storage-extension.js').createStorageExtensionProcedures
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
export type { ServTransportRoute } from './serv-route-transport.js'
export type { ServRuntimeSecurityPolicy, ServRuntimeSecurityPolicyInput } from './serv-runtime-security.js'
export type { ServStorageAssetsConfig } from './serv-storage-assets.js'
export type { ServTransportConfig } from './serv-transport.js'
export type { ServValidationFailureBody } from './serv-validation.js'
