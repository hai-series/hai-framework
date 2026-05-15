/**
 * @h-ai/api-client — typed API client 工层
 *
 * 基于 oRPC contract 和 `OpenAPILink` 构建类型安全的 HTTP 客户端。
 * 客户端通过 Proxy 跳转，将属性访问转为 oRPC OpenAPILink 调用，
 * 并将异常 / ORPCError 映射为 HaiResult 返回。
 *
 * 特性：
 * - 自动 401 重试：刷新 Token 后重发原请求（仅一次）
 * - 请求超时：默认 30s，返回 `HaiApiClientError.TIMEOUT`
 * - 并发初始化防护：未初始化时调用任何 procedure 直接返回 `NOT_INITIALIZED`
 * @module create-api-client
 */

import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { TokenManager } from './api-client-token-manager.js'
import type { ApiClient, ApiClientAuth, ApiClientConfig, TokenPair } from './api-client-types.js'
import { err, ok } from '@h-ai/core'
import { createORPCClient, ORPCError } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createLocalStorageTokenStorage } from './api-client-auth.js'
import { apiClientM } from './api-client-i18n.js'
import { createTokenManager } from './api-client-token-manager.js'
import { HaiApiClientError } from './api-client-types.js'

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_CLIENT_NAME = 'hai-api-client'
const DEFAULT_REFRESH_PATH = '/auth/refresh'
const TRAILING_SLASHES_REGEX = /\/+$/

interface ApiClientState<TContract extends AnyContractRouter> {
  config: ApiClientConfig | null
  rawClient: JsonifiedClient<ContractRouterClient<TContract>> | null
  tokenManager?: TokenManager
}

type IndexableTarget = object

/**
 * 根据 oRPC contract 创建 typed API client。
 *
 * 返回的对象同时具备生命周期方法（init/close/config/isInitialized/auth）
 * 和 contract 对应的属性访问器（项目类型由 contract 推导）。
 *
 * @param contract - 应用级 API contract，由 `@h-ai/api-contract` 提供
 * @returns 带生命周期能力的 typed client
 *
 * @example
 * ```ts
 * import { api } from '@h-ai/api-client'
 *
 * await api.init({ baseUrl: 'http://localhost:3000/api/v1' })
 *
 * const result = await api.iam.auth.login({
 *   identifier: 'alice',
 *   password: 'secret',
 * })
 * if (result.success) {
 *   console.log(result.data.tokens.accessToken)
 * }
 *
 * await api.close()
 * ```
 */
export function createApiClient<const TContract extends AnyContractRouter>(contract: TContract): ApiClient<TContract> {
  const state: ApiClientState<TContract> = {
    config: null,
    rawClient: null,
  }

  const auth: ApiClientAuth = {
    async setTokens(tokens: TokenPair) {
      await state.tokenManager?.setTokens(tokens)
    },
    async clear() {
      await state.tokenManager?.clear()
    },
    onTokenRefreshed(callback) {
      return state.tokenManager?.onTokenRefreshed(callback) ?? (() => { })
    },
  }

  const lifecycle: ApiClientLifecycleRuntime = {
    async init(config) {
      try {
        state.config = config
        state.tokenManager = createOptionalTokenManager(config)
        state.rawClient = createRawClient(contract, config, state.tokenManager)
        return ok(undefined)
      }
      catch (error) {
        return err(HaiApiClientError.CONFIG_ERROR, apiClientM('apiClient_configError', { params: { error: String(error) } }), error)
      }
    },
    async close() {
      state.config = null
      state.rawClient = null
      state.tokenManager = undefined
    },
    get config() {
      return state.config
    },
    get isInitialized() {
      return state.rawClient !== null
    },
    auth,
  }

  return createProxyClient(state, lifecycle, []) as ApiClient<TContract>
}

interface ApiClientLifecycleRuntime {
  readonly init: ApiClient<TypedEmptyContract>['init']
  readonly close: ApiClient<TypedEmptyContract>['close']
  readonly config: ApiClientConfig | null
  readonly isInitialized: boolean
  readonly auth: ApiClientAuth
}

type TypedEmptyContract = Record<never, never> & AnyContractRouter

