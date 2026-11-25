import type { HaiResult } from '@h-ai/core'
import type { TransportClient } from '@h-ai/crypto'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { TokenManager } from './api-client-auth.js'
import type { ApiClient, ApiClientAuth, ApiClientConfig, ApiClientLifecycle, ApiRequestObserver } from './api-client-types.js'
import { core } from '@h-ai/core'
import { getContractRouter } from '@orpc/contract'
import { apiClientM } from './api-client-i18n.js'
import { clearIamPageExitBindings, iamAuthCommits } from './api-client-iam.js'
import { buildRawClient, buildTokenManager, buildTransportSession } from './api-client-link.js'
import { createProcedureProxy } from './api-client-procedure.js'
import { normalizeBaseUrl } from './api-client-request.js'
import { HaiApiClientError } from './api-client-types.js'

/**
 * 按真实 oRPC 契约创建独立 typed client；公开调用入口为 apiClient.create(contract)。
 * init 返回 HaiResult，成功后才调用 procedure；已初始化实例必须先 close 再换配置。
 * procedure 将传输异常转换为 HaiResult；auth.setTokens/clear 的安全存储失败仍会拒绝 Promise。
 * SSR 应为每个请求创建客户端和内存存储；不共享默认单例中的用户凭据。
 * @internal
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
 * finally {
 *   await client.close()
 * }
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
    responseLifetime: AbortController | undefined
    observers: Set<ApiRequestObserver>
  } = {
    config: null,
    rawClient: null,
    tokenManager: undefined,
    transport: undefined,
    responseLifetime: undefined,
    observers: new Set(),
  }

  const auth: ApiClientAuth = {
    async setTokens(tokens) { await state.tokenManager?.setTokens(tokens) },
    async clear() { await state.tokenManager?.clear() },
    onTokenRefreshed(callback) {
      return state.tokenManager?.onTokenRefreshed(callback) ?? (() => {})
    },
  }
  iamAuthCommits.set(auth, () => {
    const { rawClient, tokenManager } = state
    const generation = tokenManager?.generation
    return async (tokens) => {
      if (state.rawClient !== rawClient || tokenManager?.generation !== generation)
        return false
      return tokenManager
        ? tokenManager.setTokens(tokens)
        : true
    }
  })

  let closePromise: Promise<void> | null = null
  let initPromise: Promise<HaiResult<void>> | null = null
  const lifecycle: ApiClientLifecycle = {
    async init(config) {
      // 并发重入防护：同时多次 init() 只执行一次。
      // 另一个调用方 await 同一个 in-flight Promise，避免重复创建 raw client / token manager。
      if (initPromise)
        return initPromise
      // 已初始化后必须先 close() 再重新 init，避免旧 transport 会话被新状态覆盖后无法 destroy。
      if (state.rawClient || closePromise) {
        return core.err(
          HaiApiClientError.CONFIG_ERROR,
          apiClientM('apiClient_alreadyInitialized'),
        )
      }
      initPromise = (async (): Promise<HaiResult<void>> => {
        let nextTransport: TransportClient | undefined
        try {
          const baseUrl = normalizeBaseUrl(config.baseUrl)
          if (baseUrl === undefined)
            return core.err(HaiApiClientError.CONFIG_ERROR, apiClientM('apiClient_invalidBaseUrl'))
          const effectiveConfig = { ...config, baseUrl }
          nextTransport = buildTransportSession(effectiveConfig)
          const nextTokenManager = buildTokenManager(effectiveConfig, nextTransport)
          const responseLifetime = new AbortController()
          const nextRawClient = buildRawClient(
            contract,
            effectiveConfig,
            nextTokenManager,
            nextTransport,
            (): boolean => state.rawClient === nextRawClient,
            responseLifetime.signal,
          )

          // 所有可能失败的构建步骤完成后再提交状态，避免调用方看到半初始化 client。
          state.config = effectiveConfig
          state.transport = nextTransport
          state.tokenManager = nextTokenManager
          state.responseLifetime = responseLifetime
          state.rawClient = nextRawClient
          return core.ok(undefined)
        }
        catch (error) {
          // 构建过程中如果 transport 已创建但后续失败，必须主动释放，避免会话/定时器泄漏。
          nextTransport?.destroy()
          state.config = null
          state.rawClient = null
          state.tokenManager = undefined
          state.transport = undefined
          state.responseLifetime = undefined
          return core.err(
            HaiApiClientError.CONFIG_ERROR,
            apiClientM('apiClient_configError', {
              params: {
                error: String(error),
              },
            }),
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
      if (closePromise)
        return closePromise
      clearIamPageExitBindings(auth)
      state.observers.clear()
      const manager = state.tokenManager
      const transport = state.transport
      const responseLifetime = state.responseLifetime
      state.config = null
      state.rawClient = null
      state.tokenManager = undefined
      state.transport = undefined
      state.responseLifetime = undefined
      responseLifetime?.abort()
      transport?.destroy()
      closePromise = manager?.dispose() ?? Promise.resolve()
      try {
        await closePromise
      }
      finally {
        closePromise = null
      }
    },
    get config() {
      return state.config
        ? core.sanitize.sanitizeSensitiveFields(state.config)
        : null
    },
    get isInitialized() { return state.rawClient !== null },
    auth,
    observeRequests(observer) {
      state.observers.add(observer)
      return () => {
        state.observers.delete(observer)
      }
    },
  }

  // 生命周期成员优先，缺席的契约节点保留 undefined。
  return new Proxy({}, {
    get(_target, property) {
      // Promise 会探测 then；客户端代理不能被当作 thenable。
      if (typeof property !== 'string' || property === 'then')
        return undefined

      if (Object.hasOwn(lifecycle, property)) {
        return Reflect.get(lifecycle, property)
      }

      const node = Object.hasOwn(contract, property)
        ? getContractRouter(contract, [property])
        : undefined
      return node
        ? createProcedureProxy(state, node, [property])
        : undefined
    },
  // 这里的返回值在运行时是一个 Proxy，但从“可用能力”上看，它符合 `ApiClient<TContract>`：
  // - 一部分成员来自 lifecycle
  // - 另一部分成员来自 contract 推导出的 procedure 层级
  // 因此使用类型断言把这个动态对象声明为最终对外的 typed client。
  }) as ApiClient<TContract>
}
