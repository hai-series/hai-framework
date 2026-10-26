/**
 * @h-ai/api-client — 主实现
 *
 * 包含两部分：
 * - `createApiClient(contract)`：根据 oRPC contract 创建 typed client 工厂（内部实现）。
 * - `apiClient`：统一公开入口；自身就是默认单例，同时挂载 `create` / `tokenStorage`。
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
 * import { apiClient } from '@h-ai/api-client'
 *
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const me = await apiClient.iam.auth.currentUser()
 *   if (!me.success) throw new Error(me.error.message)
 *   const userId = me.data.id
 * }
 * finally { await apiClient.close() }
 * ```
 *
 * @example 自定义 contract
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const client = apiClient.create(apiContract.create({ iam: apiContract.iam }))
 * const initialized = await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await client.iam.auth.publicConfig()
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * finally { await client.close() }
 * ```
 *
 * @module api-client-main
 */

import type { HaiResult } from '@h-ai/core'
import type { TransportClient } from '@h-ai/crypto'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { TokenManager } from './api-client-auth.js'
import type {
  ApiClient,
  ApiClientAuth,
  ApiClientConfig,
  ApiClientLifecycle,
  ApiRequestObserver,
  ApiRequestRecord,
} from './api-client-types.js'
import { apiContract } from '@h-ai/api-contract'
import { core, err, ok } from '@h-ai/core'
import { TransportBodyTooLargeError, TransportTimeError } from '@h-ai/crypto'
import { createORPCClient, ORPCError } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import {
  createHttpOnlyCookieTokenStorage,
  createMemoryTokenStorage,
  createTokenManager,
} from './api-client-auth.js'
import { apiClientM } from './api-client-i18n.js'
import { clearIamPageExitBindings, createIamAuthActions } from './api-client-iam.js'
import { HaiApiClientError } from './api-client-types.js'

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_CLIENT_NAME = 'hai-api-client'
const DEFAULT_REFRESH_PATH = apiContract.pathOf(apiContract.iam.auth.refresh)
const AUTH_ENTRY_PATHS = [
  apiContract.pathOf(apiContract.iam.auth.login),
  apiContract.pathOf(apiContract.iam.auth.loginWithOtp),
  apiContract.pathOf(apiContract.iam.auth.loginWithLdap),
  apiContract.pathOf(apiContract.iam.auth.requestPasswordReset),
  apiContract.pathOf(apiContract.iam.auth.confirmPasswordReset),
  apiContract.pathOf(apiContract.iam.auth.register),
]
const TRAILING_SLASHES_REGEX = /\/+$/
const REQUEST_OBSERVATION = Symbol('hai.api-client.request-observation')
/**
 * 内部构造的可变摘要，不对消费者暴露写入能力。
 * @example 模块内部上下文
 * ```ts
 * function update(record: MutableRequestRecord) { record.attempts += 1 }
 * ```
 */
type MutableRequestRecord = { -readonly [Key in keyof ApiRequestRecord]: ApiRequestRecord[Key] }

/** Token 存储方案集合：内存 / httpOnly Cookie。 */
const tokenStorage = {
  /** 内存存储——SSR / Node 测试或一次性会话使用。 */
  memory: createMemoryTokenStorage,
  /** httpOnly Cookie 存储——浏览器场景推荐方案。 */
  httpOnlyCookie: createHttpOnlyCookieTokenStorage,
} as const

// ─── 工厂 ─────────────────────────────────────────────────────────────────────

