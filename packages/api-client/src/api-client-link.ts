import type { TransportClient } from '@h-ai/crypto'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { TokenManager } from './api-client-auth.js'
import type { ApiClientConfig } from './api-client-types.js'
import { core } from '@h-ai/core'
import { createORPCClient, ORPCError } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createHttpOnlyCookieTokenStorage, createTokenManager } from './api-client-auth.js'
import { apiClientM } from './api-client-i18n.js'
import { getObservation } from './api-client-procedure.js'
import { DEFAULT_REFRESH_PATH, fetchWithRefresh, TRAILING_SLASHES_REGEX, waitForRequest } from './api-client-request.js'

const DEFAULT_CLIENT_NAME = 'hai-api-client'
const REQUEST_AUTH_GENERATION = Symbol('hai.api-client.auth-generation')

/**
 * 仅 auth 存在时创建 TokenManager；刷新沿用自定义头、客户端标识与同一加密 fetch。
 * @param config - 已选定的客户端配置。
 * @param transport - 可选已创建的加密会话。
 * @returns 本实例管理器；没有 auth 时为 undefined，不自行启用认证。
 *
 * @example 模块内部上下文
 * ```ts
 * const manager = buildTokenManager({ baseUrl: 'https://api.example.com/api/v1', auth: {}, headers: { 'x-app-channel': 'web' } }, undefined)
 * await manager?.clear()
 * ```
 */
export function buildTokenManager(config: ApiClientConfig, transport: TransportClient | undefined): TokenManager | undefined {
  if (!config.auth)
    return undefined

  const fetchFn = transport?.encryptedFetch ?? config.fetch ?? globalThis.fetch.bind(globalThis)
  // 默认使用 httpOnly cookie 存储（推荐方案：refresh token 由服务端管理，防 XSS）。
  // SSR / Node.js 测试场景请显式传入 `apiClient.tokenStorage.memory()`。
  // 原生客户端显式传入平台安全存储，浏览器不持久化 Token 到 Web Storage。
  const storage = config.auth.storage ?? createHttpOnlyCookieTokenStorage()
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const refreshPath = config.auth.refreshPath ?? DEFAULT_REFRESH_PATH
  const refreshUrl = `${baseUrl}${refreshPath.startsWith('/')
    ? refreshPath
    : `/${refreshPath}`}`

  // 刷新沿用客户端标识与自定义头（包括原生 body 通道标识），并复用同一加密 fetch。
  const refreshFetch: typeof fetch = async (input, init) => {
    const configured = typeof config.headers === 'function'
      ? await config.headers()
      : config.headers ?? {}
    const headers = new Headers(configured)
    if (!headers.has('accept-language'))
      headers.set('accept-language', core.i18n.getGlobalLocale())
    headers.set('x-request-client', config.clientName ?? DEFAULT_CLIENT_NAME)
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
    return fetchFn(input, { ...init, headers })
  }
  const manager = createTokenManager(storage, refreshUrl, refreshFetch, config.auth.recoverSession ? undefined : config.auth.onRefreshFailed, config.auth.refreshTimeoutMs)
  if (config.auth.onTokenRefreshed) {
    manager.onTokenRefreshed(config.auth.onTokenRefreshed)
  }
  return manager
}

/**
 * 根据显式 transport 配置创建会话；首次 encryptedFetch 才进行实际密钥协商。
 * @param config - 客户端配置及已初始化 crypto。
 * @returns 新会话或 undefined；调用方在失败/close 时 destroy。
 *
 * @example 模块内部上下文
 * ```ts
 * const session = buildTransportSession({ baseUrl: 'https://api.example.com/api/v1' })
 * // 未配置 transport 时不产生会话；正常明文请求仍由实际 fetch 发送。
 * session?.destroy()
 * ```
 */
export function buildTransportSession(config: ApiClientConfig): TransportClient | undefined {
  if (!config.transport)
    return undefined
  const baseFetch = config.fetch ?? globalThis.fetch.bind(globalThis)
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const path = config.transport.keyExchangePath ?? '/_hai/key-exchange'
  const keyExchangeUrl = `${baseUrl}${path.startsWith('/')
    ? path
    : `/${path}`}`
  return config.transport.crypto.transport.createClient({ keyExchangeUrl, fetch: baseFetch, maxPlaintextBytes: config.transport.maxPlaintextBytes })
}

/**
 * 以同一 contract 构造 OpenAPILink 与 JSON typed client，统一头组装、超时和认证重试。
 * @param contract - 实际 procedure 契约。
 * @param config - 目标地址与平台 fetch。
 * @param tokenManager - 可选 Token 管理器。
 * @param transport - 可选加密会话。
 * @param isActive - 本运行期是否仍接受发送或重试。
 * @param responseSignal - 客户端关闭时结束已建立的流式响应。
 * @returns oRPC JSON client；模块外层代理将调用异常映射为失败 HaiResult。
 *
 * @example 模块内部上下文
 * ```ts
 * function assemble(contract: AnyContractRouter) {
 *   // 构造不发送请求；业务调用通过外层 ApiClient 代理。
 *   return buildRawClient(contract, { baseUrl: 'https://api.example.com/api/v1' }, undefined, undefined)
 * }
 * ```
 */
