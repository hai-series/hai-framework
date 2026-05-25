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

import { oc } from '@orpc/contract'
import { implement } from '@orpc/server'
import { toFetch } from './adapters/serv-adapter-fetch.js'
import { listen } from './adapters/serv-adapter-node.js'
import { mapHaiError } from './pipelines/serv-pipeline-helper.js'
import { requireAuth } from './pipelines/serv-pipeline-require-auth.js'
import { requirePermission, WILDCARD_PERMISSION } from './pipelines/serv-pipeline-require-permission.js'
import { requireRole, WILDCARD_ROLE } from './pipelines/serv-pipeline-require-role.js'
import { createApp } from './serv-app.js'
import { ServConfigSchema } from './serv-config.js'
import { buildAuthContextFactory, parseRequestContext } from './serv-context.js'
import { servM } from './serv-i18n.js'
import { generateSpec } from './serv-openapi.js'
import {
  resolveRequestLocale,
  validateInputOrFail,
} from './serv-validation.js'

export { ServConfigSchema }

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

  // OpenAPI / 导出
  generateSpec,

  // Contract / Procedure 装配（封装 oRPC 实现细节，避免应用层直接依赖 `@orpc/*`）
  /** 创建 oRPC contract 节点（封装 `@orpc/contract` 的 `oc`）。 */
  contract: oc,
  /** 基于 contract 创建可注入 context 的 procedure builder（封装 `@orpc/server` 的 `implement`）。 */
  implement,

  // oRPC procedure 包装器
  requireAuth,
  requirePermission,
  requireRole,
  mapHaiError,
  validateInputOrFail,

  // 通配符常量
  WILDCARD_PERMISSION,
  WILDCARD_ROLE,

  // Serv 模块 i18n 消息获取器（支持 `options.locale` 单次调用本地化）。
  m: servM,
}
