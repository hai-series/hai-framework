/**
 * @h-ai/api-client — 主实现
 *
 * 包含两部分：
 * - `createApiClient(contract)`：根据 oRPC contract 创建 typed client 工厂。
 * - `api`：默认单例，绑定 iam / storage / ai 三个领域。
 *
 * Client 同时具备生命周期能力（init/close/config/isInitialized/auth）和 contract
 * 推导出的 procedure 嵌套调用能力（如 `client.iam.auth.login(input)`）。
 *
 * 内置能力：
 * - 401 自动 refresh + 单次重试
 * - 并发 refresh 共享 Promise
 * - 请求超时（AbortController）
 * - `ORPCError` → `HaiApiClientError` 标准化映射
 * - 未初始化时调用 procedure 返回 `NOT_INITIALIZED`，不抛异常
 *
 * @example 默认单例
 * ```ts
 * import { api } from '@h-ai/api-client'
 *
 * await api.init({ baseUrl: 'https://api.example.com/api/v1' })
 * const me = await api.iam.auth.currentUser()
 * await api.close()
 * ```
 *
 * @example 自定义 contract
 * ```ts
 * import { createApiClient } from '@h-ai/api-client'
 * import { createApiContract, iamContract } from '@h-ai/api-contract'
 *
 * const client = createApiClient(createApiContract({ iam: iamContract }))
 * await client.init({ baseUrl: 'https://api.example.com/api/v1' })
 * const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
 * ```
 *
 * @module api-client-main
 */

import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { TokenManager } from './api-client-auth.js'
import type {
  ApiClient,
  ApiClientAuth,
  ApiClientConfig,
  ApiClientLifecycle,
} from './api-client-types.js'
import { aiContract, createApiContract, IAM_AUTH_ROUTES, iamContract, storageContract } from '@h-ai/api-contract'
import { err, ok } from '@h-ai/core'
import { createORPCClient, ORPCError } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import {
  createHttpOnlyCookieTokenStorage,
  createTokenManager,
} from './api-client-auth.js'
import { apiClientM } from './api-client-i18n.js'
import { HaiApiClientError } from './api-client-types.js'

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_CLIENT_NAME = 'hai-api-client'
const DEFAULT_REFRESH_PATH = IAM_AUTH_ROUTES.refresh
const TRAILING_SLASHES_REGEX = /\/+$/

// ─── 工厂 ─────────────────────────────────────────────────────────────────────

/**
 * 根据 oRPC contract 创建 typed API client。
 *
 * 返回对象同时具备：
 * - **生命周期能力**：`init` / `close` / `config` / `isInitialized` / `auth`
 * - **contract procedure**：按 contract 嵌套结构调用，例如 `client.iam.auth.login(input)`
 *
 * @example 基础用法
 * ```ts
 * import { createApiClient } from '@h-ai/api-client'
 * import { createApiContract, iamContract } from '@h-ai/api-contract'
 *
 * const client = createApiClient(createApiContract({ iam: iamContract }))
 * await client.init({ baseUrl: 'https://api.example.com/api/v1' })
 *
 * const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
 * if (result.success) {
 *   await client.auth.setTokens(result.data.tokens)
 * }
 *
 * await client.close()
 * ```
 *
 * @example 自定义 fetch / 超时
 * ```ts
 * const client = createApiClient(contract)
 * await client.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   fetch: customFetch,
 *   timeout: 10_000,
 * })
 * ```
 */
