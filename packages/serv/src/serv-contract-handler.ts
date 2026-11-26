/**
 * 将契约和已挂载业务操作交给 Fetch 宿主。
 * @module serv-contract-handler
 */

import type { HttpContractHandler } from '@h-ai/api-contract'
import type { AnyContractRouter, OpenAPI } from '@orpc/contract'
import type { Router } from '@orpc/server'
import type { ServHttpConfigInput } from './serv-config.js'
import type { ServContext } from './serv-context.js'
import type { ServTransportRoute } from './serv-route-transport.js'
import type { ServValidationFailureBody } from './serv-validation.js'
import { posix } from 'node:path'
import { core, HaiCommonError } from '@h-ai/core'
import { fallbackContractConfig } from '@orpc/contract'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { traverseContractProcedures } from '@orpc/server'
import { buildHaiErrorBody } from './pipelines/serv-pipeline-helper.js'
import { resolveServHttpConfig } from './serv-config.js'
import { servM } from './serv-i18n.js'
import { createDocsPage, generateSpec, getScalarScript, SCALAR_ROUTE } from './serv-openapi.js'
import { createDispatchContext, createTransportRoutePreparer, finishDispatch } from './serv-route-transport.js'
import { localizeZodError, resolveRequestLocale } from './serv-validation.js'

const apiMethods = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])

/**
 * 受同一契约约束的路由操作、传输端点及文档路径。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import { type CreateServContractHandlerOptions, type ServContext, serv } from '@h-ai/serv'
 *
 * const contract = apiContract.create({})
 * const procedures = serv.implement(contract).context<ServContext>().build()
 * const options: CreateServContractHandlerOptions = { contract, procedures }
 * const handler = serv.createContractHandler(options)
 * ```
 */
export interface CreateServContractHandlerOptions {
  readonly contract: AnyContractRouter
  readonly procedures: Router<AnyContractRouter, ServContext>
  /** API 前缀与文档相关选项；路径使用部署后的完整路径。 */
  readonly http?: Pick<ServHttpConfigInput, 'apiPrefix' | 'openapi' | 'docs'>
  /** 需要接收文件或返回事件流的契约端点。 */
  readonly transportRoutes?: readonly ServTransportRoute[]
}

/**
 * 装配可交给 Serv 或 Kit 的契约处理器，保留各宿主的访问和会话逻辑。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import { type ServContext, serv } from '@h-ai/serv'
 * import { kit } from '@h-ai/kit'
 *
 * const contract = apiContract.create({})
 * const procedures = serv.implement(contract).context<ServContext>().build()
 * const handle = kit.createHandle({ contract: serv.createContractHandler({ contract, procedures }) })
 * ```
 */
export function createContractHandler(options: CreateServContractHandlerOptions): HttpContractHandler {
  const { apiPrefix, openapi, docs } = resolveServHttpConfig(options.http)
  const handler = new OpenAPIHandler(options.procedures)
  const preparer = createTransportRoutePreparer(options.procedures, options.transportRoutes, apiPrefix)
  const docsDirectory = docs && docs.path.slice(0, docs.path.lastIndexOf('/') + 1)
  const scriptPath = docsDirectory && `${docsDirectory}${SCALAR_ROUTE.slice(1)}`
  checkDocumentationPaths(options.procedures, apiPrefix, [openapi && openapi.path, docs && docs.path, scriptPath])
  let cachedSpec: Promise<OpenAPI.Document> | undefined
  const getSpec = () => {
    cachedSpec ??= generateSpec(options.contract, { apiPrefix })
    return cachedSpec
  }

  return {
    apiPrefix,
    preflight: (request, transport) => preparer?.preflight(request, transport),
    async fetch(request, createContext, transport) {
      const { pathname } = new URL(request.url)
      if (apiMethods.has(request.method) && pathname.startsWith(`${apiPrefix}/`)) {
        const resolved = await createContext()
        const context = createDispatchContext({
          ...resolved,
          request: preparer
            ? request
            : resolved.request ?? request,
          logger: resolved.logger ?? core.logger.child({ module: 'serv', requestId: resolved.requestId }),
          locale: resolved.locale ?? resolveRequestLocale(request.headers),
        })
        const prepared = await preparer?.prepare(request, context, transport) ?? request
        if (prepared instanceof Response)
          return withoutHeadBody(prepared, request.method)

        let isPrivate = false
        const { matched, response } = await core.context.run({
          requestId: context.requestId,
          userId: context.session?.userId,
          scopeId: context.scopeId,
        }, () => handler.handle(prepared, { prefix: apiPrefix, context })).finally(() => {
          isPrivate = finishDispatch(context)
        })
        if (matched) {
          const result = await localizeValidationResponse(response, context)
          if (isPrivate) {
            result.headers.set('Cache-Control', 'no-store')
            result.headers.set('X-Content-Type-Options', 'nosniff')
            const disposition = result.headers.get('Content-Disposition')
            if (disposition?.startsWith('inline;'))
              result.headers.set('Content-Disposition', `attachment${disposition.slice('inline'.length)}`)
          }
          return withoutHeadBody(result, request.method)
        }
      }

      if (request.method !== 'GET' && request.method !== 'HEAD')
        return undefined
      let response: Response
      if (openapi && pathname === openapi.path) {
        response = Response.json(await getSpec())
      }
      else if (docs && pathname === scriptPath) {
        const content = await getScalarScript()
        response = new Response(content ?? null, content
          ? {
              headers: { 'Content-Type': 'application/javascript; charset=UTF-8', 'Cache-Control': 'public, max-age=86400, immutable' },
            }
          : { status: 404 })
      }
      else if (docs && docsDirectory && pathname === docs.path) {
        if (docs.requireAuth && !(await createContext()).session) {
          response = Response.json(buildHaiErrorBody(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', {
            locale: resolveRequestLocale(request.headers),
          })), { status: 401 })
        }
        else {
          const specUrl = openapi === false
            ? undefined
            : posix.relative(docsDirectory, openapi.path) || '.'
          response = new Response(createDocsPage(await getSpec(), {
            specUrl,
            scriptUrl: SCALAR_ROUTE.slice(1),
          }), {
            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
          })
        }
        if (docs.requireAuth)
          response.headers.set('Cache-Control', 'private, no-store')
      }
      else {
        return undefined
      }
      return withoutHeadBody(response, request.method)
    },
  }
}

