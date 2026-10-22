/**
 * @h-ai/api-client — Token 存储与刷新管理
 *
 * 提供两个内置 Token 存储适配器（httpOnly Cookie / 内存）和一个 Token 管理器
 * （封装存储读写、自动刷新、并发去重、回调通知）。
 *
 * @example 浏览器 SPA
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 *
 * const initialized = await apiClient.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: { storage: apiClient.tokenStorage.httpOnlyCookie() },
 * })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * await apiClient.close()
 * ```
 *
 * @example Node.js 测试
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 *
 * const storage = apiClient.tokenStorage.memory()
 * await storage.setAccessToken('test-access')
 * await storage.clear()
 * ```
 *
 * @module api-client-auth
 */

import type { TokenPair, TokenStorage } from './api-client-types.js'
import { core } from '@h-ai/core'
import { z } from 'zod'

const logger = core.logger.child({ module: 'api-client', scope: 'auth' })

/**
 * httpOnly cookie 模式哨兵值。
 * `apiClient.tokenStorage.httpOnlyCookie()` 的 `getRefreshToken()` 返回此值，
 * 告知 `doRefresh` 应依赖浏览器自动发送的 httpOnly Cookie，
 * 而不是将 refreshToken 写入请求体。
 */
const HTTPONLY_COOKIE_SENTINEL = '__httponly_cookie__'

// ─── 内存存储 ─────────────────────────────────────────────────────────────────

/**
 * 创建仅属于本适配器实例的内存凭据存储，页面刷新或进程结束后丢失。
 * SSR 应为每个请求创建客户端和存储实例，避免不同用户共享默认单例。
 * 通过 client.auth 更新已绑定的存储，才能撤销旧代际刷新；直接存储写入不提供这种保证。
 * @returns 两个初始为空的 Token 槽位及清理操作。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * const storage = apiClient.tokenStorage.memory()
 * await storage.setAccessToken('test-access')
 * const saved = await storage.getAccessToken()
 * await storage.clear()
 * // saved 为本实例的测试值；不把 Token 写入 Web Storage。
 * ```
 */
export function createMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null
  let refreshToken: string | null = null
  return {
    async getAccessToken() { return accessToken },
    async setAccessToken(token) { accessToken = token },
    async getRefreshToken() { return refreshToken },
    async setRefreshToken(token) { refreshToken = token },
    async clear() {
      accessToken = null
      refreshToken = null
    },
  }
}

// ─── httpOnly Cookie 存储 ────────────────────────────────────────────────────

/**
 * 创建浏览器使用的内存 access token 与服务端 httpOnly refresh Cookie 适配器。
 * refresh getter 返回内部哨兵，setter 不修改 Cookie；clear 只清除内存 access token。
 * 刷新请求使用 credentials: include；服务端须实际设置/撤销 Cookie，配置适当的 Secure、SameSite、Path 与跨域凭据策略。
 * HttpOnly 限制脚本直接读取 Cookie，不能阻止已执行的恶意脚本代用户发请求；服务端仍须授权和防护 CSRF。
 * @returns 独立内存 access token 与 Cookie 模式标记；不接触 localStorage。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: { storage: apiClient.tokenStorage.httpOnlyCookie() } })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const me = await apiClient.iam.auth.currentUser()
 *   if (!me.success) throw new Error(me.error.message)
 *   const userId = me.data.id
 * }
 * finally { await apiClient.close() }
 * ```
 */
export function createHttpOnlyCookieTokenStorage(): TokenStorage {
  // access token 保存在内存中，用于注入 Authorization 请求头
  let memoryAccessToken: string | null = null
  return {
    async getAccessToken() { return memoryAccessToken },
    async setAccessToken(token) { memoryAccessToken = token },
    // refresh token 由服务端通过 Set-Cookie 设置为 httpOnly cookie；
    // JS 不可见，返回哨兵值让 TokenManager 识别此模式。
    async getRefreshToken() { return HTTPONLY_COOKIE_SENTINEL },
    // refresh token 由服务端管理，JS 端无法写入 httpOnly cookie，忽略此调用。
    async setRefreshToken(_token) { /* 由服务端 Set-Cookie 响应头管理，客户端无需操作 */ },
    async clear() {
      memoryAccessToken = null
      // httpOnly cookie 的清除必须由服务端 logout 端点完成（Set-Cookie: Max-Age=0）；
      // 客户端无法通过 JS 直接删除 httpOnly cookie。
    },
  }
}