/**
 * 按真实 oRPC 契约创建独立 typed client；公开调用入口为 apiClient.create(contract)。
 * init 返回 HaiResult，成功后才调用 procedure；已初始化实例必须先 close 再换配置。
 * procedure 将传输异常转换为 HaiResult；auth.setTokens/clear 的安全存储失败仍会拒绝 Promise。
 * SSR 应为每个请求创建客户端和内存存储；不共享默认单例中的用户凭据。
 * @param contract - 已定义的嵌套 oRPC contract；顶层命名不能与生命周期成员冲突。
 * @returns 生命周期、认证辅助操作与契约推导出的 procedure 代理。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * import { apiContract } from '@h-ai/api-contract'
 * const client = apiClient.create(apiContract.create({ iam: apiContract.iam }))
 * const initialized = await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: { storage: apiClient.tokenStorage.memory() }, timeout: 10000 })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await client.iam.auth.currentUser()
 *   if (!result.success) throw new Error(result.error.message)
 *   const userId = result.data.id
 * }
 * finally { await client.close() }
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
    transport: TransportClient | undefined
    observers: Set<ApiRequestObserver>
  } = {
    config: null,
    rawClient: null,
    tokenManager: undefined,
    transport: undefined,
    observers: new Set(),
  }

  const auth: ApiClientAuth = {
    async setTokens(tokens) { await state.tokenManager?.setTokens(tokens) },
    async clear() { await state.tokenManager?.clear() },
    onTokenRefreshed(callback) {
      return state.tokenManager?.onTokenRefreshed(callback) ?? (() => {})
    },
  }

  let initPromise: Promise<HaiResult<void>> | null = null
  const lifecycle: ApiClientLifecycle = {
    async init(config) {
      // 并发重入防护：同时多次 init() 只执行一次。
      // 另一个调用方 await 同一个 in-flight Promise，避免重复创建 raw client / token manager。
      if (initPromise)
        return initPromise
      // 已初始化后必须先 close() 再重新 init，避免旧 transport 会话被新状态覆盖后无法 destroy。
      if (state.rawClient) {
        return err(
          HaiApiClientError.CONFIG_ERROR,
          apiClientM('apiClient_alreadyInitialized'),
        )
      }
      initPromise = (async (): Promise<HaiResult<void>> => {
        let nextTransport: TransportClient | undefined
        try {
          nextTransport = buildTransportSession(config)
          const nextTokenManager = buildTokenManager(config, nextTransport)
          const nextRawClient = buildRawClient(contract, config, nextTokenManager, nextTransport)

          // 所有可能失败的构建步骤完成后再提交状态，避免调用方看到半初始化 client。
          state.config = config
          state.transport = nextTransport
          state.tokenManager = nextTokenManager
          state.rawClient = nextRawClient
          return ok(undefined)
        }
        catch (error) {
          // 构建过程中如果 transport 已创建但后续失败，必须主动释放，避免会话/定时器泄漏。
          nextTransport?.destroy()
          state.config = null
          state.rawClient = null
          state.tokenManager = undefined
          state.transport = undefined
          return err(
            HaiApiClientError.CONFIG_ERROR,
            apiClientM('apiClient_configError', { params: { error: String(error) } }),
            error,
          )
        }
      })()
      try {
        return await initPromise
      }
      finally {
        initPromise = null
      }
    },
    async close() {
      clearIamPageExitBindings(auth)
      state.observers.clear()
      state.transport?.destroy()
      state.config = null
      state.rawClient = null
      state.tokenManager = undefined
      state.transport = undefined
    },
    get config() { return state.config ? core.sanitize.sanitizeSensitiveFields(state.config) : null },
    get isInitialized() { return state.rawClient !== null },
    auth,
    observeRequests(observer) {
      state.observers.add(observer)
      return () => {
        state.observers.delete(observer)
      }
    },
  }

  // 生命周期成员优先，其余属性只记录真实契约路径，末端调用才交给 rawClient。
  // 契约顶层不能与 init/close/config/isInitialized/auth 重名；此处不提供额外路由注册。
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
 * 大多数应用只需 `import { apiClient }` 并调用 `apiClient.init()` 即可。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 *
 * const initialized = await apiClient.init({
 *   baseUrl: 'http://localhost:3000/api/v1',
 *   auth: { refreshPath: '/auth/refresh' },
 * })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.currentUser()
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * finally { await apiClient.close() }
 * ```
 */
const defaultApiContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

/**
 * 默认 iam/storage/ai typed client 与 create、tokenStorage、createAuthActions 命名空间的交叉类型。
 * 具体项目契约使用 apiClient.create 的返回类型，不给默认单例附加未知 procedure。
 *
 * @example
 * ```ts
 * import { apiClient, type DefaultApiClient } from '@h-ai/api-client'
 * const client: DefaultApiClient = apiClient
 * const initialized = await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try { const actions = client.createAuthActions(client); const result = await actions.publicConfig(); if (!result.success) throw new Error(result.error.message) }
 * finally { await client.close() }
 * ```
 */
