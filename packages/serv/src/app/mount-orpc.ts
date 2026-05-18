/**
 * @h-ai/serv — oRPC handler 挂载
 *
 * 将 oRPC OpenAPIHandler（对外 REST）和 RPCHandler（内部 RPC）装配到 Hono app。
 * @module app/mount-orpc
 */

import type { AnyContractRouter } from '@orpc/contract'
import type { Router } from '@orpc/server'
import type { Hono, Context as HonoContext, Next } from 'hono'
import type { CreateServContext, ServContext } from '../context/context-types.js'
import type { ServHttpConfig } from './http-config.js'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { requireInternalRPC } from '../pipeline/hono.js'

const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

/** 挂载 oRPC OpenAPIHandler。 */
export function mountOpenAPIHandler(
  app: Hono,
  procedures: Router<AnyContractRouter, ServContext>,
  apiPrefix: `/${string}`,
  createContext: CreateServContext,
): void {
  const handler = new OpenAPIHandler(procedures)

  for (const method of API_METHODS) {
    app.on(method, `${apiPrefix}/*`, async (c, next) => {
      return handleORPCRequest(c, next, apiPrefix, handler, createContext)
    })
  }
}

/** 挂载可选内部 RPCHandler。 */
export function mountRPCHandler(
  app: Hono,
  procedures: Router<AnyContractRouter, ServContext>,
  http: ServHttpConfig,
  createContext: CreateServContext,
): void {
  if (http.rpc === false) {
    return
  }

  const handler = new RPCHandler(procedures)
  app.use(`${http.rpc.prefix}/*`, requireInternalRPC(http.rpc))

  for (const method of API_METHODS) {
    app.on(method, `${http.rpc.prefix}/*`, async (c, next) => {
      return handleORPCRequest(c, next, http.rpc === false ? '/rpc' : http.rpc.prefix, handler, createContext)
    })
  }
}

async function handleORPCRequest(
  c: HonoContext,
  next: Next,
  prefix: `/${string}`,
  handler: OpenAPIHandler<ServContext> | RPCHandler<ServContext>,
  createContext: CreateServContext,
): Promise<Response | void> {
  const context = await createContext({ request: c.req.raw })
  const result = await handler.handle(c.req.raw, { prefix, context })

  if (result.matched) {
    return result.response
  }

  await next()
}
