/**
 * =============================================================================
 * @hai/iam - 前端 IAM 客户端
 * =============================================================================
 *
 * 提供前端通过 HTTP API 调用 IAM 服务的客户端实现。
 * 支持认证、用户管理、令牌刷新等操作。
 *
 * @example
 * ```ts
 * import { createIamClient } from '@hai/iam/client'
 *
 * const client = createIamClient({
 *   baseUrl: '/api/iam',
 * })
 *
 * // 登录
 * const result = await client.login({
 *   identifier: 'admin',
 *   password: 'Password123',
 * })
 *
 * if (result.success) {
 *   // 保存令牌
 *   localStorage.setItem('accessToken', result.data.accessToken)
 * }
 *
 * // 获取当前用户
 * const user = await client.getCurrentUser()
 * ```
 *
 * @module client/iam-client
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'

// =============================================================================
// 类型定义
// =============================================================================

/**
 * API 路径配置
 */
export interface IamClientPaths {
  /** 登录路径 */
  login?: string
  /** OTP 登录路径 */
  loginWithOtp?: string
  /** 发送 OTP 路径 */
  sendOtp?: string
  /** 登出路径 */
  logout?: string
  /** 刷新令牌路径 */
  refresh?: string
  /** 注册路径 */
  register?: string
  /** 获取当前用户路径 */
  currentUser?: string
  /** 修改密码路径 */
  changePassword?: string
  /** 验证密码强度路径 */
  validatePassword?: string
  /** 获取 OAuth URL 路径 */
  oauthUrl?: string
}

/**
 * 默认 API 路径
 */
const DEFAULT_PATHS: Required<IamClientPaths> = {
  login: '/auth/login',
  loginWithOtp: '/auth/login/otp',
  sendOtp: '/auth/otp/send',
  logout: '/auth/logout',
  refresh: '/auth/refresh',
  register: '/user/register',
  currentUser: '/user/me',
  changePassword: '/user/password',
  validatePassword: '/user/validate-password',
  oauthUrl: '/auth/oauth/url',
}

/**
 * 客户端配置
 */
export interface IamClientConfig {
  /** API 基础路径（如 '/api/iam'） */
  baseUrl: string
  /** API 路径配置（可选，用于自定义各接口路径） */
  paths?: IamClientPaths
  /** 获取访问令牌的函数（用于自动附加到请求头） */
  getAccessToken?: () => string | null
  /** 令牌刷新后的回调 */
  onTokenRefresh?: (tokens: AuthTokens) => void
  /** 认证失败（如令牌过期）的回调 */
  onAuthError?: (error: IamClientError) => void
  /** 自定义 fetch 函数（用于测试或自定义请求） */
  fetch?: typeof fetch
}

/**
 * 客户端错误
 */
export interface IamClientError {
  /** 错误码 */
  code: string
  /** 错误消息 */
  message: string
  /** HTTP 状态码 */
  status?: number
}

/**
 * 认证令牌
 */
export interface AuthTokens {
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken?: string
  /** 过期时间 */
  expiresAt?: Date
}

/**
 * 协议展示信息
 */
export interface AgreementDisplay {
  /** 用户协议 URL */
  userAgreementUrl?: string
  /** 隐私协议 URL */
  privacyPolicyUrl?: string
  /** 注册时展示协议 */
  showOnRegister: boolean
  /** 登录时展示协议 */
  showOnLogin: boolean
}

/**
 * 登录凭证
 */
export interface LoginCredentials {
  /** 用户名或邮箱 */
  identifier: string
  /** 密码 */
  password: string
  /** 记住我 */
  rememberMe?: boolean
}

/**
 * OTP 登录凭证
 */
export interface OtpLoginCredentials {
  /** 手机号或邮箱 */
  identifier: string
  /** 验证码 */
  code: string
}

/**
 * 登录结果
 */
export interface LoginResult {
  /** 用户信息 */
  user: UserInfo
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken?: string
  /** 过期时间 */
  expiresAt: Date
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

/**
 * 用户信息
 */
export interface UserInfo {
  /** 用户 ID */
  id: string
  /** 用户名 */
  username: string
  /** 邮箱 */
  email?: string
  /** 手机号 */
  phone?: string
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 是否启用 */
  enabled: boolean
  /** 邮箱是否已验证 */
  emailVerified: boolean
  /** 手机是否已验证 */
  phoneVerified: boolean
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 注册选项
 */
export interface RegisterOptions {
  /** 用户名 */
  username: string
  /** 邮箱 */
  email?: string
  /** 密码 */
  password: string
  /** 显示名称 */
  displayName?: string
}

/**
 * 注册结果
 */
export interface RegisterResult {
  /** 用户信息 */
  user: UserInfo
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

/**
 * 修改密码选项
 */
export interface ChangePasswordOptions {
  /** 原密码 */
  oldPassword: string
  /** 新密码 */
  newPassword: string
}

/**
 * 更新用户选项
 */
export interface UpdateUserOptions {
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 手机号 */
  phone?: string
}

/**
 * IAM 客户端接口
 */
export interface IamClient {
  // 认证操作
  /** 登录 */
  login: (credentials: LoginCredentials) => Promise<Result<LoginResult, IamClientError>>
  /** OTP 登录 */
  loginWithOtp: (credentials: OtpLoginCredentials) => Promise<Result<LoginResult, IamClientError>>
  /** 发送验证码 */
  sendOtp: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamClientError>>
  /** 登出 */
  logout: () => Promise<Result<void, IamClientError>>
  /** 刷新令牌 */
  refreshToken: (refreshToken: string) => Promise<Result<AuthTokens, IamClientError>>