function checkDocumentationPaths(
  procedures: CreateServContractHandlerOptions['procedures'],
  apiPrefix: string,
  paths: readonly (string | false)[],
): void {
  const mounted = paths.filter(path => path !== false)
  const unique = new Set(mounted)
  if (unique.size !== mounted.length)
    throw new TypeError('OpenAPI, API documentation and Scalar script must use distinct HTTP paths')

  const underApi = new Set(mounted
    .filter(path => path.startsWith(`${apiPrefix}/`))
    .map(path => path.replace(/\/+$/, '')))
  if (underApi.size === 0)
    return

  traverseContractProcedures({ router: procedures, path: [] }, ({ contract, path }) => {
    const route = contract['~orpc'].route
    const method = fallbackContractConfig('defaultMethod', route.method)
    if (method !== 'GET' && method !== 'HEAD')
      return
    const routePath = route.path ?? `/${path.map(encodeURIComponent).join('/')}`
    const fullPath = `${apiPrefix}${routePath.replace(/\/{2,}/g, '/').replace(/\/$/, '')}`
    if (underApi.has(fullPath))
      throw new TypeError(`HTTP documentation path conflicts with a contract operation: ${method} ${fullPath}`)
  })
}

function withoutHeadBody(response: Response, method: string): Response {
  if (method !== 'HEAD' || !response.body)
    return response
  void response.body.cancel().catch(() => {})
  return new Response(null, response)
}

/**
 * 拦截 oRPC 输入校验失败响应，重写为带 i18n 与 `errors[]` 的标准 HaiResult 失败体。
 *
 * 触发条件（保守判断，避免误伤业务自定义错误）：
 * - status === 400
 * - body 为 oRPC ORPCError JSON 形态：`{ defined, code, status, message, data }`
 * - `code === 'BAD_REQUEST'` 且 `data.issues` 存在
 *
 * 不符合上述条件的响应原样透传，确保业务层主动抛出的 BAD_REQUEST 不被改写。
 */
async function localizeValidationResponse(response: Response, context: ServContext): Promise<Response> {
  if (response.status !== 400)
    return response
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json'))
    return response

  // 克隆响应再读取，避免破坏调用方对 response 的潜在二次消费。
  let payload: unknown
  try {
    payload = await response.clone().json()
  }
  catch {
    return response
  }

  if (!isOrpcValidationErrorPayload(payload))
    return response

  const issues = payload.data.issues
  const { locale, requestId } = context
  const errors = localizeZodError({ issues }, locale)
  const traceId = core.context.get().traceId ?? requestId
  // 与 `validateInputOrFail` 一致，客户端从 `error.cause` 读取字段错误。
  const body: ServValidationFailureBody = {
    success: false,
    error: {
      code: HaiCommonError.VALIDATION_ERROR.code,
      traceId,
      message: core.error.formatMessage({
        message: servM('serv_validationFailed', { locale }),
        traceId,
      }),
      httpStatus: HaiCommonError.VALIDATION_ERROR.httpStatus,
      system: HaiCommonError.VALIDATION_ERROR.system,
      module: HaiCommonError.VALIDATION_ERROR.module,
      cause: errors,
    },
  }

  // 保留原响应头（其中可能包含安全头），仅替换 body 与 status。
  const headers = new Headers(response.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    status: HaiCommonError.VALIDATION_ERROR.httpStatus,
    headers,
  })
}

/**
 * 内部 oRPC 输入校验错误形状；运行时检查后才转为安全的本地化字段错误。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const payload: OrpcValidationErrorPayload = { defined: false, code: 'BAD_REQUEST', status: 400, message: 'Validation failed', data: { issues: [] } }
 * const recognized = isOrpcValidationErrorPayload(payload)
 *```
 */
interface OrpcValidationErrorPayload {
  readonly defined: boolean
  readonly code: string
  readonly status: number
  readonly message: string
  readonly data: { readonly issues: unknown[] }
}

function isOrpcValidationErrorPayload(value: unknown): value is OrpcValidationErrorPayload {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  if (obj.code !== 'BAD_REQUEST')
    return false
  if (typeof obj.status !== 'number' || obj.status !== 400)
    return false
  const data = obj.data
  if (!data || typeof data !== 'object')
    return false
  const issues = (data as Record<string, unknown>).issues
  return Array.isArray(issues)
}
