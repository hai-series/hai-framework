/**
 * @h-ai/api-client — 类型与错误码
 *
 * 公共类型（TokenPair、TokenStorage、ApiClientConfig 等）与标准错误集合（HaiApiClientError）。
 * 不包含实现，仅用于跨文件共享与对外导出。
 * @module api-client-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { CryptoFunctions } from '@h-ai/crypto'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { core } from '@h-ai/core'

// ─── 错误码 ───────────────────────────────────────────────────────────────────

const ApiClientErrorInfo = {
  NETWORK_ERROR: '001:502',
  TIMEOUT: '002:504',
  SERVER_ERROR: '003:502',
  UNAUTHORIZED: '004:401',
  FORBIDDEN: '005:403',
  NOT_FOUND: '006:404',
  VALIDATION_FAILED: '007:400',
  TOKEN_REFRESH_FAILED: '008:401',
  NOT_INITIALIZED: '010:500',
  CONFIG_ERROR: '011:500',
  UNKNOWN: '099:500',
} as const satisfies ErrorInfo

/**
 * 客户端标准错误集合；包含稳定 code/httpStatus 与构造错误的方法，业务调用先检查 success。
 * 传输失败在 procedure 代理中映射；服务端 HaiResult 的业务错误保持原契约。
 *
 * @example
 * ```ts
 * import { apiClient, HaiApiClientError } from '@h-ai/api-client'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.currentUser()
 *   if (!result.success && result.error.code === HaiApiClientError.UNAUTHORIZED.code) {
 *     // 由应用切换到登录页面；不输出 Token。
 *     const message = result.error.message
 *   }
 * }
 * finally { await apiClient.close() }
 * ```
 */
export const HaiApiClientError = core.error.buildHaiErrorsDef('api-client', ApiClientErrorInfo)

// ─── Token ────────────────────────────────────────────────────────────────────

/**
 * 短期 access token、可选 refresh token 与有效期；HTTP 头使用 Bearer。
 * Cookie 模式的 refresh token 由服务端管理，不能要求浏览器读取或持久化它。
 *
 * @example
 * ```ts
 * import type { TokenPair } from '@h-ai/api-client'
 * const tokens: TokenPair = { accessToken: 'test-access', expiresIn: 3600, tokenType: 'Bearer' }
 * // 示例为测试凭据；生产 Token 只能来自可信服务端认证响应。
 * ```
 */
export interface TokenPair {
  /** 短期访问凭证，请求时作为 `Authorization: Bearer ...`。 */
  readonly accessToken: string
  /** 长期刷新凭证；httpOnly cookie 模式下由服务端管理，响应体中可能不存在。 */
  readonly refreshToken?: string
  /** accessToken 有效期秒数。 */
  readonly expiresIn: number
  /** 固定为 `'Bearer'`。 */
  readonly tokenType: 'Bearer'
}

/**
 * 异步安全凭据存储契约；null 仅表示无可用凭据，读写故障须拒绝 Promise。
 * 浏览器使用内存 access token/httpOnly refresh Cookie，原生端注入平台安全存储，禁止敏感 Token 放入 localStorage。
 * 已绑定客户端的身份切换通过 client.auth，避免绕过刷新代际与串行写入；部分写入失败须执行清理并报告清理失败。
 *
 * @example
 * ```ts
 * import { apiClient, type TokenStorage } from '@h-ai/api-client'
 * const storage: TokenStorage = apiClient.tokenStorage.memory()
 * await storage.setAccessToken('test-access')
 * const accessToken = await storage.getAccessToken()
 * await storage.clear()
 * ```
 */
