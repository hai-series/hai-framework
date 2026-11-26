/**
 * 显式挂载的文件、multipart 和事件流路由。
 * @module serv-route-transport
 */

import type { HttpContractTransport } from '@h-ai/api-contract'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { AnyContractProcedure } from '@orpc/contract'
import type { ServGuardRequirements } from './pipelines/serv-pipeline-guard.js'
import type { ServContext } from './serv-context.js'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { isProcedure, ORPCError } from '@orpc/server'
import { checkServGuards } from './pipelines/serv-pipeline-guard.js'
import { servM } from './serv-i18n.js'

/**
 * 允许指定契约端点使用文件、multipart 或 SSE，并限制解码前的请求字节数。
 * 生产环境由宿主的 HTTPS 入口发布，启用框架传输加密时还须配置该方法和路径的显式例外。
 *
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import type { ServTransportRoute } from '@h-ai/serv'
 * import { z } from 'zod'
 *
 * const download = apiContract.route({ method: 'GET', path: '/file' }).output(z.file())
 * const route: ServTransportRoute = {
 *   procedure: download,
 *   maxRequestBytes: 0,
 * }
 * ```
 */
export interface ServTransportRoute {
  readonly procedure: AnyContractProcedure
  readonly maxRequestBytes: number
}

/**
 * 只记录框架认证守卫和注册时使用的端点节点。
 * @example 模块内部上下文
 * ```ts
 * function secured(procedure: ServTransportRoute['procedure']): RegisteredRoute {
 *   return { procedure, guards: { auth: true } }
 * }
 * ```
 */
interface RegisteredRoute {
  readonly guards: ServGuardRequirements
  readonly procedure: AnyContractProcedure
}
const registeredHandlers = new WeakMap<object, RegisteredRoute>()
const dispatchState = Symbol('serv.dispatch')

/**
 * 请求上下文中的分发状态。oRPC 在合并上下文时会保留此属性。
 * @example 模块内部上下文
 * ```ts
 * function begin(context: ServContext): DispatchContext {
 *   return { ...context, [dispatchState]: { privateResponse: false } }
 * }
 * ```
 */
interface DispatchContext extends ServContext {
  readonly [dispatchState]?: {
    admittedRoute?: RegisteredRoute
    privateResponse: boolean
  }
}

/**
 * 为宿主本次分发创建独立的上下文状态。
 * @example 模块内部上下文
 * ```ts
 * function dispatch(context: ServContext) {
 *   return createDispatchContext(context)
 * }
 * ```
 */
export function createDispatchContext(context: ServContext): DispatchContext {
  return {
    ...context,
    [dispatchState]: { privateResponse: false },
  }
}

/**
 * 在当前 HTTP 请求中为包含一次性凭据的响应禁用缓存。
 * @example 模块内部上下文
 * ```ts
 * function protectTicket(context: ServContext) {
 *   markServResponsePrivate(context)
 * }
 * ```
 */
export function markServResponsePrivate(context: DispatchContext): void {
  const state = context[dispatchState]
  if (state)
    state.privateResponse = true
}

/**
 * 结束本次分发并判断响应是否需要禁用缓存。
 * @example 模块内部上下文
 * ```ts
 * function cachePolicy(context: ServContext) {
 *   return finishDispatch(context) ? 'no-store' : undefined
 * }
 * ```
 */
export function finishDispatch(context: DispatchContext): boolean {
  const state = context[dispatchState]
  if (!state)
    return false
  const isPrivate = state.privateResponse || state.admittedRoute !== undefined
  state.privateResponse = false
  state.admittedRoute = undefined
  return isPrivate
}

/**
 * 把已脱敏的领域失败转换为 oRPC HTTP 错误，保留状态和错误码。
 * @example 模块内部上下文
 * ```ts
 * function rejectFile(error: HaiError) {
 *   throw toTransportError(error)
 * }
 * ```
 */
export function toTransportError(error: HaiError): ORPCError<string, { body: HaiResult<never> }> {
  return new ORPCError(String(error.code), {
    status: error.httpStatus ?? 500,
    message: error.message,
    data: {
      body: { success: false, error },
    },
  })
}

/**
 * 登记受守卫保护的响应 handler，供实际 HTTP 挂载时识别。
 * @example 模块内部上下文
 * ```ts
 * function tag(handler: object, route: RegisteredRoute) {
 *   registerTransportHandler(handler, route)
 * }
 * ```
 */
export function registerTransportHandler(handler: object, route: RegisteredRoute): void {
  registeredHandlers.set(handler, route)
}

/**
 * 确认当前请求经过该端点的传输准入。
 * @example 模块内部上下文
 * ```ts
 * function authorized(context: ServContext, route: RegisteredRoute) {
 *   return isAdmittedTransportRoute(context, route)
 * }
 * ```
 */
export function isAdmittedTransportRoute(context: DispatchContext, route: RegisteredRoute): boolean {
  return context[dispatchState]?.admittedRoute === route
}

function routeKey(method: string | undefined, path: string | undefined, prefix: string): string {
  if (!method || !path || !/^\/(?:[\w.-]+\/)*[\w.-]+$/.test(path))
    throw new TypeError('A transport procedure must declare an HTTP method and a fixed path')
  return `${method} ${prefix}${path}`
}