// ─── Token 管理器 ─────────────────────────────────────────────────────────────

/** 校验 refresh 响应体中的 Token 字段；httpOnly cookie 模式允许不返回 refreshToken。 */
const RefreshTokenPayloadSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().optional(),
  tokenType: z.string().optional(),
})

/**
 * 当前代际刷新成功后的同步通知；参数包含敏感凭据，不应记录 Token。
 * 回调在持久写入成功后调用，应自行处理业务异常，不能把抛错当成刷新重试机制。
 *
 * @example 模块内部上下文
 * ```ts
 * const observed: number[] = []
 * const callback: RefreshCallback = tokens => { observed.push(tokens.expiresIn) }
 * callback({ accessToken: 'test-access', expiresIn: 3600, tokenType: 'Bearer' })
 * ```
 */
type RefreshCallback = (tokens: TokenPair) => void

/**
 * 创建模块内部 Token 管理器；包用户通过 apiClient.auth 使用，包入口不导出此工厂。
 * 同一代际的并发刷新共享请求；clear/setTokens 同步撤销旧代际，所有存储变更串行提交。
 * 迟到响应不能覆盖新账号、恢复退出凭据或触发旧回调；已开始的存储写入须完成后才能执行后续身份变更。
 * 4xx、无效响应和非 Cookie 模式缺少 refreshToken 会尝试清理凭据；5xx、网络/超时保留凭据并返回 null。
 * 无刷新凭据时通知失败并返回 null；存储读取失败可拒绝 Promise，setTokens/clear 的存储失败向调用方传播。
 * @param storage - 独占的安全存储适配器。
 * @param refreshEndpointUrl - baseUrl 与 refreshPath 组合后的完整 URL。
 * @param fetchFn - 实际 fetch；Cookie 模式发送凭据，普通模式发送 JSON refreshToken。
 * @param onRefreshFailed - 当前代际明确失效后的同步通知。
 * @param refreshTimeoutMs - fetch 中断超时毫秒数；依赖 fetch 实现响应 signal。
 * @returns 内部管理器；不要绕过它直接更新已绑定的 storage。
 *
 * @example 模块内部上下文
 * ```ts
 * const storage = createMemoryTokenStorage()
 * const fetchTokens: typeof fetch = async () => Response.json({ data: { accessToken: 'test-access-next', refreshToken: 'test-refresh-next', expiresIn: 3600 } })
 * const manager = createTokenManager(storage, 'https://api.example.com/api/v1/auth/refresh', fetchTokens)
 * await manager.setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 3600, tokenType: 'Bearer' })
 * const off = manager.onTokenRefreshed(tokens => { const lifetime = tokens.expiresIn })
 * try { const refreshed = await manager.refresh() }
 * finally { off(); await manager.clear() }
 * ```
 */