export function createApiClient<const TContract extends AnyContractRouter>(
  contract: TContract,
): ApiClient<TContract> {
  // 客户端运行时状态
  const state: {
    config: ApiClientConfig | null
    rawClient: JsonifiedClient<ContractRouterClient<TContract>> | null
    tokenManager: TokenManager | undefined
  } = {
    config: null,
    rawClient: null,
    tokenManager: undefined,
  }

  const auth: ApiClientAuth = {
    async setTokens(tokens) { await state.tokenManager?.setTokens(tokens) },
    async clear() { await state.tokenManager?.clear() },
    onTokenRefreshed(callback) {
      return state.tokenManager?.onTokenRefreshed(callback) ?? (() => {})
    },
  }

  const lifecycle: ApiClientLifecycle = {
    async init(config) {
      try {
        state.config = config
        state.tokenManager = buildTokenManager(config)
        state.rawClient = buildRawClient(contract, config, state.tokenManager)
        return ok(undefined)
      }
      catch (error) {
        return err(
          HaiApiClientError.CONFIG_ERROR,
          apiClientM('apiClient_configError', { params: { error: String(error) } }),
          error,
        )
      }
    },
    async close() {
      state.config = null
      state.rawClient = null
      state.tokenManager = undefined
    },
    get config() { return state.config },
    get isInitialized() { return state.rawClient !== null },
    auth,
  }

  /**
   * 顶层 Proxy：把“一个对象同时扮演两种角色”的需求揉到一起。
   *
   * 这个 client 既要像一个普通服务对象，暴露生命周期方法：
   * - `client.init()`
   * - `client.close()`
   * - `client.config`
   * - `client.isInitialized`
   * - `client.auth`
   *
   * 又要像一个按 contract 动态展开的 oRPC client，支持：
   * - `client.iam.auth.login(input)`
   * - `client.storage.object.put(input)`
   * - `client.ai.chat.send(input)`
   *
   * 由于第二类 API 的层级结构是“运行时按属性链逐步访问”的，无法靠写死对象字面量覆盖所有路径，
   * 所以这里使用 Proxy：
   * - 先拦截顶层属性访问；
   * - 如果访问的是生命周期字段，就直接返回 lifecycle 中的真实成员；
   * - 否则把这个属性当成 contract 路径的第一段，继续交给 `createProcedureProxy()` 处理。
   *
   * 换句话说：
   * - `client.init`      → 返回 lifecycle.init
   * - `client.auth`      → 返回 lifecycle.auth
   * - `client.iam`       → 返回一个新的嵌套 Proxy，继续等待 `.auth.login(...)`
   *
   * 注意：如果将来 contract 顶层字段和 lifecycle 字段重名，这里会“优先返回 lifecycle”。
   */
  return new Proxy({}, {
    get(_target, property) {
      // Proxy 的属性键不一定是 string，也可能是 Symbol（例如某些运行时内部探测）。
      // 本 client 只处理字符串路径；非字符串键直接忽略，避免把 Symbol 误当成 API 路径的一部分。
      if (typeof property !== 'string')
        return undefined

      // 顶层字段命中 lifecycle 时，直接返回真实成员。
      // 例如：
      // - property === 'init'  → 返回 init 函数
      // - property === 'auth'  → 返回 auth 对象
      // 这样 `client.init()` / `client.auth.clear()` 就能像普通对象一样工作。
      if (property in lifecycle) {
        return Reflect.get(lifecycle, property)
      }

      // 走到这里，说明它不是生命周期字段，那就把它当成 contract 路径的第一段。
      // 例如访问 `client.iam` 时，这里会创建一个 path = ['iam'] 的嵌套 Proxy。
      // 后续如果继续访问 `.auth.login`，path 会逐步变成：
      // ['iam', 'auth'] → ['iam', 'auth', 'login']
      // 最终在函数调用时再映射到真正的 rawClient.iam.auth.login(...args)。
      return createProcedureProxy(state, [property])
    },
  // 这里的返回值在运行时是一个 Proxy，但从“可用能力”上看，它符合 `ApiClient<TContract>`：
  // - 一部分成员来自 lifecycle
  // - 另一部分成员来自 contract 推导出的 procedure 层级
  // 因此使用类型断言把这个动态对象声明为最终对外的 typed client。
  }) as ApiClient<TContract>
}

// ─── 默认单例 ─────────────────────────────────────────────────────────────────

/**
 * 默认 API typed client：绑定 `iam` / `storage` / `ai` 三个领域。
 *
 * 大多数应用只需 `import { api }` 并调用 `api.init()` 即可。
 *
 * @example
 * ```ts
 * import { api } from '@h-ai/api-client'
 *
 * await api.init({
 *   baseUrl: 'http://localhost:3000/api/v1',
 *   auth: { refreshPath: '/auth/refresh' },
 * })
 * const result = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
 * await api.close()
 * ```
 */
export const api = createApiClient(
  createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract }),
)

// ─── 内部：procedure 代理 ─────────────────────────────────────────────────────

/**
 * 构造嵌套 procedure 代理。
 *
 * oRPC client 接口是任意层嵌套的属性 + 末端调用（如 `client.iam.auth.login(input)`）。
 * 这里用统一的 Proxy 透传所有路径，叶子节点（被 apply 时）映射到
 * `state.rawClient[a][b][c](input)` 并把错误标准化为 `HaiResult`。
 */
function createProcedureProxy<TContract extends AnyContractRouter>(
  state: { rawClient: JsonifiedClient<ContractRouterClient<TContract>> | null },
  path: string[],
): unknown {
  return new Proxy(() => undefined, {
    get(_t, property) {
      if (typeof property !== 'string')
        return undefined
      return createProcedureProxy(state, [...path, property])
    },
    apply(_t, _thisArg, args) {
      return callProcedure(state.rawClient, path, args)
    },
  })
}