export function buildRawClient<TContract extends AnyContractRouter>(
  contract: TContract,
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
  transport: TransportClient | undefined,
  isActive: () => boolean = () => true,
  responseSignal?: AbortSignal,
): JsonifiedClient<ContractRouterClient<TContract>> {
  const link = new OpenAPILink<Record<PropertyKey, unknown>>(contract, {
    url: config.baseUrl,
    interceptors: [
      ({ next, ...options }) => next({
        ...options,
        context: { ...options.context, [REQUEST_AUTH_GENERATION]: tokenManager?.generation },
      }),
    ],
    headers: async (options) => {
      const headers = await buildHeaders(config, tokenManager, options.context, options.signal)
      // 单次操作凭据只附加到本次调用，不能放进跨并发请求共享的默认 header。
      if (typeof options.context.reauthentication === 'string')
        headers['x-hai-reauthentication'] = options.context.reauthentication
      return headers
    },
    fetch: async (request, init, options) => {
      const record = getObservation(options.context)
      if (record) {
        record.method = request.method
        const url = new URL(request.url)
        url.search = ''
        url.hash = ''
        record.url = core.sanitize.sanitizeUrl(url.toString())
      }
      const requestInit = options.context.keepalive === true
        ? { ...init, keepalive: true }
        : init
      const confirm = options.context.reauthorize
      const reauthorize = typeof confirm === 'function'
        ? async () => {
          const value: unknown = await confirm()
          return typeof value === 'string' || value === undefined
            ? value
            : null
        }
        : undefined
      const authenticatedRequest = tokenManager?.usesCookieCredentials
        ? new Request(request, { credentials: 'include' })
        : request
      const generation = options.context[REQUEST_AUTH_GENERATION]
      const authentication = tokenManager && typeof generation === 'number'
        ? { tokenManager, generation, autoRefresh: options.context.autoRefresh !== false }
        : undefined
      const response = await fetchWithRefresh(authenticatedRequest, requestInit, config, authentication, transport, record, { isActive, reauthorize, responseSignal })
      if (record) {
        record.status = response.status
        const traceId = response.headers.get('x-trace-id') ?? response.headers.get('x-request-id')
        if (traceId && /^[\w.:-]{1,128}$/.test(traceId))
          record.requestId = traceId
      }
      return response
    },
  })
  return createORPCClient<JsonifiedClient<ContractRouterClient<TContract>>>(link)
}

/**
 * 合并静态/动态配置头与客户端标识，读取可用 access token 后设置 Bearer 头。
 * @param config - 用户请求头与客户端标识。
 * @param tokenManager - 可选管理器；读取安全存储失败向上游传播。
 * @param context - 本次调用的内部凭据代际与关联信息。
 * @param signal - 取消头部准备时的异步等待。
 * @returns 单次请求的头快照，不改变调用方配置对象。
 *
 * @example 模块内部上下文
 * ```ts
 * const headers = await buildHeaders({ baseUrl: 'https://api.example.com/api/v1', clientName: 'orders-web', headers: () => ({ 'x-app-channel': 'web' }) }, undefined)
 * const channel = headers['x-app-channel']
 * ```
 */
async function buildHeaders(
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
  context: Record<PropertyKey, unknown> = {},
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const configuredHeaders = config.headers
  const configured = typeof configuredHeaders === 'function'
    ? await waitForRequest(signal, async () => configuredHeaders())
    : configuredHeaders ?? {}
  const headers = new Headers(configured)
  headers.set('x-hai-terminal', config.auth?.terminalType ?? 'web')
  if (!headers.has('accept-language'))
    headers.set('accept-language', core.i18n.getGlobalLocale())
  const capturedGeneration = context[REQUEST_AUTH_GENERATION]
  const generation = typeof capturedGeneration === 'number'
    ? capturedGeneration
    : undefined
  const accessToken = tokenManager && await waitForRequest(signal, () => tokenManager.readAccessToken(generation))
  if (tokenManager && (accessToken === undefined || tokenManager.generation !== generation)) {
    throw new ORPCError('UNAUTHORIZED', {
      message: apiClientM('apiClient_authChanged'),
    })
  }
  return {
    ...Object.fromEntries(headers),
    'x-request-client': config.clientName ?? DEFAULT_CLIENT_NAME,
    'x-request-id': getObservation(context)?.requestId ?? core.context.get().requestId ?? core.id.uuid(),
    ...(accessToken
      ? { authorization: `Bearer ${accessToken}` }
      : {}),
  }
}
