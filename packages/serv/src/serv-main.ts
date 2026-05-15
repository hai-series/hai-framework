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
  pipeline: {
    hono: honoPipeline,
    orpc: orpcPipeline,
    handler: handlerPipeline,
  },
  openapi: {
    generateSpec,
    createDocsPage,
  },
  adapters: {
    node: nodeAdapter.node,
    fetch: fetchAdapter.fetch,
  },
}

export const pipeline = serv.pipeline
