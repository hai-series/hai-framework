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
import type { createContractHandler } from './serv-contract-handler.js'
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
  /** 装配流式聊天 procedure。 */
  createAiStreamingProcedures: typeof import('./features/serv-feature-ai-streaming.js').createAiStreamingProcedures
  /** 装配按主体和作用域授权的记忆写入 procedures。 */
  createAiMemoryWriteProcedures: typeof import('./features/serv-feature-ai-memory-write.js').createAiMemoryWriteProcedures
  /** 装配由宿主授权的语音与图像 procedures。 */
  createAiMediaProcedures: typeof import('./features/serv-feature-ai-media.js').createAiMediaProcedures
  /** 装配 IAM 实时语音票据与 WebSocket 授权。 */
  createIamAudio: typeof import('./features/serv-feature-iam-audio.js').createIamAudio
  /** 装配由宿主配置授权的审计 procedures。 */
  createAuditProcedures: typeof import('./features/serv-feature-audit.js').createAuditProcedures
  /** 装配反馈 procedures；不自动初始化反馈服务。 */
  createFeedbackProcedures: typeof import('./features/serv-feature-feedback.js').createFeedbackProcedures
  /** 装配 IAM procedures。 */
  createIamProcedures: typeof import('./features/serv-feature-iam.js').createIamProcedures
  /** 装配 API Key 和角色权限管理 procedures。 */
  createIamManagementProcedures: typeof import('./features/serv-feature-iam-management.js').createIamManagementProcedures
  /** 装配由宿主订单策略授权的支付关单 procedure。 */
  createPaymentCloseOrderProcedures: typeof import('./features/serv-feature-payment-close-order.js').createPaymentCloseOrderProcedures
  /** 装配存储 procedures；对象授权仍由宿主提供。 */
  createStorageProcedures: typeof import('./features/serv-feature-storage.js').createStorageProcedures
  /** 装配由宿主按完整对象 key 授权的文件中转 procedures。 */
  createStorageTransferProcedures: typeof import('./features/serv-feature-storage-transfer.js').createStorageTransferProcedures
  createApp: typeof createApp
  /** 装配可交给其它 Fetch 宿主的契约路由与文档。 */
  createContractHandler: typeof createContractHandler
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
  guard: {
    /** 已验证权限与资源归属后检查当前操作的单次再鉴别。 */
    requireSensitive: typeof import('./pipelines/serv-pipeline-guard.js').requireSensitiveOperation
  }
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
export type { CreateServContractHandlerOptions } from './serv-contract-handler.js'
export type { NativeRefreshTokenTransportConfig, RefreshCookieConfig, RefreshTokenPair } from './serv-cookie-auth.js'
export type { ServCorsConfig } from './serv-cors.js'
export type { GenerateOpenAPISpecOptions } from './serv-openapi.js'
export type { ServTransportRoute } from './serv-route-transport.js'
export type { ServRuntimeSecurityPolicy, ServRuntimeSecurityPolicyInput } from './serv-runtime-security.js'
export type { ServStorageAssetsConfig } from './serv-storage-assets.js'
export type { ServTransportConfig } from './serv-transport.js'
export type { ServValidationFailureBody } from './serv-validation.js'