export type DefaultApiClient = ApiClient<typeof defaultApiContract> & {
  readonly create: typeof createApiClient
  readonly tokenStorage: typeof tokenStorage
  readonly createAuthActions: typeof createIamAuthActions
}

/**
 * API Client 公开入口：默认 iam/storage/ai 单例，以及独立实例、安全存储和认证动作工厂。
 * 未启用 auth 时不注入或刷新 Token；浏览器 auth: {} 使用 httpOnly Cookie 方案。
 * close 释放客户端运行状态/加密会话，不能替代服务端退出或 auth.clear。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.currentUser()
 *   if (!result.success) throw new Error(result.error.message)
 *   const permissions = result.data.permissions
 * }
 * finally { await apiClient.close() }
 * ```
 */
export const apiClient = new Proxy(createApiClient(defaultApiContract) as ApiClient<typeof defaultApiContract>, {
  get(target, property, receiver) {
    if (property === 'create')
      return createApiClient
    if (property === 'tokenStorage')
      return tokenStorage
    if (property === 'createAuthActions')
      return createIamAuthActions
    return Reflect.get(target as object, property, receiver)
  },
}) as DefaultApiClient

// ─── 内部：procedure 代理 ─────────────────────────────────────────────────────

/**
 * 构造只记录属性路径的内部代理，末端调用交给 callProcedure；不在访问属性时发送请求。
 * @param state - 当前 rawClient，可在 close 后变为 null。
 * @param state.rawClient - 当前 oRPC 客户端；未初始化或关闭后为 null。
 * @param state.observers - 本实例逻辑请求订阅集合。
 * @param path - 已访问的 contract 属性路径。
 * @returns 动态代理；由契约公开类型约束调用路径，不对外承诺任意字符串 API。
 *
 * @example 模块内部上下文
 * ```ts
 * const proxy = createProcedureProxy({ rawClient: null }, ['iam'])
 * // 直到 apply 才调用 callProcedure；未初始化返回失败 HaiResult。
 * ```
 */
function createProcedureProxy<TContract extends AnyContractRouter>(
  state: { rawClient: JsonifiedClient<ContractRouterClient<TContract>> | null, observers?: Set<ApiRequestObserver> },
  path: string[],
): unknown {
  return new Proxy(() => undefined, {
    get(_t, property) {
      if (typeof property !== 'string')
        return undefined
      return createProcedureProxy(state, [...path, property])
    },
    apply(_t, _thisArg, args) {
      return callObservedProcedure(state.rawClient, path, args, state.observers)
    },
  })
}

/** 不复制业务入参；通过 oRPC 每次调用的 context 将同一关联传给传输层。 */
async function callObservedProcedure(rawClient: unknown, path: string[], args: unknown[], observers?: ReadonlySet<ApiRequestObserver>): Promise<unknown> {
  const record: MutableRequestRecord = { requestId: core.context.get().requestId ?? core.id.uuid(), procedure: path.join('.'), timestamp: Date.now(), duration: 0, success: false, attempts: 0 }
  const provided = args[1] && typeof args[1] === 'object' ? args[1] as Record<string, unknown> : {}
  const providedContext = provided.context && typeof provided.context === 'object' ? provided.context : {}
  const options = { ...provided, context: { ...providedContext, [REQUEST_OBSERVATION]: record } }
  let result = await callProcedure(rawClient, path, [args[0], options])
  record.duration = Math.max(0, Date.now() - record.timestamp)
  record.success = !(result && typeof result === 'object' && 'success' in result && result.success === false)
  if (result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error) {
    record.errorCode = String(result.error.code)
    if ('message' in result.error && typeof result.error.message === 'string') {
      const error = result.error as Parameters<typeof core.error.toPublic>[0]
      const receivedId = error.traceId && /^[\w.:-]{1,128}$/.test(error.traceId) ? error.traceId : record.requestId
      record.requestId = receivedId
      const safe = core.error.toPublic({ ...error, publicExt: error.ext }, receivedId)
      if (error.cause && typeof error.cause === 'object' && !Array.isArray(error.cause)) {
        const metadata: Record<string, unknown> = {}
        for (const key of ['orpcCode', 'status', 'transportCode', 'direction', 'stage', 'limitBytes', 'actualBytes']) {
          const value: unknown = Reflect.get(error.cause, key)
          if (typeof value === 'number' || typeof value === 'string')
            metadata[key] = core.sanitize.sanitizeSensitiveValue(value, key)
        }
        if (Object.keys(metadata).length)
          safe.cause = metadata
      }
      core.logger.error('API request failed', { traceId: safe.traceId, requestId: record.requestId, procedure: record.procedure, status: record.status, error: result.error })
      result = { ...result, error: safe }
    }
  }
  for (const observer of observers ?? []) {
    try {
      const observed: unknown = observer(Object.freeze({ ...record }))
      if (observed instanceof Promise)
        void observed.catch(() => {})
    }
    catch { /* 观察失败不改变请求结果。 */ }
  }
  return result
}

