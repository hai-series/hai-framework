/**
 * @h-ai/serv — 请求上下文类型
 *
 * 定义 oRPC procedures 共享的统一上下文结构：请求元信息、认证会话、logger。
 * @module context/context-types
 */

import type { Logger } from '@h-ai/core'

/** 当前请求解析出的会话摘要。 */
export interface ServSession {
  readonly userId: string
  readonly username?: string
  readonly roles: string[]
  readonly permissions: string[]
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
