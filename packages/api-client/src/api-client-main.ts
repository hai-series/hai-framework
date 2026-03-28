/**
 * @h-ai/api-client — 模块入口
 *
 * 提供统一的 `api` 对象，管理 HTTP 客户端运行时状态与生命周期。
 * @module api-client-main
 */

import type { HaiResult } from '@h-ai/core'
import type { ApiClient, ApiClientConfig, ApiClientFunctions, TokenPair } from './api-client-types.js'

import { core, err, ok } from '@h-ai/core'
import { createLocalStorageTokenStorage } from './api-client-auth.js'
import { createContractCaller } from './api-client-contract.js'
import { createFetchClient } from './api-client-fetch.js'
import { apiClientM } from './api-client-i18n.js'
import { createTokenManager } from './api-client-token-manager.js'
import { HaiApiClientError } from './api-client-types.js'

const logger = core.logger.child({ module: 'api-client', scope: 'main' })

// ─── 内部状态 ───

/** 当前 ApiClient 实例（init 后非空，close 后置空） */
let currentClient: ApiClient | null = null

/** 当前客户端配置（init 后非空，close 后置空） */
let currentConfig: ApiClientConfig | null = null

/** 并发初始化防护标志 */
let initInProgress = false

// ─── 内部工厂 ───

/**
 * 根据配置创建 ApiClient 实例
 *
 * 仅供 init() 内部使用，不对外暴露。
 */
function createClient(config: ApiClientConfig): ApiClient {
  // 优先使用外部传入的 fetch（便于测试/跨平台注入）；未传入时回退到全局 fetch
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  // auth 开启时，默认使用 localStorage 作为 Token 存储
  const tokenStorage = config.auth?.storage ?? createLocalStorageTokenStorage()

  // Token 管理器（可选）
  const tokenManager = config.auth
    ? createTokenManager(
        tokenStorage,
        `${config.baseUrl.replace(/\/+$/, '')}${config.auth.refreshUrl}`,
        fetchFn,
        config.auth.onRefreshFailed,
      )
    : undefined

  // 注册外部回调
  if (config.auth?.onTokenRefreshed && tokenManager) {
    tokenManager.onTokenRefreshed(config.auth.onTokenRefreshed)
  }

  // Fetch Client
  const fetchClient = createFetchClient(config, tokenManager)

  // 契约调用
  const call = createContractCaller(fetchClient)

  // Auth 管理接口
  const auth: ApiClient['auth'] = {
    async setTokens(tokens: TokenPair) {
      if (tokenManager) {
        await tokenManager.setTokens(tokens)
      }
    },
    async clear() {
      if (tokenManager) {
        await tokenManager.clear()
      }
    },
    onTokenRefreshed(callback: (tokens: TokenPair) => void): () => void {
      if (tokenManager) {
        return tokenManager.onTokenRefreshed(callback)
      }
      return () => { }
    },
  }

  return {
    get: fetchClient.get,
    post: fetchClient.post,
    put: fetchClient.put,
    patch: fetchClient.patch,
    delete: fetchClient.delete,
    upload: fetchClient.upload,
    stream: fetchClient.stream,
    call,
    auth,
  }
}

// ─── 未初始化占位 ───

/**
 * 未初始化状态的错误工具包
 *
 * 当 api 未调用 init() 就直接使用 HTTP 方法时，
 * 所有方法调用都会返回 NOT_INITIALIZED 错误。
 */
const notInitialized = core.module.createNotInitializedKit(
  HaiApiClientError.NOT_INITIALIZED,
  () => apiClientM('apiClient_notInitialized'),
)

/** 未初始化时的 HTTP 操作占位代理（get/post/put/patch/delete/upload/call） */
const notInitializedOps = notInitialized.proxy<Pick<ApiClient, 'get' | 'post' | 'put' | 'patch' | 'delete' | 'upload' | 'call'>>()

/** 未初始化时的 Token 管理占位 */
const notInitializedAuth: ApiClient['auth'] = {
  async setTokens() {
    logger.warn('api.auth.setTokens called before initialization, ignored')
  },
  async clear() {
    logger.warn('api.auth.clear called before initialization, ignored')
  },
  onTokenRefreshed() {
    logger.warn('api.auth.onTokenRefreshed called before initialization, ignored')
    return () => { }
  },
}

