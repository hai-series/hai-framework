/**
 * @h-ai/serv — Hono app 工层
 *
 * 将 oRPC contract + procedures + http 配置组合为可运行的 Hono app，
 * 自动挂载健康检查、OpenAPI 路由、oRPC handler 及 Hono middleware。
 * @module app/create-app
 */

import type { AnyContractRouter } from '@orpc/contract'
import type { Router } from '@orpc/server'
import type { Hono } from 'hono'
import type { CreateServContext, ServContext } from '../context/context-types.js'
import type { ServHttpConfigInput } from './http-config.js'
import { Hono as HonoApp } from 'hono'
import { createContext as defaultCreateContext } from '../context/create-context.js'
import { createDocsPage } from '../openapi/docs-page.js'
import { generateSpec } from '../openapi/generate-openapi.js'
import { securityHeaders } from '../pipeline/hono.js'
import { mountHealthEndpoints } from './health.js'
import { resolveServHttpConfig } from './http-config.js'
import { mountOpenAPIHandler, mountRPCHandler } from './mount-orpc.js'

/** 创建 Hono app 的配置。 */
export interface CreateServAppOptions<
  TContract extends AnyContractRouter,
  TProcedures extends Router<AnyContractRouter, ServContext>,
> {
  readonly contract: TContract
  readonly procedures: TProcedures
  readonly http?: ServHttpConfigInput
  readonly createContext?: CreateServContext
}

/**
 * 创建并装配 Hono API app。
 *
 * @param options - contract/procedures/http 三段式配置
 * @returns Hono app
 *
 * @example
 * ```ts
 * const app = createApp({
 *   contract: apiServiceContract,
 *   procedures: router,
 *   http: {
 *     apiPrefix: '/api/v1',
 *     openapi: { path: '/openapi.json' },
 *     docs: { path: '/docs' },
 *     health: { path: '/health' },
 *   },
 * })
 * serv.adapters.node.listen(app, { port: 3000 })
 * ```
 */
export function createApp<
  TContract extends AnyContractRouter,
  TProcedures extends Router<AnyContractRouter, ServContext>,
>(options: CreateServAppOptions<TContract, TProcedures>): Hono {
  const http = resolveServHttpConfig(options.http)
  const app = new HonoApp()
  const createContext = options.createContext ?? defaultCreateContext
  let specPromise: ReturnType<typeof generateSpec> | undefined

  app.use('*', securityHeaders())

  if (http.health !== false) {
    mountHealthEndpoints(app, http.health)
  }

  mountOpenAPIHandler(app, options.procedures, http.apiPrefix, createContext)
  mountRPCHandler(app, options.procedures, http, createContext)

  if (http.openapi !== false) {
    app.get(http.openapi.path, async (c) => {
      specPromise ??= generateSpec(options.contract, { apiPrefix: http.apiPrefix })
      return c.json(await specPromise)
    })
  }

  if (http.docs !== false) {
    app.get(http.docs.path, async (c) => {
      if (http.docs !== false && http.docs.requireAuth) {
        const context = await createContext({ request: c.req.raw })
        if (!context.accessToken) {
          return c.json({ success: false, error: 'Unauthorized' }, 401)
        }
      }

      specPromise ??= generateSpec(options.contract, { apiPrefix: http.apiPrefix })
      const specUrl = http.openapi === false ? undefined : http.openapi.path
      return c.html(createDocsPage(await specPromise, { specUrl }))
    })
  }

  return app
}
