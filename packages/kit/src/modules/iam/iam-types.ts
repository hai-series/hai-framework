/**
 * =============================================================================
 * @hai/kit - IAM 类型定义
 * =============================================================================
 * IAM 模块集成相关类型
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'

/**
 * IAM 服务接口（简化版，与 @hai/iam 兼容）
 */
export interface IamServiceLike {
  auth: {
    authenticate: (credentials: {
      type: string
      username: string
      password: string
    }) => Promise<{
      success: boolean
      data?: { id: string, username: string, email?: string }
      error?: { code: number, message: string }
    }>
  }
  session: {
    create: (options: {
      userId: string
      roles: string[]
      source?: string
      maxAge?: number
    }) => Promise<{
      success: boolean
      data?: {
        accessToken: string
        expiresAt: Date
        source?: string
      }
      error?: { code: number, message: string }
    }>
    get: (sessionId: string) => Promise<{
      success: boolean
      data?: SessionData | null
      error?: { code: number, message: string }
    }>
    verifyToken: (token: string) => Promise<{
      success: boolean
      data?: SessionData
      error?: { code: number, message: string }
    }>
    delete: (sessionId: string) => Promise<{
      success: boolean
      error?: { code: number, message: string }
    }>
  }
  user: {
    getById: (userId: string) => Promise<{
      success: boolean
      data?: UserData | null
      error?: { code: number, message: string }
    }>
    register: (options: {
      username: string
      email: string
      password: string
    }) => Promise<{
      success: boolean
      data?: UserData
      error?: { code: number, message: string }
    }>
    changePassword: (
      userId: string,
      oldPassword: string,
      newPassword: string,
    ) => Promise<{
      success: boolean
      error?: { code: number, message: string }
    }>
  }
  authz: {
    checkPermission: (
      ctx: { userId: string },
      permission: string,
    ) => Promise<{
      success: boolean
      data?: boolean
      error?: { code: number, message: string }
    }>
    getUserRoles: (userId: string) => Promise<{
      success: boolean
      data?: Array<{ id: string, code: string }>
      error?: { code: number, message: string }
    }>
  }
}

/**
 * 用户数据
 */
export interface UserData {
  id: string
  username: string
  email?: string
  nickname?: string
  avatar?: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 会话数据
 */
export interface SessionData {
  userId: string
  roles: string[]
  source?: string
  accessToken: string
  expiresAt: Date
  createdAt: Date
}

/**
 * IAM Locals（注入到 event.locals）
 */
export interface IamLocals {
  session: SessionData | null
  user: UserData | null
}

/**
 * IAM Handle 配置
 */
export interface IamHandleConfig {
  /** IAM 服务实例 */
  iam: IamServiceLike
  /** 公开路径（不需要认证） */
  publicPaths?: string[]
  /** 会话 Cookie 名称 */
  sessionCookieName?: string
  /** 未认证回调 */
  onUnauthenticated?: (event: RequestEvent) => Response | Promise<Response>
  /** 未授权回调 */
  onUnauthorized?: (event: RequestEvent) => Response | Promise<Response>
}

/**
 * IAM Actions 配置
 */
export interface IamActionsConfig {
  /** IAM 服务实例 */
  iam: IamServiceLike
  /** 会话 Cookie 名称 */
  sessionCookieName?: string
  /** 会话有效期（秒） */
  sessionMaxAge?: number
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
    user: UserData
    session: SessionData
    event: RequestEvent
  }) => void | Promise<void>
  /** 注册成功回调 */
  onRegisterSuccess?: (ctx: {
    user: UserData
    event: RequestEvent
  }) => void | Promise<void>
  /** 登出成功回调 */
  onLogoutSuccess?: (ctx: { event: RequestEvent }) => void | Promise<void>
}

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