export function createTokenManager(
  storage: TokenStorage,
  refreshEndpointUrl: string,
  fetchFn: typeof globalThis.fetch,
  onRefreshFailed?: () => void,
  refreshTimeoutMs: number = 10_000,
) {
  const callbacks: RefreshCallback[] = []
  let refreshPromise: Promise<TokenPair | null> | null = null
  let refreshController: AbortController | null = null
  let generation = 0
  let storageMutation: Promise<void> = Promise.resolve()

  /**
   * 按调用顺序提交异步存储写入；单次失败只拒绝该调用，后续清理/登录仍可运行。
   * @param operation - 本次需要排序的写入操作。
   * @returns 本次操作结果，不吞掉当前写入故障。
   *
   * @example 模块内部上下文
   * ```ts
   * const order: string[] = []
   * await mutateStorage(async () => { order.push('login') })
   * await mutateStorage(async () => { order.push('logout') })
   * ```
   */
  function mutateStorage<T>(operation: () => Promise<T>): Promise<T> {
    const pending = storageMutation.then(operation)
    storageMutation = pending.then(() => {}, () => {})
    return pending
  }

  /**
   * 同步推进身份代际并移除旧刷新去重状态；返回旧控制器供调用方排好新写入后中断。
   * @returns 旧刷新控制器或 null；即使底层忽略 abort，代际检查仍拒绝旧结果提交。
   *
   * @example 模块内部上下文
   * ```ts
   * const old = invalidateRefresh()
   * // 生产调用先排入新身份存储变更，再触发可能重入的 abort 监听器。
   * old?.abort()
   * ```
   */
  function invalidateRefresh(): AbortController | null {
    const previousController = refreshController
    generation++
    refreshController = null
    refreshPromise = null
    return previousController
  }

  /**
   * 仅当前刷新代际可尝试清理存储并通知失效；旧账号迟到 401 不影响新身份。
   * @param refreshGeneration - 发起刷新时记录的身份代际。
   * @returns 清理完成；存储失败拒绝，由 doRefresh 的异常分支处理。
   *
   * @example 模块内部上下文
   * ```ts
   * await failRefresh(generation)
   * // 传入旧 generation 会在串行写入队列中再次校验并跳过。
   * ```
   */
  async function failRefresh(refreshGeneration: number): Promise<void> {
    await mutateStorage(async () => {
      if (refreshGeneration !== generation)
        return
      await storage.clear()
      if (refreshGeneration === generation)
        onRefreshFailed?.()
    })
  }

  /**
   * 同一代际只发起一个刷新请求；旧请求 finally 不能清除新身份的在途状态。
   * @returns 成功且仍有效的 Token，或 null；读取适配器失败可能拒绝。
   *
   * @example 模块内部上下文
   * ```ts
   * const [first, second] = await Promise.all([refresh(), refresh()])
   * // 两个调用共享在途 fetch；结果仍以各自读取到的当前代际为准。
   * ```
   */
  async function refresh(): Promise<TokenPair | null> {
    // 并发去重：同一时刻只发一次 refresh，其它调用复用同一个 Promise
    if (refreshPromise)
      return refreshPromise
    const controller = new AbortController()
    const pending = doRefresh(generation, controller)
    refreshController = controller
    refreshPromise = pending
    try {
      return await pending
    }
    finally {
      // 旧请求结束不能移除换账号后新一轮刷新的去重状态。
      if (refreshPromise === pending) {
        refreshPromise = null
        refreshController = null
      }
    }
  }

  /**
   * 等待身份写入完成后读取刷新凭据，执行超时请求并在每个异步边界校验代际。
   * 4xx/无效数据尝试清理；5xx/网络故障保留凭据。只有当前代际成功写入后才通知订阅者。
   * @param refreshGeneration - 请求开始时的代际。
   * @param controller - 本次请求中断控制器；底层 fetch 应响应 signal。
   * @returns 当前刷新 Token 或 null；清理/回调等请求段异常记录为失败，不声称持久清理成功。
   *
   * @example 模块内部上下文
   * ```ts
   * const controller = new AbortController()
   * const tokens = await doRefresh(generation, controller)
   * if (tokens) { const lifetime = tokens.expiresIn }
   * ```
   */
  async function doRefresh(refreshGeneration: number, controller: AbortController): Promise<TokenPair | null> {
    // 登录/退出可能正在异步落盘，刷新只能读取其完成后的凭据。
    await storageMutation
    if (refreshGeneration !== generation)
      return null
    const refreshToken = await storage.getRefreshToken()
    if (refreshGeneration !== generation)
      return null
    if (!refreshToken) {
      logger.warn('Token refresh skipped, no refresh token available')
      onRefreshFailed?.()
      return null
    }

    logger.debug('Refreshing token')
    // 超时保护：避免 refresh 接口挂死时 dedup Promise 永不 resolve，连带所有等待者 hang。
    const timeoutId = setTimeout(() => controller.abort(), refreshTimeoutMs)
    try {
      // httpOnly cookie 模式：浏览器自动发送 Cookie，请求体无需携带 refreshToken；
      // 同时设置 credentials:'include' 以支持跨域 Cookie 发送。
      const useHttpOnlyCookie = refreshToken === HTTPONLY_COOKIE_SENTINEL
      const requestInit: RequestInit = {
        method: 'POST',
        body: useHttpOnlyCookie ? undefined : JSON.stringify({ refreshToken }),
        credentials: useHttpOnlyCookie ? 'include' : 'same-origin',
        signal: controller.signal,
      }
      if (!useHttpOnlyCookie) {
        requestInit.headers = { 'Content-Type': 'application/json' }
      }
      const response = await fetchFn(refreshEndpointUrl, requestInit)
      if (refreshGeneration !== generation)
        return null

      if (!response.ok) {
        // 仅在服务端明确返回 401/4xx 时才清除 Token（refresh token 已失效）；
        // 5xx 作为服务端临时故障，保留 Token 让下一次请求重试。
        if (response.status >= 400 && response.status < 500) {
          await failRefresh(refreshGeneration)
        }
        else {
          logger.warn('Token refresh transient failure, keeping tokens', { status: response.status })
        }
        return null
      }

      const body = await response.json() as { data?: unknown }
      if (refreshGeneration !== generation)
        return null
      const parsed = RefreshTokenPayloadSchema.safeParse(readTokenPayload(body.data))
      if (!parsed.success) {
        logger.warn('Token refresh returned invalid data', { issues: parsed.error.issues })
        await failRefresh(refreshGeneration)
        return null
      }
      if (!useHttpOnlyCookie && !parsed.data.refreshToken) {
        logger.warn('Token refresh returned invalid data', { issues: [{ path: ['refreshToken'], message: 'Required' }] })
        await failRefresh(refreshGeneration)
        return null
      }

      // 默认值兜底，避免不安全强转
      const refreshTokenForStorage = parsed.data.refreshToken ?? HTTPONLY_COOKIE_SENTINEL
      const tokens: TokenPair = {
        accessToken: parsed.data.accessToken,
        refreshToken: refreshTokenForStorage,
        expiresIn: parsed.data.expiresIn ?? 3600,
        tokenType: 'Bearer',
      }
      const committed = await mutateStorage(async () => {
        if (refreshGeneration !== generation)
          return false
        await storage.setAccessToken(tokens.accessToken)
        if (refreshGeneration !== generation)
          return false
        await storage.setRefreshToken(refreshTokenForStorage)
        return refreshGeneration === generation
      })
      if (!committed || refreshGeneration !== generation)
        return null
      logger.info('Token refreshed successfully')
      for (const cb of callbacks) {
        if (refreshGeneration !== generation)
          return null
        cb(tokens)
      }
      return refreshGeneration === generation ? tokens : null
    }
    catch (error) {
      if (refreshGeneration !== generation)
        return null
      // 网络或 fetch 本身抛异常（超时、断网、CORS）视为可重试的暂时性错误，
      // 不清除 Token，仅记录日志。调用方可在下次请求时重试。
      logger.error('Token refresh failed (transient)', { error })
      return null
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    storage,
    refresh,
    async setTokens(tokens: TokenPair) {
      const previousController = invalidateRefresh()
      const mutationGeneration = generation
      const pending = mutateStorage(async () => {
        if (mutationGeneration !== generation)
          return
        // 替换完整凭据：新账号未提供 refresh token 时不能继续使用旧账号的值。
        await storage.clear()
        if (mutationGeneration !== generation)
          return
        await storage.setAccessToken(tokens.accessToken)
        if (tokens.refreshToken && mutationGeneration === generation)
          await storage.setRefreshToken(tokens.refreshToken)
      })
      // 先排好新身份写入，再触发 abort 事件；可重入的监听器只能读取新操作后的存储。
      previousController?.abort()
      await pending
    },
    async clear() {
      const previousController = invalidateRefresh()
      const pending = mutateStorage(() => storage.clear())
      previousController?.abort()
      await pending
    },
    onTokenRefreshed(callback: RefreshCallback): () => void {
      callbacks.push(callback)
      return () => {
        const idx = callbacks.indexOf(callback)
        if (idx >= 0)
          callbacks.splice(idx, 1)
      }
    },
  }
}

/**
 * Token 管理器内部契约，从真实工厂返回值推导；不属于包公开类型。
 *
 * @example 模块内部上下文
 * ```ts
 * const manager: TokenManager = createTokenManager(createMemoryTokenStorage(), 'https://api.example.com/api/v1/auth/refresh', fetch)
 * await manager.clear()
 * // clear 先废弃旧代际，再等待已有写入及本次清理完成。
 * ```
 */
export type TokenManager = ReturnType<typeof createTokenManager>

/**
 * 从直接 tokens 或带 tokens 字段的 data 提取待校验内容；本函数不证明字段合法。
 * @param data - 已解析 JSON 包络的 data。
 * @returns 交给 RefreshTokenPayloadSchema 校验的未知值。
 *
 * @example 模块内部上下文
 * ```ts
 * const candidate = readTokenPayload({ tokens: { accessToken: 'test-access', expiresIn: 3600 } })
 * const parsed = RefreshTokenPayloadSchema.safeParse(candidate)
 * if (parsed.success) { const accessToken = parsed.data.accessToken }
 * ```
 */
function readTokenPayload(data: unknown): unknown {
  if (typeof data === 'object' && data !== null && 'tokens' in data) {
    return (data as { tokens: unknown }).tokens
  }
  return data
}
