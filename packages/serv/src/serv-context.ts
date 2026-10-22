/**
 * @h-ai/serv — 请求上下文与认证工厂
 *
 * 定义 oRPC procedures 共享的统一上下文结构（requestId / accessToken / session / logger）。
 *
 * 上下文构造分两层（职责分明）：
 * - `parseRequestContext`：**纯同步元数据解析**，从 HTTP header 提取 requestId/locale/ip/userAgent
 *   与 Bearer accessToken。**不会**填充 `session`。
 * - `buildAuthContextFactory(verifyToken)`：**带认证的上下文工厂**。在 `parseRequestContext` 基础上
 *   异步调用 `verifyToken(accessToken)` 校验访问令牌，若成功则把会话写入 `context.session`。
 *   失败或 token 不存在均使 `session = undefined`，下游 `.auth()` 返回失败 HaiResult（error.httpStatus=401），普通 procedure 默认 HTTP 200。
 *
 * 应用层通常无需直接调用上述函数：`serv.createApp({ iam })` 内部自动选择最合适的工厂。
 * @module serv-context
 */

import type { HaiResult, Logger } from '@h-ai/core'
import type { RefreshTokenPair } from './serv-cookie-auth.js'
import { core } from '@h-ai/core'
import { normalizeClientIp } from './serv-client-ip.js'
import { resolveRequestLocale } from './serv-validation.js'

/**
 * 当前请求解析出的会话摘要。
 *
 * @example
 * ```ts
 * import type { ServSession } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * function canRead(session: ServSession): boolean {
 *   return session.permissions.includes('reports.read')
 * }
 * // 会话来自可信 verifyToken，不能将客户端 userId/roles 直接提升为会话。
 * ```
 */
export interface ServSession {
  readonly userId: string
  readonly username?: string
  readonly roles: string[]
  readonly permissions: string[]
}

/**
 * serv 与 IAM 模块交互所需的**最小**接口。
 *
 * 结构上是 `@h-ai/iam` 的 `iam` 对象的子集 —— 直接传入 `iam` 即可（TypeScript 结构类型）。
 * 单一出处：在 `serv.createApp({ iam })` 提供后，serv 自动派生：
 * - access token 校验（用于填充 `context.session`）
 * - refresh token 轮换（仅当启用 `refreshCookie` 时使用）
 *
 * 模块消费者**无需**知道 IAM 内部 Session 类型与 ServSession 的差异：结构类型确保兼容。
 *
 * @example
 * ```ts
 * import type { ServIam } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * import { iam } from '@h-ai/iam'
 *
 * const auth: ServIam = iam
 * const factory = serv.buildAuthContextFactory(token => auth.auth.verifyToken(token))
 * ```
 */
export interface ServIam {
  readonly auth: {
    /** 验证会话并读取当前有效的用户与授权；不依赖最大努力会话同步。 */
    verifyToken: (accessToken: string) => Promise<HaiResult<ServSession>>
  }
  readonly session: {
    /** 使用 refresh token 换发新令牌对；refreshCookie 启用时调用，不要求旧 access 有效。 */
    refresh: (refreshToken: string) => Promise<HaiResult<RefreshTokenPair>>
  }
}

/**
 * `@h-ai/serv` 在 procedures 中传递的统一上下文。
 *
 * @example
 * ```ts
 * import type { ServContext } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const context: ServContext = serv.parseRequestContext({ request: new Request('https://example.com/health'), remoteAddress: '192.0.2.10' })
 * const locale = context.locale
 * // parseRequestContext 只读元数据，不产生已认证 session。
 * ```
 */
export interface ServContext {
  readonly requestId: string
  readonly locale: string
  readonly ip?: string
  readonly userAgent?: string
  readonly accessToken?: string
  readonly session?: ServSession
  readonly request: Request
  readonly logger: Logger
}

/**
 * 运行时提供的连接元数据；必须来自 socket/平台，不能从请求头复制。
 *
 * @example
 * ```ts
 * import type { ServRequestMetadata } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const metadata: ServRequestMetadata = { remoteAddress: '192.0.2.10' }
 * // 由运行时 socket 提供；转发头必须另经过 trustedProxies 策略。
 * ```
 */
export interface ServRequestMetadata {
  readonly remoteAddress?: string
}

/**
 * 创建上下文所需的输入。
 *
 * @example
 * ```ts
 * import type { CreateServContextInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const input: CreateServContextInput = { request: new Request('https://example.com/health'), remoteAddress: '192.0.2.10' }
 * const context = serv.parseRequestContext(input)
 * ```
 */
export interface CreateServContextInput extends ServRequestMetadata {
  readonly request: Request
  /** createApp 已按 trustedProxies 解析的客户端地址，供自定义上下文复用。 */
  readonly ip?: string
}

/**
 * 应用可传入的上下文工厂。
 *
 * @example
 * ```ts
 * import type { CreateServContext } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const factory: CreateServContext = input => serv.parseRequestContext(input)
 * const context = await factory({ request: new Request('https://example.com/health') })
 * ```
 */
export type CreateServContext = (input: CreateServContextInput) => ServContext | Promise<ServContext>

const HEADER_REQUEST_ID = 'x-request-id'
const HEADER_AUTHORIZATION = 'authorization'
const HEADER_USER_AGENT = 'user-agent'

