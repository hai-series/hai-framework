import type { TransportClient } from '@h-ai/crypto'
import type { TokenManager } from './api-client-auth.js'
import type { MutableRequestRecord } from './api-client-procedure.js'
import type { ApiClientConfig } from './api-client-types.js'
import { apiContract, HaiErrorSchema, IamSessionErrorCodeSchema } from '@h-ai/api-contract'
import { ORPCError } from '@orpc/client'
import { apiClientM } from './api-client-i18n.js'

const DEFAULT_TIMEOUT = 30_000
/**
 * 从共享 IAM 契约取得刷新子路径，客户端构造和自动重试共用。
 * @example 模块内部上下文
 * ```ts
 * const fallbackPath = DEFAULT_REFRESH_PATH
 * ```
 */
export const DEFAULT_REFRESH_PATH = apiContract.pathOf(apiContract.iam.auth.refresh)
const AUTH_ENTRY_PATHS = [
  apiContract.pathOf(apiContract.iam.auth.login),
  apiContract.pathOf(apiContract.iam.auth.loginWithOtp),
  apiContract.pathOf(apiContract.iam.auth.loginWithLdap),
  apiContract.pathOf(apiContract.iam.auth.requestPasswordReset),
  apiContract.pathOf(apiContract.iam.auth.confirmPasswordReset),
  apiContract.pathOf(apiContract.iam.auth.register),
]
/**
 * 去除 API 基址末尾的斜线，再拼接服务端子路径。
 * @example 模块内部上下文
 * ```ts
 * const baseUrl = 'https://api.example.com/api/v1/'.replace(TRAILING_SLASHES_REGEX, '')
 * ```
 */
export const TRAILING_SLASHES_REGEX = /\/+$/

/**
 * 将浏览器根路径固定到当前来源，供请求、刷新和握手共用。
 * @example 模块内部上下文
 * ```ts
 * const baseUrl = normalizeBaseUrl('https://api.example.com/api/v1/')
 * ```
 */
export function normalizeBaseUrl(value: string): string | undefined {
  if (typeof value !== 'string' || value.includes('?') || value.includes('#'))
    return undefined
  const relative = value.startsWith('/')
  const origin = relative ? globalThis.location?.origin : undefined
  try {
    const url = new URL(value, origin)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password
      || (relative && (value.startsWith('//') || url.origin !== origin))) {
      return undefined
    }
    return url.href.replace(TRAILING_SLASHES_REGEX, '')
  }
  catch {
    return undefined
  }
}

/**
 * 取消只结束本次等待，凭据刷新等共享任务可继续服务其它调用。
 * @example 模块内部上下文
 * ```ts
 * const controller = new AbortController()
 * const value = await waitForRequest(controller.signal, async () => 1)
 * ```
 */
export async function waitForRequest<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
  if (!signal)
    return operation()
  signal.throwIfAborted()
  let abort = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    const pending = Promise.resolve().then(() => {
      signal.throwIfAborted()
      return operation()
    })
    return await Promise.race([pending, cancelled])
  }
  finally {
    signal.removeEventListener('abort', abort)
  }
}

/**
 * 发送前克隆一次性请求体；HTTP 401 或有效失败包络的 401 才尝试刷新并最多重试一次。
 * 登录/注册/找回密码与 refresh 入口保留原始失败，不递归刷新；重试保留 body 并替换 Bearer 头。
 * @param request - 尚未消费的 Request。
 * @param init - oRPC 提供的重定向选项。
 * @param init.redirect - 可选的 fetch 重定向策略，原样传给首次请求及重试。
 * @param init.keepalive - 页面离开请求保持存活的浏览器提示，原样传递。
 * @param config - 请求与刷新配置。
 * @param authentication - 本请求出发时的凭据代际与刷新开关。
 * @param transport - 刷新与重试共用的可选加密会话。
 * @param observation - 本次逻辑调用的可选摘要。
 * @param retry - 运行期校验与敏感操作的再鉴别回调。
 * @param retry.isActive - 核对原客户端运行期是否仍有效。
 * @param retry.reauthorize - 为同一操作取得新凭据。
 * @returns 最终 HTTP Response；不保证远端非幂等副作用没有发生。
 *
 * @example 模块内部上下文
 * ```ts
 * const config: ApiClientConfig = { baseUrl: 'https://api.example.com/api/v1', fetch: async () => Response.json({ success: true, data: {} }) }
 * const response = await fetchWithRefresh(new Request('https://api.example.com/api/v1/auth/me'), {}, config, undefined, undefined)
 * const status = response.status
 * ```
 */
