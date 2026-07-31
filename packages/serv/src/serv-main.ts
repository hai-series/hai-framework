/**
 * @h-ai/serv — API service runtime 统一入口
 *
 * 将 createApp、parseRequestContext、buildAuthContextFactory、listen、toFetch、openapi、pipeline 工具集合为扁平
 * 的 `serv` 命名空间，应用层通过这个模块访问所有 runtime 能力而无需直接导入内部文件。
 *
 * @module serv-main
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 *
 * const procedures = serv
 *   .implement(contract)
 *   .context<ServContext>()
 *   .route('health', handler)
 *   .build()
 * ```
 */

import { toFetch } from './adapters/serv-adapter-fetch.js'
import { listen } from './adapters/serv-adapter-node.js'
import {
  WILDCARD_PERMISSION,
  WILDCARD_ROLE,
} from './pipelines/serv-pipeline-guard.js'
import { createApp } from './serv-app.js'
import { ServConfigSchema } from './serv-config.js'
import { buildAuthContextFactory, parseRequestContext } from './serv-context.js'
import { cors } from './serv-cors.js'
import { servM } from './serv-i18n.js'
import { generateSpec } from './serv-openapi.js'
import { implement } from './serv-router.js'
import { createRuntimeSecurityPolicy } from './serv-runtime-security.js'
import { storageAssets } from './serv-storage-assets.js'
import {
  resolveRequestLocale,
  validateInputOrFail,
} from './serv-validation.js'

export { ServConfigSchema }
export type {
  AuthenticatedServContext,
  ServImplementer,
  ServRouteHandler,
  ServRoutePath,
  ServRouterBuilder,
} from './serv-router.js'

/** hai-framework API service runtime 统一入口（扁平 API）。 */
export const serv = {
  // 应用与上下文
  createApp,
  parseRequestContext,
  buildAuthContextFactory,
  resolveRequestLocale,

  // 运行时适配器
  listen,
  toFetch,
  cors,
  storageAssets,
  createRuntimeSecurityPolicy,

  // OpenAPI / 导出
  generateSpec,

  // Contract procedure 装配。
  implement,

  // Procedure 工具；认证与授权统一由 route 链声明。
  validateInputOrFail,

  // 通配符常量
  WILDCARD_PERMISSION,
  WILDCARD_ROLE,

  // Serv 模块 i18n 消息获取器（支持 `options.locale` 单次调用本地化）。
  m: servM,
}