export interface TokenStorage {
  /**
   * 读取本适配器可用 access token；无凭据返回 null，存储故障拒绝。
   * @returns Token 或 null；不能把读取失败当成不存在。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const storage = apiClient.tokenStorage.memory()
   * const accessToken = await storage.getAccessToken()
   * ```
   */
  readonly getAccessToken: () => Promise<string | null>
  /**
   * 保存 access token；已绑定客户端应通过 auth.setTokens 维护代际。
   * @param token - 可信服务端认证返回的 access token。
   * @returns 写入完成；底层故障须拒绝。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const storage = apiClient.tokenStorage.memory()
   * await storage.setAccessToken('test-access')
   * await storage.clear()
   * ```
   */
  readonly setAccessToken: (token: string) => Promise<void>
  /**
   * 读取 refresh token 或 Cookie 模式内部哨兵；null 仅表示没有凭据。
   * @returns Token、模式哨兵或 null，不是对 httpOnly Cookie 内容的脚本读取。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const storage = apiClient.tokenStorage.memory()
   * const refreshToken = await storage.getRefreshToken()
   * // 内存适配器初始为空；Cookie 适配器由管理器识别模式哨兵。
   * ```
   */
  readonly getRefreshToken: () => Promise<string | null>
  /**
   * 保存 refresh token；Cookie 实现不通过脚本修改服务端 Cookie。
   * @param token - 服务端返回的刷新凭据；禁止写入 Web Storage。
   * @returns 写入完成；原生安全存储故障须拒绝。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const storage = apiClient.tokenStorage.memory()
   * await storage.setRefreshToken('test-refresh')
   * await storage.clear()
   * ```
   */
  readonly setRefreshToken: (token: string) => Promise<void>
  /**
   * 清空适配器可管理的凭据；Cookie 实现只能清内存 access token。
   * @returns 清理完成；失败须拒绝，服务端 Cookie/会话另由退出接口撤销。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const storage = apiClient.tokenStorage.memory()
   * await storage.clear()
   * const remaining = await storage.getAccessToken()
   * ```
   */
  readonly clear: () => Promise<void>
}

// ─── 配置 ─────────────────────────────────────────────────────────────────────

/**
 * 启用 Token 注入与自动刷新；默认 Cookie 适配器，refreshPath 相对 baseUrl。
 * 网络/超时/5xx 为暂时失败，保留凭据；明确失效才清理并通知。回调不应抛出或记录 Token。
 *
 * @example
 * ```ts
 * import { apiClient, type AuthConfig } from '@h-ai/api-client'
 * const auth: AuthConfig = { storage: apiClient.tokenStorage.memory(), refreshPath: '/auth/refresh', refreshTimeoutMs: 5000, onTokenRefreshed: tokens => { const lifetime = tokens.expiresIn } }
 * // Node/SSR 选择独立内存存储；浏览器通常直接配置 auth: {}。
 * ```
 */
export interface AuthConfig {
  /**
   * Token 存储适配器；默认 `apiClient.tokenStorage.httpOnlyCookie()`（refresh token 由服务端管理，防 XSS）。
   *
   * - SSR / Node.js 测试场景请显式传入 `apiClient.tokenStorage.memory()`。
   * - 浏览器刷新后通过 httpOnly Cookie 恢复会话，不将 Token 持久化到 Web Storage。
   * - Capacitor / 小程序请使用对应平台的安全存储适配器（如 `@h-ai/capacitor`）。
   */
  readonly storage?: TokenStorage
  /** 刷新接口路径，相对于 `baseUrl`，默认 `/auth/refresh`。 */
  readonly refreshPath?: string
  /**
   * 刷新请求超时（ms），默认 10_000。
   * 避免 refresh 接口上游挂死时所有 dedup 调用方一起 hang。
   * 超时后按现有 transient 失败处理（不清 token，下次请求可重试）。
   */
  readonly refreshTimeoutMs?: number
  /** 刷新成功回调，用于同步状态（例如多 Tab 广播）。 */
  readonly onTokenRefreshed?: (tokens: TokenPair) => void
  /** 刷新失败回调（如 refresh token 已失效），通常用于跳转登录页。 */
  readonly onRefreshFailed?: () => void
}

/**
 * 客户端初始化配置；baseUrl 包含 API 前缀，headers/fetch 用于平台适配。
 * auth 缺省时不创建 TokenManager；timeout 是底层请求中断期限，不代表服务端已取消副作用。
 * transport 需要已初始化 crypto，首次业务请求前协商会话；客户端不接收服务端私钥。
 *
 * @example
 * ```ts
 * import { apiClient, type ApiClientConfig } from '@h-ai/api-client'
 * const config: ApiClientConfig = { baseUrl: 'https://api.example.com/api/v1', auth: { storage: apiClient.tokenStorage.memory() }, timeout: 15000, clientName: 'orders-web', headers: () => ({ 'x-app-channel': 'web' }) }
 * const initialized = await apiClient.init(config)
 * if (!initialized.success) throw new Error(initialized.error.message)
 * await apiClient.close()
 * ```
 */