function createOptionalTokenManager(config: ApiClientConfig): TokenManager | undefined {
  if (!config.auth) {
    return undefined
  }

  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  const storage = config.auth.storage ?? createLocalStorageTokenStorage()
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const refreshPath = config.auth.refreshPath ?? DEFAULT_REFRESH_PATH

  const tokenManager = createTokenManager(
    storage,
    `${baseUrl}${refreshPath.startsWith('/') ? refreshPath : `/${refreshPath}`}`,
    fetchFn,
    config.auth.onRefreshFailed,
  )

  if (config.auth.onTokenRefreshed) {
    tokenManager.onTokenRefreshed(config.auth.onTokenRefreshed)
  }

  return tokenManager
}

function createRawClient<TContract extends AnyContractRouter>(
  contract: TContract,
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
): JsonifiedClient<ContractRouterClient<TContract>> {
  const link = new OpenAPILink(contract, {
    url: config.baseUrl,
    headers: async () => createHeaders(config, tokenManager),
    fetch: async (request, init) => fetchWithRefresh(request, init, config, tokenManager),
  })

  return createORPCClient<JsonifiedClient<ContractRouterClient<TContract>>>(link)
}

async function createHeaders(config: ApiClientConfig, tokenManager: TokenManager | undefined): Promise<Record<string, string>> {
  const configuredHeaders = typeof config.headers === 'function' ? await config.headers() : config.headers ?? {}
  const accessToken = await tokenManager?.storage.getAccessToken()

  return {
    ...configuredHeaders,
    'x-request-client': config.clientName ?? DEFAULT_CLIENT_NAME,
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  }
}

async function fetchWithRefresh(
  request: Request,
  init: { redirect?: Request['redirect'] },
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
): Promise<Response> {
  const response = await fetchWithTimeout(request, init, config)
  if (response.status !== 401 || !tokenManager) {
    return response
  }

  const tokens = await tokenManager.refresh()
  if (!tokens) {
    return response
  }

  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${tokens.accessToken}`)
  return fetchWithTimeout(new Request(request, { headers }), init, config)
}

async function fetchWithTimeout(
  request: Request,
  init: { redirect?: Request['redirect'] },
  config: ApiClientConfig,
): Promise<Response> {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  const timeout = config.timeout ?? DEFAULT_TIMEOUT
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetchFn(new Request(request, { signal: controller.signal }), init)
  }
  finally {
    clearTimeout(timeoutId)
  }
}

function createProxyClient<TContract extends AnyContractRouter>(
  state: ApiClientState<TContract>,
  lifecycle: ApiClientLifecycleRuntime,
  path: string[],
): unknown {
  return new Proxy(() => undefined, {
    get(_target, property) {
      if (typeof property !== 'string') {
        return undefined
      }

      if (path.length === 0 && property in lifecycle) {
        return Reflect.get(lifecycle, property)
      }

      return createProxyClient(state, lifecycle, [...path, property])
    },
    apply(_target, _thisArg, args) {
      return callProcedure(state, path, args)
    },
  })
}

async function callProcedure<TContract extends AnyContractRouter>(
  state: ApiClientState<TContract>,
  path: string[],
  args: unknown[],
): Promise<unknown> {
  if (!state.rawClient) {
    return err(HaiApiClientError.NOT_INITIALIZED, apiClientM('apiClient_notInitialized'))
  }

  const target = resolveClientTarget(state.rawClient, path)
  if (typeof target !== 'function') {
    return err(HaiApiClientError.UNKNOWN, apiClientM('apiClient_unknown'))
  }

  try {
    return await target(...args)
  }
  catch (error) {
    return mapClientError(error)
  }
}

function resolveClientTarget(target: unknown, path: string[]): unknown {
  let current = target

  for (const segment of path) {
    if (!isIndexableTarget(current)) {
      return undefined
    }
    current = Reflect.get(current, segment)
  }

  return current
}

function isIndexableTarget(value: unknown): value is IndexableTarget {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function mapClientError(error: unknown) {
  if (error instanceof ORPCError) {
    if (error.status === 401) {
      return err(HaiApiClientError.UNAUTHORIZED, error.message, error)
    }
    if (error.status === 403) {
      return err(HaiApiClientError.FORBIDDEN, error.message, error)
    }
    if (error.status === 404) {
      return err(HaiApiClientError.NOT_FOUND, error.message, error)
    }
    return err(HaiApiClientError.SERVER_ERROR, error.message, error)
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return err(HaiApiClientError.TIMEOUT, apiClientM('apiClient_timeout'), error)
  }

  return err(HaiApiClientError.NETWORK_ERROR, apiClientM('apiClient_networkError'), error)
}
