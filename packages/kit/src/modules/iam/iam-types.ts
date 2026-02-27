/**
 * =============================================================================
 * @h-ai/kit - IAM 类型定义
 * =============================================================================
 * IAM 模块集成相关类型
 *
 * 直接复用 @h-ai/iam 的公共类型，不再维护平行的 duck-typed 接口。
 * =============================================================================
 */

import type { IamFunctions, Session, User } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'

// ─── IAM Handle 配置 ───

/**
 * IAM Handle 配置
 */
export interface IamHandleConfig {
  /** IAM 服务实例 */
  iam: IamFunctions
  /** 公开路径（不需要认证） */
  publicPaths?: string[]
  /** 会话 Cookie 名称 */
  sessionCookieName?: string
  /** 未认证回调 */
  onUnauthenticated?: (event: RequestEvent) => Response | Promise<Response>
  /** 未授权回调 */
  onUnauthorized?: (event: RequestEvent) => Response | Promise<Response>
}

// ─── IAM Actions 配置 ───

/**
 * IAM Actions 配置
 */
export interface IamActionsConfig {
  /** IAM 服务实例 */
  iam: IamFunctions
  /** 会话 Cookie 名称 */
  sessionCookieName?: string
  /** 记住我有效期（秒） */
  rememberMeMaxAge?: number
  /** 登录成功后重定向 */
  loginRedirect?: string
  /** 登出后重定向 */
  logoutRedirect?: string
  /** 注册成功后重定向 */
  registerRedirect?: string
  /** 登录成功回调 */
  onLoginSuccess?: (ctx: {
    user: User
    session: Session
    event: RequestEvent
  }) => void | Promise<void>
  /** 注册成功回调 */
  onRegisterSuccess?: (ctx: {
    user: User
    event: RequestEvent
  }) => void | Promise<void>
  /** 登出成功回调 */
  onLogoutSuccess?: (ctx: { event: RequestEvent }) => void | Promise<void>
}

// ─── IAM Locals（注入到 event.locals） ───

/**
 * IAM Locals（注入到 event.locals）
 */
export interface IamLocals {
  /** 当前会话 */
  session: Session | null
}

// ─── Action 返回结果 ───

/**
 * Action 返回结果
 */
export interface IamActionResult {
  success?: boolean
  error?: string
  message?: string
  username?: string
  email?: string
}