function registeredRoutes(router: unknown, prefix: string): Map<string, RegisteredRoute> {
  const found = new Map<string, RegisteredRoute>()
  function scan(node: unknown): void {
    if (isProcedure(node)) {
      const definition = node['~orpc']
      const registered = registeredHandlers.get(definition.handler)
      if (registered) {
        const key = routeKey(definition.route.method, definition.route.path, prefix)
        if (found.has(key))
          throw new TypeError(`Duplicate HTTP transport procedure: ${key}`)
        found.set(key, registered)
      }
    }
    else if (node && typeof node === 'object') {
      for (const child of Object.values(node))
        scan(child)
    }
  }
  scan(router)
  return found
}

/**
 * 编译宿主白名单，先判定路由传输策略，再鉴权和有界读取正文。
 * @example 模块内部上下文
 * ```ts
 * const preparer = createTransportRoutePreparer({}, [], '/api/v1')
 * void preparer
 * ```
 */
export function createTransportRoutePreparer(
  procedures: unknown,
  configured: readonly ServTransportRoute[] | undefined,
  apiPrefix: string,
) {
  const registered = registeredRoutes(procedures, apiPrefix)
  const allowed = new Map<string, number>()
  for (const { procedure, maxRequestBytes } of configured ?? []) {
    const { method, path } = procedure['~orpc'].route
    const key = routeKey(method, path, apiPrefix)
    if (registered.get(key)?.procedure !== procedure || allowed.has(key))
      throw new TypeError(`Transport route must refer to a unique mounted transport procedure: ${key}`)
    if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 0)
      throw new TypeError(`Transport route byte limit must be a non-negative integer: ${key}`)
    allowed.set(key, maxRequestBytes)
  }
  if (registered.size === 0)
    return undefined

  function admit(request: Request, transport: HttpContractTransport) {
    const path = new URL(request.url).pathname
    // oRPC 和路由树会剥掉末尾斜线。别名禁止进入，避免按不同路径匹配访问和加密策略。
    const canonicalPath = path.replace(/\/+$/, '')
    const key = `${request.method} ${canonicalPath}`
    const route = registered.get(key)
    if (!route)
      return undefined

    const maxBytes = allowed.get(key)
    const mode = transport.encryption?.(path, request.method)
    if (path !== canonicalPath || maxBytes === undefined || mode === 'required' || (transport.enabled && mode !== 'disabled'))
      return failure(HaiCommonError.REQUEST_ACCESS_DENIED, core.i18n.coreM('core_requestAccessDenied'))
    if (request.headers.has(crypto.transport.protocol.ENCRYPTED_HEADER)
      || request.headers.has(crypto.transport.protocol.ENVELOPE_HEADER)) {
      return failure(HaiCommonError.VALIDATION_ERROR, servM('serv_transportPlaintextRequired'))
    }
    const encoding = request.headers.get('content-encoding')
    if (encoding && encoding.toLowerCase() !== 'identity')
      return failure({ ...HaiCommonError.VALIDATION_ERROR, httpStatus: 415 }, servM('serv_transportInvalidPayload'))

    return { route, maxBytes }
  }

  return {
    preflight(request: Request, transport: HttpContractTransport) {
      const admitted = admit(request, transport)
      return admitted instanceof Response
        ? admitted
        : undefined
    },
    async prepare(request: Request, context: DispatchContext, transport: HttpContractTransport) {
      const admitted = admit(request, transport)
      if (admitted instanceof Response)
        return admitted
      if (!admitted)
        return request

      const checked = checkServGuards(context, admitted.route.guards)
      if (!checked.success)
        return failure(checked.error, checked.error.message, context)

      const bounded = await readBoundedRequest(request, admitted.maxBytes).catch((error: unknown) => {
        if (request.signal.aborted)
          return null
        throw error
      })
      if (bounded === null)
        return failure({ ...HaiCommonError.TIMEOUT, httpStatus: 408 }, core.i18n.coreM('core_errorTimeout'), context)
      if (!bounded)
        return failure({ ...HaiCommonError.VALIDATION_ERROR, httpStatus: 413 }, servM('serv_transportInvalidPayload'), context)
      const state = context[dispatchState]
      if (state)
        state.admittedRoute = admitted.route
      return bounded
    },
  }
}

function failure(definition: HaiError | Omit<HaiError, 'message'>, message: string, context?: ServContext): Response {
  const error = core.error.toPublic({ ...definition, message }, context?.requestId, context?.locale)
  return Response.json({ success: false, error }, {
    status: error.httpStatus,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

async function readBoundedRequest(request: Request, maxBytes: number): Promise<Request | undefined> {
  if (!request.body)
    return request
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    void request.body.cancel().catch(() => {})
    return undefined
  }

  const chunks: Uint8Array[] = []
  const reader = request.body.getReader()
  let size = 0
  let completed = false
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  try {
    request.signal.throwIfAborted()
    request.signal.addEventListener('abort', cancel, { once: true })
    for (;;) {
      request.signal.throwIfAborted()
      const { done, value } = await reader.read()
      request.signal.throwIfAborted()
      if (done) {
        completed = true
        break
      }
      size += value.byteLength
      if (size > maxBytes)
        return undefined
      chunks.push(value)
    }
  }
  finally {
    request.signal.removeEventListener('abort', cancel)
    if (!completed)
      cancel()
    reader.releaseLock()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request, { body: bytes })
}
