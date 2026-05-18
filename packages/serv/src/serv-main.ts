/**
 * @h-ai/serv — API service runtime 统一入口
 *
 * 将 createApp、parseRequestContext、buildAuthContextFactory、listen、toFetch、openapi、pipeline 工具集合为扁平
 * 的 `serv` 命名空间，应用层通过这个模块访问所有 runtime 能力而无需直接导入内部文件。
 *
 * 设计原则：最小知识 — 调用方只需 `serv.listen(app, { port })`、`serv.requireAuth(...)`
 * 等扁平 API，不需要感知子模块层级（adapters/pipeline 等内部组织）。
 *
 * @module serv-main
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 *
 * const app = serv.createApp({ openapiContract: contract, router })
 * await serv.listen(app, { port: 3000, host: '0.0.0.0' })
 * ```
 */

import { toFetch } from './adapters/serv-adapter-fetch.js'
import { listen } from './adapters/serv-adapter-node.js'
import { createApp } from './serv-app.js'
import { buildAuthContextFactory, parseRequestContext } from './serv-context.js'
import { createDocsPage, generateSpec } from './serv-openapi.js'
import {
  mapHaiError,
  requireAuth,
  requireInternalRPC,
  requirePermission,
  requireRole,
  securityHeaders,
  WILDCARD_PERMISSION,
  WILDCARD_ROLE,
} from './serv-pipeline.js'

/** hai-framework API service runtime 统一入口（扁平 API）。 */
export const serv = {
  // 应用与上下文
  createApp,
  parseRequestContext,
  buildAuthContextFactory,

  // 运行时适配器
  listen,
  toFetch,

  // OpenAPI / 文档
  generateSpec,
  createDocsPage,

  // oRPC procedure 包装器
  requireAuth,
  requirePermission,
  requireRole,
  mapHaiError,

  // 通配符常量
  WILDCARD_PERMISSION,
  WILDCARD_ROLE,

  // Hono 中间件
  securityHeaders,
  requireInternalRPC,
}