/**
 * 未初始化时的流式请求占位
 *
 * async generator 无法返回 HaiResult，迭代时抛出异常。
 */
function notInitializedStreamFn(_path: string, _body?: unknown, _options?: { signal?: AbortSignal }): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<string>> {
          throw new Error(apiClientM('apiClient_notInitialized'))
        },
      }
    },
  }
}

// ─── API 客户端单例 ───

/**
 * API 客户端单例
 *
 * 使用前必须先调用 `api.init()` 初始化，传入 baseUrl 等配置信息。
 * 初始化后通过 `api.get`、`api.post`、`api.call` 等方法发起请求。
 *
 * @example
 * ```ts
 * import { api } from '@h-ai/api-client'
 *
 * // 初始化
 * await api.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: { refreshUrl: '/auth/refresh' },
 * })
 *
 * // 契约调用
 * const result = await api.call(loginEndpoint, { identifier: 'alice', password: 'xxx' })
 *
 * // 通用 HTTP
 * const users = await api.get<User[]>('/users', { page: 1 })
 *
 * // 关闭
 * await api.close()
 * ```
 */
export const api: ApiClientFunctions = {
  /**
   * 初始化 API 客户端
   *
   * 如果当前已有活跃实例，会先自动 close 再重新初始化。
   * 创建异常时返回 CONFIG_ERROR 错误。
   *
   * @param config 客户端配置（baseUrl、auth 等）
   * @returns 成功时返回 ok(undefined)；失败时返回包含错误码和消息的 err。
   */
  async init(config: ApiClientConfig): Promise<HaiResult<void>> {
    if (initInProgress) {
      return err(
        HaiApiClientError.CONFIG_ERROR,
        apiClientM('apiClient_configError', { params: { error: 'initialization already in progress' } }),
      )
    }

    initInProgress = true
    try {
      if (currentClient) {
        logger.warn('Api-client module is already initialized, reinitializing')
        await api.close()
      }

      logger.info('Initializing api-client module')

      currentClient = createClient(config)
      currentConfig = config
      logger.info('Api-client module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Api-client module initialization failed', { error })
      return err(
        HaiApiClientError.CONFIG_ERROR,
        apiClientM('apiClient_configError', { params: { error: error instanceof Error ? error.message : String(error) } }),
        error,
      )
    }
    finally {
      initInProgress = false
    }
  },

  /** GET 请求。未初始化时返回 NOT_INITIALIZED 错误 */
  get get() { return currentClient?.get ?? notInitializedOps.get },
  /** POST 请求。未初始化时返回 NOT_INITIALIZED 错误 */
  get post() { return currentClient?.post ?? notInitializedOps.post },
  /** PUT 请求。未初始化时返回 NOT_INITIALIZED 错误 */
  get put() { return currentClient?.put ?? notInitializedOps.put },
  /** PATCH 请求。未初始化时返回 NOT_INITIALIZED 错误 */
  get patch() { return currentClient?.patch ?? notInitializedOps.patch },
  /** DELETE 请求。未初始化时返回 NOT_INITIALIZED 错误 */
  get delete() { return currentClient?.delete ?? notInitializedOps.delete },
  /** 文件上传。未初始化时返回 NOT_INITIALIZED 错误 */
  get upload() { return currentClient?.upload ?? notInitializedOps.upload },
  /** 契约调用。未初始化时返回 NOT_INITIALIZED 错误 */
  get call() { return currentClient?.call ?? notInitializedOps.call },

  /**
   * 流式请求。未初始化时迭代抛出异常。
   *
   * @throws 未初始化时抛出 Error
   */
  get stream() { return currentClient?.stream ?? notInitializedStreamFn },

  /** Token 管理接口。未初始化时为空操作 */
  get auth() { return currentClient?.auth ?? notInitializedAuth },

  /** 当前客户端配置；未初始化或已关闭时为 null */
  get config() { return currentConfig },

  /** 是否已完成初始化 */
  get isInitialized() { return currentClient !== null },

  /**
   * 关闭 API 客户端并释放资源
   *
   * 关闭后所有 HTTP 操作将返回 NOT_INITIALIZED 错误。
   * 重复调用不会报错。
   */
  async close() {
    if (!currentClient) {
      currentConfig = null
      return
    }

    logger.info('Closing api-client module')

    currentClient = null
    currentConfig = null

    logger.info('Api-client module closed')
  },
}