/**
 * 解析真实 rawClient 中的 procedure 并调用，将调用异常映射为标准 HaiResult 失败。
 * @param rawClient - 已构建的 oRPC client；缺省时返回 NOT_INITIALIZED。
 * @param path - 契约层级路径。
 * @param args - 原始 procedure 参数。
 * @returns 原契约结果或客户端失败，不把失败改成成功。
 *
 * @example 模块内部上下文
 * ```ts
 * const result = await callProcedure(null, ['iam', 'auth', 'currentUser'], [])
 * // 实际得到 NOT_INITIALIZED；返回值为 unknown，外部类型来自真实契约。
 * ```
 */
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

/**
 * 仅 auth 存在时创建 TokenManager；刷新沿用自定义头、客户端标识与同一加密 fetch。
 * @param config - 已选定的客户端配置。
 * @param transport - 可选已创建的加密会话。
 * @returns 本实例管理器；没有 auth 时为 undefined，不自行启用认证。
 *
 * @example 模块内部上下文
 * ```ts
 * const manager = buildTokenManager({ baseUrl: 'https://api.example.com/api/v1', auth: { storage: createMemoryTokenStorage() }, headers: { 'x-app-channel': 'web' } }, undefined)
 * await manager?.clear()
 * ```
 */
function buildTokenManager(config: ApiClientConfig, transport: TransportClient | undefined): TokenManager | undefined {
  if (!config.auth)
    return undefined

  const fetchFn = transport?.encryptedFetch ?? config.fetch ?? globalThis.fetch.bind(globalThis)
  // 默认使用 httpOnly cookie 存储（推荐方案：refresh token 由服务端管理，防 XSS）。
  // SSR / Node.js 测试场景请显式传入 `apiClient.tokenStorage.memory()`。
  // 原生客户端显式传入平台安全存储，浏览器不持久化 Token 到 Web Storage。
  const storage = config.auth.storage ?? createHttpOnlyCookieTokenStorage()
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const refreshPath = config.auth.refreshPath ?? DEFAULT_REFRESH_PATH
  const refreshUrl = `${baseUrl}${refreshPath.startsWith('/') ? refreshPath : `/${refreshPath}`}`

  // 刷新沿用客户端标识与自定义头（包括原生 body 通道标识），并复用同一加密 fetch。
  const refreshFetch: typeof fetch = async (input, init) => {
    const configured = typeof config.headers === 'function' ? await config.headers() : config.headers ?? {}
    const headers = new Headers(configured)
    if (!headers.has('accept-language'))
      headers.set('accept-language', core.i18n.getGlobalLocale())
    headers.set('x-request-client', config.clientName ?? DEFAULT_CLIENT_NAME)
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
    return fetchFn(input, { ...init, headers })
  }
  const manager = createTokenManager(storage, refreshUrl, refreshFetch, config.auth.onRefreshFailed, config.auth.refreshTimeoutMs)
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
function buildTransportSession(config: ApiClientConfig): TransportClient | undefined {
  if (!config.transport)
    return undefined
  const baseFetch = config.fetch ?? globalThis.fetch.bind(globalThis)
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const path = config.transport.keyExchangePath ?? '/_hai/key-exchange'
  const keyExchangeUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  return config.transport.crypto.transport.createClient({ keyExchangeUrl, fetch: baseFetch, maxPlaintextBytes: config.transport.maxPlaintextBytes })
}

/**
 * 以同一 contract 构造 OpenAPILink 与 JSON typed client，统一头组装、超时和认证重试。
 * @param contract - 实际 procedure 契约。
 * @param config - 目标地址与平台 fetch。
 * @param tokenManager - 可选 Token 管理器。
 * @param transport - 可选加密会话。
 * @returns oRPC JSON client；模块外层代理将调用异常映射为失败 HaiResult。
 *
 * @example 模块内部上下文
 * ```ts
 * const contract = apiContract.create({ iam: apiContract.iam })
 * const raw = buildRawClient(contract, { baseUrl: 'https://api.example.com/api/v1' }, undefined, undefined)
 * // 构造不发送请求；业务调用通过外层 ApiClient 代理。
 * ```
 */
function buildRawClient<TContract extends AnyContractRouter>(
  contract: TContract,
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
  transport: TransportClient | undefined,
): JsonifiedClient<ContractRouterClient<TContract>> {
  const link = new OpenAPILink<Record<PropertyKey, unknown>>(contract, {
    url: config.baseUrl,
    headers: async (options) => {
      const headers = await buildHeaders(config, tokenManager, getObservation(options.context)?.requestId)
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
      const requestInit = options.context.keepalive === true ? { ...init, keepalive: true } : init
      const response = await fetchWithRefresh(request, requestInit, config, options.context.autoRefresh === false ? undefined : tokenManager, transport, record)
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

/** 内部 context 属性只由逻辑调用建立，不能从业务输入读取。 */
function getObservation(context: Record<PropertyKey, unknown>): MutableRequestRecord | undefined {
  const record = context[REQUEST_OBSERVATION]
  return record && typeof record === 'object' && 'requestId' in record ? record as MutableRequestRecord : undefined
}

/**
 * 合并静态/动态配置头与客户端标识，读取可用 access token 后设置 Bearer 头。
 * @param config - 用户请求头与客户端标识。
 * @param tokenManager - 可选管理器；读取安全存储失败向上游传播。
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
  requestId?: string,
): Promise<Record<string, string>> {
  const configured = typeof config.headers === 'function' ? await config.headers() : config.headers ?? {}
  const headers = new Headers(configured)
  if (!headers.has('accept-language'))
    headers.set('accept-language', core.i18n.getGlobalLocale())
  const accessToken = await tokenManager?.storage.getAccessToken()
  return {
    ...Object.fromEntries(headers),
    'x-request-client': config.clientName ?? DEFAULT_CLIENT_NAME,
    'x-request-id': requestId ?? core.context.get().requestId ?? core.id.uuid(),
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
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
 * @param tokenManager - 缺省时直接返回首次响应。
 * @param transport - 刷新与重试共用的可选加密会话。
 * @returns 最终 HTTP Response；不保证远端非幂等副作用没有发生。
 *
 * @example 模块内部上下文
 * ```ts
 * const config: ApiClientConfig = { baseUrl: 'https://api.example.com/api/v1', fetch: async () => Response.json({ success: true, data: {} }) }
 * const response = await fetchWithRefresh(new Request('https://api.example.com/api/v1/auth/me'), {}, config, undefined, undefined)
 * const status = response.status
 * ```
 */
async function fetchWithRefresh(
  request: Request,
  init: { redirect?: Request['redirect'], keepalive?: boolean },
  config: ApiClientConfig,
  tokenManager: TokenManager | undefined,
  transport: TransportClient | undefined,
  observation?: MutableRequestRecord,
): Promise<Response> {
  // Fetch Request 的 body 是一次性可读流；为了支持 401 后重发 POST/PUT 等带 body 的请求，
  // 必须在首次发送前 `clone()` 一份。即使没有 401，clone 后的副本也只会被 GC 回收，无副作用。
  const retryRequest = tokenManager ? request.clone() : undefined
  if (observation)
    observation.attempts++
  const response = await fetchWithTimeout(request, init, config, transport)
  if (!tokenManager || !retryRequest)
    return response

  // 登录失败必须保留原始错误；refresh 本身也不能再次触发自动刷新。
  const baseUrl = config.baseUrl.replace(TRAILING_SLASHES_REGEX, '')
  const refreshPath = config.auth?.refreshPath ?? DEFAULT_REFRESH_PATH
  const excludedPaths = [...AUTH_ENTRY_PATHS, refreshPath]
  if (excludedPaths.some(path => new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`).pathname === new URL(request.url).pathname))
    return response
  if (response.status !== 401 && !await isUnauthorizedResult(response))
    return response

  const tokens = await tokenManager.refresh()
  if (!tokens)
    return response

  const headers = new Headers(retryRequest.headers)
  headers.set('authorization', `Bearer ${tokens.accessToken}`)
  if (observation)
    observation.attempts++
  return fetchWithTimeout(new Request(retryRequest, { headers }), init, config, transport)
}

/**
 * 只从 HTTP 200 JSON 的有效失败 HaiResult 识别 httpStatus=401；克隆响应避免消费原正文。
 * @param response - 原始 HTTP 响应。
 * @returns 是否满足认证失效包络；非法 JSON/字段缺失留给原解析路径处理。
 *
 * @example 模块内部上下文
 * ```ts
 * const response = Response.json({ success: false, error: { code: 'hai:iam:001', message: 'Session expired', httpStatus: 401 } })
 * const unauthorized = await isUnauthorizedResult(response)
 * const originalBody = await response.json()
 * // 克隆检查没有消耗原响应正文。
 * ```
 */
async function isUnauthorizedResult(response: Response): Promise<boolean> {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json'))
    return false
  try {
    const body: unknown = await response.clone().json()
    if (!body || typeof body !== 'object' || !('success' in body) || body.success !== false
      || !('error' in body) || !body.error || typeof body.error !== 'object') {
      return false
    }
    return 'httpStatus' in body.error && body.error.httpStatus === 401
      && 'code' in body.error && typeof body.error.code === 'string'
      && 'message' in body.error && typeof body.error.message === 'string'
  }
  catch {
    // 非 JSON/非法包络交由既有客户端解析路径报告，不掩盖为认证失败。
    return false
  }
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

/**
 * 将 oRPC 状态、AbortError 与其它传输异常映射为稳定客户端错误；保留 oRPC code/status/data 详情。
 * @param error - procedure 抛出的未知异常。
 * @returns 失败 HaiResult，不包含虚构的成功数据。
 *
 * @example 模块内部上下文
 * ```ts
 * const result = mapClientError(new DOMException('Request aborted', 'AbortError'))
 * if (!result.success) { const code = result.error.code }
 * ```
 */
function mapClientError(error: unknown) {
  const time = error instanceof TransportTimeError ? error : error instanceof Error && error.cause instanceof TransportTimeError ? error.cause : undefined
  if (time)
    return err(HaiApiClientError.VALIDATION_FAILED, time.message, { transportCode: time.code })
  const capacity = error instanceof TransportBodyTooLargeError ? error : error instanceof Error && error.cause instanceof TransportBodyTooLargeError ? error.cause : undefined
  if (capacity)
    return err(HaiApiClientError.PAYLOAD_TOO_LARGE, capacity.message, { direction: capacity.direction, stage: capacity.stage, limitBytes: capacity.limitBytes, actualBytes: capacity.actualBytes })
  if (error instanceof ORPCError) {
    // 保留 ORPCError 的原始 code / status / data，供上层区分具体业务异常（不仅是 HTTP 状态码）。
    const detail = { orpcCode: error.code, status: error.status, data: error.data }
    if (error.status === 413)
      return err(HaiApiClientError.PAYLOAD_TOO_LARGE, error.message, detail)
    if (error.status === 400 || error.status === 422)
      return err(HaiApiClientError.VALIDATION_FAILED, error.message, detail)
    if (error.status === 401)
      return err(HaiApiClientError.UNAUTHORIZED, error.message, detail)
    if (error.status === 403)
      return err(HaiApiClientError.FORBIDDEN, error.message, detail)
    if (error.status === 404)
      return err(HaiApiClientError.NOT_FOUND, error.message, detail)
    return err(HaiApiClientError.SERVER_ERROR, error.message, detail)
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return err(HaiApiClientError.TIMEOUT, apiClientM('apiClient_timeout'), error)
  }
  return err(HaiApiClientError.NETWORK_ERROR, apiClientM('apiClient_networkError'), error)
}