/**
 * 从 Authorization header 中提取 Bearer token。
 *
 * 这里只处理 **access token**。
 * 若启用了 `refreshCookie`，refresh token 不会出现在 Authorization header 中，
 * 而是通过浏览器 httpOnly cookie 或受信原生请求的 JSON body 传输，
 * 并只在 `/auth/refresh` 路由里读取。
 *
 * @param value - Authorization header 原始值
 * @returns token 或 undefined
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const token = extractBearerToken('Bearer opaque-access-token')
 * const missing = extractBearerToken(null)
 * // 这里只解析持有值，不确认会话有效性。
 * ```
 */
export function extractBearerToken(value: string | null): string | undefined {
  if (!value)
    return undefined
  const [scheme, token] = value.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token)
    return undefined
  return token
}

/**
 * 解析 HTTP 请求元数据并构造基础 ServContext（**同步**，**不**填充 session）。
 *
 * - 提取 `x-request-id` / `accept-language` / `user-agent`；IP 仅来自运行时元数据
 * - 从 `Authorization: Bearer <token>` 提取 `accessToken`
 * - **不会**读取 refresh token：refresh token 若启用 `refreshCookie`，只走专属刷新路由
 *
 * `session` 字段始终为 `undefined`：若需会话填充，请使用 {@link buildAuthContextFactory}
 * 或直接通过 `serv.createApp({ iam })` 让框架自动选择合适工厂。
 *
 * @param input - 上下文输入
 * @returns 仅含元数据的 ServContext
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 *
 * const request = new Request('https://example.com/health', { headers: { 'x-hai-locale': 'en-US' } })
 * const context = serv.parseRequestContext({ request, remoteAddress: '192.0.2.10' })
 * const locale = context.locale
 * ```
 */
export function parseRequestContext(input: CreateServContextInput): ServContext {
  const headers = input.request.headers
  const requestId = headers.get(HEADER_REQUEST_ID) ?? core.id.uuid()
  // 显式 ip: undefined 表示代理链未确认客户端，不能再回退成代理对端。
  const ip = normalizeClientIp(Object.hasOwn(input, 'ip') ? input.ip : input.remoteAddress)
  const locale = resolveRequestLocale(headers)
  const accessToken = extractBearerToken(headers.get(HEADER_AUTHORIZATION))

  return {
    requestId,
    locale,
    ip,
    userAgent: headers.get(HEADER_USER_AGENT) ?? undefined,
    accessToken,
    request: input.request,
    logger: core.logger.child({ module: 'serv', requestId }),
  }
}

/**
 * 构造**带认证的上下文工厂**：在 {@link parseRequestContext} 基础上异步填充 `context.session`。
 *
 * 工作流程（每个请求执行一次）：
 * 1. 调用 `parseRequestContext` 提取元数据 + accessToken（仅来自 Authorization Bearer）
 * 2. 若 `accessToken` 存在 → 调用 `verifyToken(accessToken)`
 * 3. `verifyToken` 成功 → `session = result.data`；失败或 token 缺失 → `session = undefined`
 * 4. 下游 `.auth()` / `.permission()` / `.role()` guard 据此返回 HaiResult（error.httpStatus=401/403），普通 procedure 默认 HTTP 200
 *
 * refresh token **不参与**这里的认证流程：它只在 access token 过期后，被 `/auth/refresh`
 * 从浏览器 httpOnly cookie 或受信原生 JSON body 中读出，用于换发新的 access token。
 *
 * **安全保证**：
 * - 每个请求都会重新调用 `verifyToken`（不缓存），用户被撤权后立即生效
 * - `verifyToken` 失败时**不**抛错，统一收敛为 `session=undefined`，交由 guard 返回未认证的失败 HaiResult
 * - 异常通过 try/catch 兜底，避免向 HTTP 层泄漏堆栈
 *
 * @param verifyToken - 访问令牌校验回调（通常是 `token => iam.auth.verifyToken(token)` 或自定义函数）
 * @returns 异步上下文工厂
 *
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * import { serv } from '@h-ai/serv'
 *
 * // IAM 已初始化；每个请求重新验证 token 与当前持久凭据/权限状态。
 * const factory = serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))
 * const context = await factory({ request: new Request('https://example.com/profile') })
 * // 未携带/验证失败时 session 为空，由 route guard 决定是否拒绝。
 * ```
 */
export function buildAuthContextFactory(
  verifyToken: (accessToken: string) => Promise<HaiResult<ServSession>>,
): CreateServContext {
  return async (input) => {
    // Step 1：先同步解析请求头，拿到 requestId / locale / accessToken 等基础元数据。
    const base = parseRequestContext(input)
    // Step 2：没有 access token 时返回基础上下文；后续由 `.auth()` guard 返回未认证的失败 HaiResult。
    if (!base.accessToken)
      return base
    try {
      // Step 3：有 token 时才触发异步校验；成功则把 session 注入上下文。
      const result = await verifyToken(base.accessToken)
      if (!result.success)
        return base
      // Step 4：返回带 session 的上下文，供 route guard 使用。
      return { ...base, session: result.data }
    }
    catch {
      // Step 5：verifyToken 抛错（不规范）也视为未认证；fail closed，不向上传播。
      return base
    }
  }
}