async function callProcedure(
  rawClient: unknown,
  path: string[],
  args: unknown[],
): Promise<unknown> {
  if (!rawClient) {
    return err(HaiApiClientError.NOT_INITIALIZED, apiClientM('apiClient_notInitialized'))
  }

  // 沿 path 解析 rawClient[a][b][c]...
  let target: unknown = rawClient
  for (const segment of path) {
    if ((typeof target !== 'object' || target === null) && typeof target !== 'function') {
      return err(HaiApiClientError.UNKNOWN, apiClientM('apiClient_unknown'))
    }
    target = Reflect.get(target as object, segment)
  }
  if (typeof target !== 'function') {
    return err(HaiApiClientError.UNKNOWN, apiClientM('apiClient_unknown'))
  }

  try {
    return await (target as (...a: unknown[]) => Promise<unknown>)(...args)
  }
  catch (error) {
    return mapClientError(error)
  }
}

// ─── 内部：构建 raw client 与 token manager ──────────────────────────────────

/** 根据 `auth` 配置决定是否创建 TokenManager。 */
function buildTokenManager(config: ApiClientConfig): TokenManager | undefined {
  if (!config.auth)
    return undefined

  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  // 默认使用 httpOnly cookie 存储（推荐方案：refresh token 由服务端管理，防 XSS）。
  // SSR / Node.js 测试场景请显式传入 `createMemoryTokenStorage()`。
  // 浏览器 localStorage 场景请显式传入 `createLocalStorageTokenStorage()`（有 XSS 风险）。
  const storage = config.auth.storage ?? createHttpOnlyCookieTokenStorage()
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const refreshPath = config.auth.refreshPath ?? DEFAULT_REFRESH_PATH
  const refreshUrl = `${baseUrl}${refreshPath.startsWith('/') ? refreshPath : `/${refreshPath}`}`

  const manager = createTokenManager(storage, refreshUrl, fetchFn, config.auth.onRefreshFailed)
  if (config.auth.onTokenRefreshed) {
    manager.onTokenRefreshed(config.auth.onTokenRefreshed)
  }
  return manager
}

/** 构造 oRPC OpenAPILink + raw client。 */
function buildRawClient<TContract extends AnyContractRouter>(
  contract: TContract,
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
): JsonifiedClient<ContractRouterClient<TContract>> {
  const link = new OpenAPILink(contract, {
    url: config.baseUrl,
    headers: async () => buildHeaders(config, tokenManager),
    fetch: async (request, init) => fetchWithRefresh(request, init, config, tokenManager),
  })
  return createORPCClient<JsonifiedClient<ContractRouterClient<TContract>>>(link)
}

/** 组装请求头：用户配置 + 客户端标识 + Bearer Token。 */
async function buildHeaders(
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
): Promise<Record<string, string>> {
  const configured = typeof config.headers === 'function' ? await config.headers() : config.headers ?? {}
  const accessToken = await tokenManager?.storage.getAccessToken()
  return {
    ...configured,
    'x-request-client': config.clientName ?? DEFAULT_CLIENT_NAME,
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  }
}

/** 401 自动 refresh 并重试一次。 */
async function fetchWithRefresh(
  request: Request,
  init: { redirect?: Request['redirect'] },
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
): Promise<Response> {
  const response = await fetchWithTimeout(request, init, config)
  if (response.status !== 401 || !tokenManager)
    return response

  const tokens = await tokenManager.refresh()
  if (!tokens)
    return response

  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${tokens.accessToken}`)
  return fetchWithTimeout(new Request(request, { headers }), init, config)
}

/** fetch + AbortController 超时控制（联动调用方原始 signal）。 */
async function fetchWithTimeout(
  request: Request,
  init: { redirect?: Request['redirect'] },
  config: ApiClientConfig,
): Promise<Response> {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  const timeout = config.timeout ?? DEFAULT_TIMEOUT
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  // 保留调用方原始 signal 的中断能力：上游主动 abort 也能控制超时 controller。
  const userSignal = request.signal
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort()
    }
    else {
      userSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }
  try {
    return await fetchFn(new Request(request, { signal: controller.signal }), init)
  }
  finally {
    clearTimeout(timeoutId)
  }
}

/** ORPCError / AbortError / 其他异常 → 标准化 HaiResult 错误。 */
function mapClientError(error: unknown) {
  if (error instanceof ORPCError) {
    if (error.status === 401)
      return err(HaiApiClientError.UNAUTHORIZED, error.message, error)
    if (error.status === 403)
      return err(HaiApiClientError.FORBIDDEN, error.message, error)
    if (error.status === 404)
      return err(HaiApiClientError.NOT_FOUND, error.message, error)
    return err(HaiApiClientError.SERVER_ERROR, error.message, error)
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return err(HaiApiClientError.TIMEOUT, apiClientM('apiClient_timeout'), error)
  }
  return err(HaiApiClientError.NETWORK_ERROR, apiClientM('apiClient_networkError'), error)
}
