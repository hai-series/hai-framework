/**
 * @h-ai/serv — 公开类型聚合
 *
 * 将各模块对外暴露的类型集中在此重导出，方便消费方按需 `import type`。
 * @module serv-types
 */

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
  ServRpcHttpConfig,
  ServServerConfig,
  ServServerConfigInput,
  ServTransportRuntimeConfig,
  ServTransportRuntimeConfigInput,
} from './serv-config.js'
export type { CreateServContext, CreateServContextInput, ServContext, ServIam, ServSession } from './serv-context.js'
export type { NativeRefreshTokenTransportConfig, RefreshCookieConfig, RefreshTokenPair } from './serv-cookie-auth.js'
export type { ServCorsConfig } from './serv-cors.js'
export type { GenerateOpenAPISpecOptions } from './serv-openapi.js'
export type { ServRuntimeSecurityPolicy, ServRuntimeSecurityPolicyInput } from './serv-runtime-security.js'
export type { ServStorageAssetsConfig } from './serv-storage-assets.js'
export type { ServTransportConfig } from './serv-transport.js'
export type { ServValidationFailureBody } from './serv-validation.js'
