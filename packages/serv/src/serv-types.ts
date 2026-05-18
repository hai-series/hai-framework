/**
 * @h-ai/serv — 公开类型聚合
 *
 * 将各模块对外暴露的类型集中在此重导出，方便消费方按需 import type。
 * @module serv-types
 */

export type { ServFetchHandler } from './adapters/fetch.js'
export type { ServNodeListenOptions, ServNodeServer } from './adapters/node.js'
export type { CreateServAppOptions } from './app/create-app.js'
export type {
  ServDocsHttpConfig,
  ServHealthHttpConfig,
  ServHttpConfig,
  ServHttpConfigInput,
  ServOpenAPIHttpConfig,
  ServRpcHttpConfig,
} from './app/http-config.js'
export type { CreateServContext, CreateServContextInput, ServContext, ServSession } from './context/context-types.js'
export type { CreateDocsPageOptions } from './openapi/docs-page.js'
export type { GenerateOpenAPISpecOptions } from './openapi/generate-openapi.js'
export type { ServProcedureHandler, ServProcedureOptions } from './pipeline/orpc.js'