export interface ApiClientConfig {
  /** API service 完整 baseUrl，通常含 `apiPrefix`，例如 `https://api.example.com/api/v1`。 */
  readonly baseUrl: string
  /** 认证配置；不传则不启用 Token 注入与自动刷新。 */
  readonly auth?: AuthConfig
  /** 请求超时（ms），默认 30000。 */
  readonly timeout?: number
  /** 客户端标识，写入 `x-request-client` 请求头，默认 `hai-api-client`。 */
  readonly clientName?: string
  /** 额外请求头，可为静态对象或异步函数。 */
  readonly headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** 自定义 fetch（测试 mock / Capacitor / 小程序桥接）。 */
  readonly fetch?: typeof globalThis.fetch
  /**
   * 启用端到端传输加密（opt-in）。
   *
   * 配置后所有出站请求会在底层 fetch 之上做一次混合加密，并自动解密
   * 标记为 `X-Encrypted: true` 的响应。服务端需启用对应的 `serv.createApp({ transport })`。
   *
   * `crypto` 字段结构与 `@h-ai/crypto` 的 `crypto` 实例兼容；通常直接传入：
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * import { crypto } from '@h-ai/crypto'
   *
   * const cryptography = await crypto.init()
   * if (!cryptography.success) throw new Error(cryptography.error.message)
   * try {
   *   const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', transport: { crypto } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   await apiClient.close()
   * }
   * finally { await crypto.close() }
   * ```
   */
  readonly transport?: ApiClientTransportConfig
}

// ─── 传输加密 ────────────────────────────────────────────────────────────────

/**
 * 可选加密会话配置；密钥协商路径相对 baseUrl，并与服务端配置匹配。
 * crypto 必须先初始化；服务器版本公钥通过受保护的 TLS 握手取得，不配置服务端私钥。
 * 传输防重放不能代替业务幂等性，失败后不要自动重放非幂等操作。
 *
 * @example
 * ```ts
 * import { apiClient, type ApiClientTransportConfig } from '@h-ai/api-client'
 * import { crypto } from '@h-ai/crypto'
 * const cryptography = await crypto.init()
 * if (!cryptography.success) throw new Error(cryptography.error.message)
 * try {
 *   const transport: ApiClientTransportConfig = { crypto, keyExchangePath: '/_hai/key-exchange' }
 *   const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', transport })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   await apiClient.close()
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface ApiClientTransportConfig {
  /**
   * crypto 服务实例（通常直接传入 `@h-ai/crypto` 的 `crypto`）。
   * api-client 通过 `crypto.transport.createClient(...)` 创建会话。
   */
  readonly crypto: CryptoFunctions
  /**
   * 密钥协商端点路径，相对于 `baseUrl`，默认 `/_hai/key-exchange`。
   *
   * 必须与服务端 `serv.createApp({ transport: { keyExchangePath } })` 一致。
   */
  readonly keyExchangePath?: string
}

// ─── Client 接口 ──────────────────────────────────────────────────────────────

/**
 * 当前客户端的凭据辅助操作；仅 init 启用 auth 时建立实际管理器。
 * setTokens/clear 撤销旧刷新代际并等待串行存储变更；故障拒绝 Promise，调用方处理失败。
 * clear 不能撤销服务端会话或删除 httpOnly Cookie，退出仍需服务端接口成功。
 *
 * @example
 * ```ts
 * import { apiClient, type ApiClientAuth } from '@h-ai/api-client'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const auth: ApiClientAuth = apiClient.auth
 *   const off = auth.onTokenRefreshed(tokens => { const lifetime = tokens.expiresIn })
 *   off()
 *   await auth.clear()
 * }
 * finally { await apiClient.close() }
 * ```
 */
