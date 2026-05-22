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
 *   失败或 token 不存在均使 `session = undefined`，由下游 `requireAuth` 统一返回 401。
 *
 * 应用层通常无需直接调用上述函数：`serv.createApp({ iam })` 内部自动选择最合适的工厂。
 * @module serv-context
 */

import type { HaiResult, Logger } from '@h-ai/core'
import type { RefreshTokenPair } from './serv-cookie-auth.js'
import { core } from '@h-ai/core'
import { resolveRequestLocale } from './serv-validation.js'

/** 当前请求解析出的会话摘要。 */
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
 */
export interface ServIam {
  readonly session: {
    /** 校验访问令牌，成功返回会话快照（结构上是 ServSession 的超集即可）。 */
    verifyToken: (accessToken: string) => Promise<HaiResult<ServSession>>
    /** 使用 refresh token 换发新的 token 对。仅 `refreshCookie` 启用时被调用。 */
    refresh: (refreshToken: string) => Promise<HaiResult<RefreshTokenPair>>
  }
}

/** `@h-ai/serv` 在 procedures 中传递的统一上下文。 */
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

/** 创建上下文所需的输入。 */
export interface CreateServContextInput {
  readonly request: Request
}

/** 应用可传入的上下文工厂。 */
export type CreateServContext = (input: CreateServContextInput) => ServContext | Promise<ServContext>

const HEADER_REQUEST_ID = 'x-request-id'
const HEADER_FORWARDED_FOR = 'x-forwarded-for'
const HEADER_REAL_IP = 'x-real-ip'
const HEADER_AUTHORIZATION = 'authorization'
const HEADER_USER_AGENT = 'user-agent'

/**
 * 从 Authorization header 中提取 Bearer token。
 *
 * @param value - Authorization header 原始值
 * @returns token 或 undefined
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
 * - 提取 `x-request-id` / `accept-language` / `x-forwarded-for` / `x-real-ip` / `user-agent`
 * - 从 `Authorization: Bearer <token>` 提取 `accessToken`
 *
 * `session` 字段始终为 `undefined`：若需会话填充，请使用 {@link buildAuthContextFactory}
 * 或直接通过 `serv.createApp({ iam })` 让框架自动选择合适工厂。
 *
 * @param input - 上下文输入
 * @returns 仅含元数据的 ServContext
 */
export function parseRequestContext(input: CreateServContextInput): ServContext {
  const headers = input.request.headers
  const requestId = headers.get(HEADER_REQUEST_ID) ?? core.id.uuid()
  const forwardedFor = headers.get(HEADER_FORWARDED_FOR)
  const ip = headers.get(HEADER_REAL_IP) ?? forwardedFor?.split(',')[0]?.trim()
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
 * 1. 调用 `parseRequestContext` 提取元数据 + accessToken
 * 2. 若 `accessToken` 存在 → 调用 `verifyToken(accessToken)`
 * 3. `verifyToken` 成功 → `session = result.data`；失败或 token 缺失 → `session = undefined`
 * 4. 下游 `requireAuth` / `requirePermission` / `requireRole` 据此判断 401/403
 *
 * **安全保证**：
 * - 每个请求都会重新调用 `verifyToken`（不缓存），用户被撤权后立即生效
 * - `verifyToken` 失败时**不**抛错，统一收敛为 `session=undefined` → 401
 * - 异常通过 try/catch 兜底，避免向 HTTP 层泄漏堆栈
 *
 * @param verifyToken - 访问令牌校验回调（通常是 `iam.session.verifyToken.bind(iam.session)`）
 * @returns 异步上下文工厂
 */
export function buildAuthContextFactory(
  verifyToken: (accessToken: string) => Promise<HaiResult<ServSession>>,
): CreateServContext {
  return async (input) => {
    const base = parseRequestContext(input)
    if (!base.accessToken)
      return base
    try {
      const result = await verifyToken(base.accessToken)
      if (!result.success)
        return base
      return { ...base, session: result.data }
    }
    catch {
      // verifyToken 抛错（不规范）也视为未认证；不向上传播
      return base
    }
  }
}
