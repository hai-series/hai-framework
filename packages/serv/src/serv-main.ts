/**
 * @h-ai/serv — API service runtime 统一入口
 *
 * 将 createApp、pipeline、openapi、adapters 集合为 `serv` 命名空间，
 * 应用层通过这个模块访问所有 runtime 能力而无需直接导入内部文件。
 * @module serv-main
 */

import * as fetchAdapter from './adapters/fetch.js'
import * as nodeAdapter from './adapters/node.js'
import { createApp } from './app/create-app.js'
import { createContext } from './context/create-context.js'
import { createDocsPage } from './openapi/docs-page.js'
import { generateSpec } from './openapi/generate-openapi.js'
import * as handlerPipeline from './pipeline/handler.js'
import * as honoPipeline from './pipeline/hono.js'
import * as orpcPipeline from './pipeline/orpc.js'

/** hai-framework API service runtime 统一入口。 */
export const serv = {
  createApp,
  createContext,
  /**
   * Middleware 管道集合。
   *
   * - `hono`：Hono HTTP 中间件（安全响应头、请求 ID、内部 RPC 来源校验）
   * - `orpc`：oRPC procedure 包装器（错误捕获、Bearer 认证、权限检查）
   * - `handler`：handler 拦截器基础设施（metrics/trace 预留扩展点）
   */
  pipeline: {
    hono: honoPipeline,
    orpc: orpcPipeline,
    handler: handlerPipeline,
  },
  openapi: {
    generateSpec,
    createDocsPage,
  },
  /**
   * 运行时适配器集合。
   *
   * - `node`：Node.js 适配器，封装 `@hono/node-server`，将 Hono app 以 Node.js HTTP 服务器形式启动
   * - `fetch`：Fetch 适配器，将 Hono app 包装为标准 Web `fetch(Request)` handler，适用于 Cloudflare Workers / Deno / Bun 等 Fetch-first 运行时
   */
  adapters: {
    node: nodeAdapter.node,
    fetch: fetchAdapter.fetch,
  },
}

export const pipeline = serv.pipeline