export interface ApiClientAuth {
  /**
   * 替换整对凭据并同步废弃旧刷新代际；缺省 refreshToken 时清除旧值。
   * @param tokens - 服务端成功认证返回的真实 TokenPair。
   * @returns 写入完成；安全存储失败拒绝 Promise，调用方应清理部分凭据并报告清理失败。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const form = { identifier: 'alice', password: 'test-password' }
   *   const login = await apiClient.iam.auth.login(form)
   *   if (!login.success) throw new Error(login.error.message)
   *   try { await apiClient.auth.setTokens(login.data.tokens) }
   *   catch (writeError) {
   *     try { await apiClient.auth.clear() }
   *     catch (cleanupError) { throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed') }
   *     throw writeError
   *   }
   * }
   * finally { await apiClient.close() }
   * ```
   */
  readonly setTokens: (tokens: TokenPair) => Promise<void>
  /**
   * 同步废弃旧刷新代际并等待存储清理；失败拒绝 Promise，不声称已持久删除。
   * 服务端会话与 httpOnly Cookie 仍需服务端退出撤销；本操作不能替代退出接口。
   * @returns 本地清理完成，不返回 HaiResult。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const logout = await apiClient.iam.auth.logout({})
   *   await apiClient.auth.clear()
   *   if (!logout.success) throw new Error(logout.error.message)
   *   // 只有服务端退出和本地清理都成功，才能确认两侧均已处理。
   * }
   * finally { await apiClient.close() }
   * ```
   */
  readonly clear: () => Promise<void>
  /**
   * 订阅当前管理器刷新成功事件；回调在写入后同步调用，避免抛错或输出 Token。
   * @param callback - 接收 TokenPair 的同步回调。
   * @returns 取消订阅函数；未启用 auth 时返回空操作。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const off = apiClient.auth.onTokenRefreshed(tokens => { const expiresIn = tokens.expiresIn })
   *   off()
   * }
   * finally { await apiClient.close() }
   * ```
   */
  readonly onTokenRefreshed: (callback: (tokens: TokenPair) => void) => () => void
}

/**
 * 客户端生命周期与认证辅助能力；init 的 HaiResult 必须先检查 success。
 * 同一实例并发 init 共享在途初始化，已初始化后再 init 返回 CONFIG_ERROR；切换配置先 close。
 * config 为脱敏快照；close 清理运行状态/加密会话，不等于服务端退出或凭据存储清理。
 *
 * @example
 * ```ts
 * import { apiClient, type ApiClientLifecycle } from '@h-ai/api-client'
 * const client: ApiClientLifecycle = apiClient
 * const initialized = await client.init({ baseUrl: 'https://api.example.com/api/v1' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * const active = client.isInitialized
 * const snapshot = client.config
 * await client.close()
 * ```
 */
export interface ApiClientLifecycle {
  /**
   * 构造并提交客户端运行状态；初始化失败返回 CONFIG_ERROR，未提交半初始化对象。
   * 并发 init 共享同一初始化；已初始化再调用会失败，切换配置先 close。
   * @param config - baseUrl、认证、fetch 与可选加密配置。
   * @returns HaiResult；必须先判断 success，再发起 procedure。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const result = await apiClient.iam.auth.publicConfig()
   *   if (!result.success) throw new Error(result.error.message)
   * }
   * finally { await apiClient.close() }
   * ```
   */
  readonly init: (config: ApiClientConfig) => Promise<HaiResult<void>>
  /**
   * 销毁当前加密会话并清除运行状态，允许重新 init；不发送服务端退出、不清空外置存储。
   * @returns 资源清理完成；不是 HaiResult，不应读取 success。
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * await apiClient.close()
   * const reinitialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
   * if (!reinitialized.success) throw new Error(reinitialized.error.message)
   * await apiClient.close()
   * ```
   */
  readonly close: () => Promise<void>
  /** 当前脱敏后的运行配置快照；未初始化时为 `null`。 */
  readonly config: ApiClientConfig | null
  /** 是否已完成初始化。 */
  readonly isInitialized: boolean
  /** Token 辅助操作。 */
  readonly auth: ApiClientAuth
}

/**
 * 由 oRPC 契约推导的 JSON typed client，与生命周期组合；procedure 的输入/输出由契约决定。
 * 调用先检查初始化和业务 HaiResult；自定义契约不能覆盖 init/close/config/isInitialized/auth 顶层成员。
 *
 * @example
 * ```ts
 * import { apiClient, type ApiClient } from '@h-ai/api-client'
 * import { apiContract } from '@h-ai/api-contract'
 * const contract = apiContract.create({ iam: apiContract.iam })
 * const client: ApiClient<typeof contract> = apiClient.create(contract)
 * const initialized = await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await client.iam.auth.currentUser()
 *   if (!result.success) throw new Error(result.error.message)
 *   const userId = result.data.id
 * }
 * finally { await client.close() }
 * ```
 */
export type ApiClient<TContract extends AnyContractRouter>
  = ApiClientLifecycle & JsonifiedClient<ContractRouterClient<TContract>>