export async function fetchWithRefresh(
  request: Request,
  init: { redirect?: Request['redirect'], keepalive?: boolean },
  config: ApiClientConfig,
  authentication: { tokenManager: TokenManager, generation: number, autoRefresh: boolean } | undefined,
  transport: TransportClient | undefined,
  observation?: MutableRequestRecord,
  retry: { isActive?: () => boolean, reauthorize?: () => Promise<string | null | undefined> } = {},
): Promise<Response> {
  const tokenManager = authentication?.tokenManager
  const generation = authentication?.generation
  const { reauthorize, isActive = () => true } = retry
  const isCurrent = (expectedGeneration: number | undefined) => isActive() && tokenManager?.generation === expectedGeneration
  request.signal.throwIfAborted()
  if (!isCurrent(generation)) {
    throw new ORPCError('UNAUTHORIZED', {
      message: apiClientM('apiClient_authChanged'),
    })
  }
  // Fetch Request 的 body 是一次性可读流；为了支持 401 后重发 POST/PUT 等带 body 的请求，
  // 必须在首次发送前 `clone()` 一份。即使没有 401，clone 后的副本也只会被 GC 回收，无副作用。
  const retryRequest = authentication?.autoRefresh || reauthorize
    ? request.clone()
    : undefined
  if (observation)
    observation.attempts++
  const response = await fetchWithTimeout(request, init, config, transport)
  request.signal.throwIfAborted()
  if (!retryRequest || !isCurrent(generation))
    return response

  async function retryAuthorized(expectedGeneration: number | undefined, requireAccessToken = false): Promise<Response> {
    request.signal.throwIfAborted()
    if (!retryRequest || !isCurrent(expectedGeneration))
      return response
    const headers = new Headers(retryRequest.headers)
    if (headers.has('x-hai-reauthentication') || reauthorize) {
      if (!reauthorize)
        return response
      const ticket = await waitForRequest(request.signal, async () => isCurrent(expectedGeneration)
        ? reauthorize()
        : null)
      if (ticket === null || !isCurrent(expectedGeneration))
        return response
      headers.delete('x-hai-reauthentication')
      if (ticket)
        headers.set('x-hai-reauthentication', ticket)
    }
    const currentToken = tokenManager && await waitForRequest(request.signal, () => tokenManager.readAccessToken(expectedGeneration))
    request.signal.throwIfAborted()
    if (!isCurrent(expectedGeneration) || (requireAccessToken && !currentToken))
      return response
    if (currentToken)
      headers.set('authorization', `Bearer ${currentToken}`)
    if (observation)
      observation.attempts++
    return fetchWithTimeout(new Request(retryRequest, { headers }), init, config, transport)
  }

  // 登录失败必须保留原始错误；refresh 本身也不能再次触发自动刷新。
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const refreshPath = config.auth?.refreshPath ?? DEFAULT_REFRESH_PATH
  const excludedPaths = [...AUTH_ENTRY_PATHS, refreshPath]
  if (excludedPaths.some(path => new URL(`${baseUrl}${path.startsWith('/')
    ? path
    : `/${path}`}`).pathname === new URL(request.url).pathname)) {
    return response
  }
  const failure: unknown = response.headers.get('content-type')?.includes('application/json')
    ? await response.clone().json().catch(() => undefined)
    : undefined
  const failureError = failure && typeof failure === 'object' && 'error' in failure && failure.error && typeof failure.error === 'object'
    ? failure.error
    : null
  const code = failureError && 'code' in failureError
    ? failureError.code
    : undefined
  const failed = failure && typeof failure === 'object' && 'success' in failure && failure.success === false
  const parsed = failed
    ? HaiErrorSchema.safeParse(failureError)
    : undefined
  const failureStatus = parsed?.success ? parsed.data.httpStatus : undefined
  const unauthorized = response.status === 401
    || (response.status === 200 && typeof code === 'string' && failureStatus === 401)
  request.signal.throwIfAborted()
  if (!unauthorized || !isCurrent(generation))
    return response
  if (code === 'hai:iam:027') {
    return reauthorize && parsed?.success && (failureStatus === undefined || failureStatus === 401)
      ? retryAuthorized(generation)
      : response
  }
  if (!tokenManager || !authentication?.autoRefresh)
    return response
  if (typeof code === 'string' && code.startsWith('hai:iam:') && !IamSessionErrorCodeSchema.safeParse(code).success) {
    return response
  }
  const tokens = await waitForRequest(request.signal, async () => isCurrent(generation)
    ? tokenManager.refresh()
    : null)
  if (!isCurrent(generation))
    return response
  if (tokens?.accessToken)
    return retryAuthorized(generation, true)
  // refresh网络/上游故障会保留凭据，不能误判为会话失效弹窗，更不能重放结果不明的写入。
  const recover = config.auth?.recoverSession
  if (!recover || !tokenManager.sessionInvalid)
    return response
  const recovered = await waitForRequest(request.signal, async () => isCurrent(generation) && tokenManager.sessionInvalid && await recover())
  if (!recovered)
    return response
  const restoredGeneration = authentication.generation + 1
  if (tokenManager.committedGeneration !== restoredGeneration)
    return response
  return retryAuthorized(restoredGeneration, true)
}