  // 用户操作
  /** 注册 */
  register: (options: RegisterOptions) => Promise<Result<RegisterResult, IamClientError>>
  /** 获取当前用户 */
  getCurrentUser: () => Promise<Result<UserInfo, IamClientError>>
  /** 更新用户信息 */
  updateUser: (options: UpdateUserOptions) => Promise<Result<UserInfo, IamClientError>>
  /** 修改密码 */
  changePassword: (options: ChangePasswordOptions) => Promise<Result<void, IamClientError>>
  /** 验证密码强度 */
  validatePassword: (password: string) => Promise<Result<void, IamClientError>>

  // OAuth 操作
  /** 获取 OAuth 授权 URL */
  getOAuthUrl: (provider: string, returnUrl?: string) => Promise<Result<{ url: string }, IamClientError>>
}

// =============================================================================
// 客户端实现
// =============================================================================

/**
 * 创建 IAM 客户端
 *
 * @param config - 客户端配置
 * @returns IAM 客户端实例
 */
export function createIamClient(config: IamClientConfig): IamClient {
  const { baseUrl, getAccessToken, onTokenRefresh, onAuthError } = config
  const fetchFn = config.fetch || (typeof fetch === 'function' ? fetch : undefined)
  const paths: Required<IamClientPaths> = { ...DEFAULT_PATHS, ...config.paths }

  /**
   * 发送请求
   */
  async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: { requireAuth?: boolean },
  ): Promise<Result<T, IamClientError>> {
    if (!fetchFn) {
      return err({
        code: 'FETCH_NOT_AVAILABLE',
        message: 'Fetch is not available in the current environment',
      })
    }
    const url = `${baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // 添加认证头
    if (options?.requireAuth !== false && getAccessToken) {
      const token = getAccessToken()
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
    }

    try {
      const response = await fetchFn(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      // 解析响应
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const error: IamClientError = {
          code: data?.code || 'REQUEST_FAILED',
          message: data?.message || `请求失败: ${response.status}`,
          status: response.status,
        }

        // 401 错误时触发回调
        if (response.status === 401 && onAuthError) {
          onAuthError(error)
        }

        return err(error)
      }

      return ok(data as T)
    }
    catch (error) {
      return err({
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : '网络请求失败',
      })
    }
  }

  /**
   * 解析日期字段
   */
  function parseLoginResult(data: LoginResult): LoginResult {
    return {
      ...data,
      expiresAt: new Date(data.expiresAt),
      user: parseUserInfo(data.user),
    }
  }

  /**
   * 解析用户信息日期字段
   */
  function parseUserInfo(data: UserInfo): UserInfo {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    }
  }

  return {
    // =========================================================================
    // 认证操作
    // =========================================================================

    async login(credentials) {
      const result = await request<LoginResult>('POST', paths.login, credentials, { requireAuth: false })
      if (result.success) {
        const parsed = parseLoginResult(result.data)
        if (onTokenRefresh) {
          onTokenRefresh({
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
            expiresAt: parsed.expiresAt,
          })
        }
        return ok(parsed)
      }
      return result
    },

    async loginWithOtp(credentials) {
      const result = await request<LoginResult>('POST', paths.loginWithOtp, credentials, { requireAuth: false })
      if (result.success) {
        const parsed = parseLoginResult(result.data)
        if (onTokenRefresh) {
          onTokenRefresh({
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
            expiresAt: parsed.expiresAt,
          })
        }
        return ok(parsed)
      }
      return result
    },

    async sendOtp(identifier) {
      const result = await request<{ expiresAt: string }>('POST', paths.sendOtp, { identifier }, { requireAuth: false })
      if (result.success) {
        return ok({ expiresAt: new Date(result.data.expiresAt) })
      }
      return result as Result<{ expiresAt: Date }, IamClientError>
    },

    async logout() {
      return await request<void>('POST', paths.logout)
    },

    async refreshToken(refreshToken) {
      const result = await request<AuthTokens>('POST', paths.refresh, { refreshToken }, { requireAuth: false })
      if (result.success && onTokenRefresh) {
        onTokenRefresh(result.data)
      }
      return result
    },

    // =========================================================================
    // 用户操作
    // =========================================================================

    async register(options) {
      const result = await request<RegisterResult>('POST', paths.register, options, { requireAuth: false })
      if (result.success) {
        return ok({
          ...result.data,
          user: parseUserInfo(result.data.user),
        })
      }
      return result
    },

    async getCurrentUser() {
      const result = await request<UserInfo>('GET', paths.currentUser)
      if (result.success) {
        return ok(parseUserInfo(result.data))
      }
      return result
    },

    async updateUser(options) {
      const result = await request<UserInfo>('PUT', paths.currentUser, options)
      if (result.success) {
        return ok(parseUserInfo(result.data))
      }
      return result
    },

    async changePassword(options) {
      return await request<void>('POST', paths.changePassword, options)
    },

    async validatePassword(password) {
      return await request<void>('POST', paths.validatePassword, { password }, { requireAuth: false })
    },

    // =========================================================================
    // OAuth 操作
    // =========================================================================

    async getOAuthUrl(provider, returnUrl) {
      const params = new URLSearchParams({ provider })
      if (returnUrl) {
        params.set('returnUrl', returnUrl)
      }
      return await request<{ url: string }>('GET', `${paths.oauthUrl}?${params}`, undefined, { requireAuth: false })
    },
  }
}