/**
 * 把请求超时和调用方 signal 连接到本次 fetch；finally 清除本次超时计时器。
 * @param request - 含调用方取消信号的 Request。
 * @param init - oRPC 重定向设置。
 * @param init.redirect - 可选的 fetch 重定向策略，原样交给本次实际 fetch。
 * @param init.keepalive - 页面离开请求保持存活的浏览器提示，原样传递。
 * @param config - 超时与 fetch 配置。
 * @param transport - 可选加密 fetch，优先于原始 fetch。
 * @returns HTTP 响应；超时/取消异常由外层 procedure 映射，不能视为远端回滚。
 *
 * @example 模块内部上下文
 * ```ts
 * const request = new Request('https://api.example.com/api/v1/auth/me')
 * const response = await fetchWithTimeout(request, {}, { baseUrl: 'https://api.example.com/api/v1', timeout: 1000, fetch: async () => new Response(null, { status: 204 }) }, undefined)
 * const status = response.status
 * ```
 */
async function fetchWithTimeout(
  request: Request,
  init: { redirect?: Request['redirect'], keepalive?: boolean },
  config: ApiClientConfig,
  transport: TransportClient | undefined,
): Promise<Response> {
  // 启用传输加密时，用 encryptedFetch 作为实际 fetch；
  // 它会首次请求前自动完成密钥协商，后续请求复用会话。
  const fetchFn = transport?.encryptedFetch ?? config.fetch ?? globalThis.fetch.bind(globalThis)
  const timeout = config.timeout ?? DEFAULT_TIMEOUT
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const userSignal = request.signal
  const abort = () => controller.abort(userSignal.reason)
  if (userSignal.aborted)
    abort()
  else
    userSignal.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetchFn(new Request(request, { signal: controller.signal }), init)
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
    const json = contentType.endsWith('/json') || contentType.endsWith('+json')
    // JSON 与错误响应正文都纳入同一预算，避免非 JSON 401 在刷新/协议解析时无限等待。
    // 成功的自定义流保持按需消费，原生管道管理调用方取消与监听释放。
    const body = response.body === null
      ? null
      : json || !response.ok
        ? await response.arrayBuffer()
        : response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal: userSignal })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  finally {
    clearTimeout(timeoutId)
    userSignal.removeEventListener('abort', abort)
  }
}
