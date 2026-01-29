/**
 * =============================================================================
 * @hai/iam - 类型定义
 * =============================================================================
 * 身份与访问管理模块的核心类型定义
 * 
 * IAM 模块划分:
 * - ident: 身份认证 (Identity) - 登录、注册、密码、多因素认证
 * - authz: 访问授权 (Authorization) - 权限、角色、策略
 * - session: 会话管理 - 会话存储、令牌
 * - oauth: OAuth/OIDC - 第三方登录
 * =============================================================================
 */

import type { Result } from '@hai/core'

// =============================================================================
// 通用类型
// =============================================================================

/**
 * IAM 提供者类型
 */
export type IAMProvider = 'hai' | 'firebase' | 'supabase' | 'auth0' | 'custom'

/**
 * IAM 错误类型
 */
export type IAMErrorType =
    // 认证错误
    | 'AUTH_FAILED'
    | 'INVALID_CREDENTIALS'
    | 'USER_NOT_FOUND'
    | 'USER_DISABLED'
    | 'USER_LOCKED'
    | 'USER_ALREADY_EXISTS'
    | 'PASSWORD_EXPIRED'
    | 'PASSWORD_POLICY_VIOLATION'
    | 'MFA_REQUIRED'
    | 'MFA_INVALID'
    // 会话错误
    | 'SESSION_NOT_FOUND'
    | 'SESSION_EXPIRED'
    | 'SESSION_INVALID'
    | 'SESSION_CREATE_FAILED'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_INVALID'
    // 授权错误
    | 'PERMISSION_DENIED'
    | 'ROLE_NOT_FOUND'
    | 'INSUFFICIENT_PRIVILEGES'
    // OAuth 错误
    | 'OAUTH_PROVIDER_NOT_FOUND'
    | 'OAUTH_INVALID_STATE'
    | 'OAUTH_TOKEN_ERROR'
    // 系统错误
    | 'PROVIDER_ERROR'
    | 'CONFIGURATION_ERROR'
    | 'INTERNAL_ERROR'

/**
 * IAM 错误
 */
export interface IAMError {
    type: IAMErrorType
    message: string
    cause?: unknown
}

// =============================================================================
// 用户相关类型
// =============================================================================

/**
 * 用户基础信息
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
    /** 是否邮箱验证 */
    emailVerified?: boolean
    /** 是否手机验证 */
    phoneVerified?: boolean
    /** 创建时间 */
    createdAt: Date
    /** 更新时间 */
    updatedAt: Date
    /** 扩展属性 */
    metadata?: Record<string, unknown>
}

/**
 * 用户凭证
 */
export interface UserCredentials {
    /** 用户名/邮箱/手机号 */
    identifier: string
    /** 密码 */
    password: string
    /** 记住我 */
    rememberMe?: boolean
}

// =============================================================================
// 身份认证 (ident) 接口
// =============================================================================

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
    /** 令牌过期时间 */
    expiresAt: Date
    /** 是否需要 MFA */
    mfaRequired?: boolean
    /** MFA 令牌（需要 MFA 时使用） */
    mfaToken?: string
}

/**
 * 注册选项
 */
export interface RegisterOptions {
    /** 用户名 */
    username: string
    /** 邮箱 */
    email?: string
    /** 手机号 */
    phone?: string
    /** 密码 */
    password: string
    /** 显示名称 */
    displayName?: string
    /** 扩展属性 */
    metadata?: Record<string, unknown>
}

/**
 * 密码策略
 */
export interface PasswordPolicy {
    /** 最小长度 */
    minLength: number
    /** 需要大写字母 */
    requireUppercase: boolean
    /** 需要小写字母 */
    requireLowercase: boolean
    /** 需要数字 */
    requireNumber: boolean
    /** 需要特殊字符 */
    requireSpecialChar: boolean
    /** 密码历史记录数量（不能重复使用） */
    historyCount?: number
    /** 密码过期天数 */
    expirationDays?: number
}

/**
 * 身份认证提供者接口
 */
export interface IdentProvider {
    /** 提供者名称 */
    readonly name: string

    /**
     * 登录
     */
    login(credentials: UserCredentials): Promise<Result<LoginResult, IAMError>>

    /**
     * 注销
     */
    logout(accessToken: string): Promise<Result<void, IAMError>>

    /**
     * 注册
     */
    register(options: RegisterOptions): Promise<Result<UserInfo, IAMError>>

    /**
     * 验证密码
     */
    verifyPassword(userId: string, password: string): Promise<Result<boolean, IAMError>>

    /**
     * 修改密码
     */
    changePassword(userId: string, oldPassword: string, newPassword: string): Promise<Result<void, IAMError>>

    /**
     * 重置密码（发送重置链接）
     */
    resetPassword(identifier: string): Promise<Result<void, IAMError>>

    /**
     * 确认重置密码
     */
    confirmResetPassword(token: string, newPassword: string): Promise<Result<void, IAMError>>

    /**
     * 获取密码策略
     */
    getPasswordPolicy(): PasswordPolicy

    /**
     * 验证密码强度
     */
    validatePassword(password: string): Result<void, IAMError>
}

// =============================================================================
// 访问授权 (authz) 接口
// =============================================================================

/**
 * 权限
 */
export interface Permission {
    /** 权限 ID */
    id: string
    /** 权限代码 */
    code: string
    /** 权限名称 */
    name: string
    /** 权限描述 */
    description?: string
    /** 资源类型 */
    resource?: string
    /** 操作类型 */
    action?: string
}

/**
 * 角色
 */
export interface Role {
    /** 角色 ID */
    id: string
    /** 角色代码 */
    code: string
    /** 角色名称 */
    name: string
    /** 角色描述 */
    description?: string
    /** 权限列表 */
    permissions: Permission[]
    /** 是否系统角色 */
    isSystem?: boolean
}

/**
 * 授权检查上下文
 */
export interface AuthzContext {
    /** 用户 ID */
    userId: string
    /** 用户角色 */
    roles: string[]
    /** 资源 */
    resource?: string
    /** 操作 */
    action?: string
    /** 扩展上下文 */
    context?: Record<string, unknown>
}

/**
 * 访问授权提供者接口
 */
export interface AuthzProvider {
    /** 提供者名称 */
    readonly name: string

    /**
     * 检查权限
     */
    checkPermission(ctx: AuthzContext, permission: string): Promise<Result<boolean, IAMError>>

    /**
     * 检查角色
     */
    hasRole(userId: string, role: string): Promise<Result<boolean, IAMError>>

    /**
     * 获取用户权限列表
     */
    getUserPermissions(userId: string): Promise<Result<Permission[], IAMError>>

    /**
     * 获取用户角色列表
     */
    getUserRoles(userId: string): Promise<Result<Role[], IAMError>>

    /**
     * 分配角色给用户
     */
    assignRole(userId: string, roleId: string): Promise<Result<void, IAMError>>

    /**
     * 移除用户角色
     */
    removeRole(userId: string, roleId: string): Promise<Result<void, IAMError>>
}

// =============================================================================
// 会话管理 (session) 接口
// =============================================================================

/**
 * 会话数据
 */
export interface SessionData {
    /** 会话 ID */
    id: string
    /** 用户 ID */
    userId: string
    /** 访问令牌 */
    accessToken: string
    /** 刷新令牌 */
    refreshToken?: string
    /** 用户代理 */
    userAgent?: string
    /** IP 地址 */
    ipAddress?: string
    /** 创建时间 */
    createdAt: Date
    /** 最后活动时间 */
    lastActiveAt: Date
    /** 过期时间 */
    expiresAt: Date
    /** 扩展数据 */
    data?: Record<string, unknown>
}

/**
 * 创建会话选项
 */
export interface CreateSessionOptions {
    /** 用户 ID */
    userId: string
    /** 用户代理 */
    userAgent?: string
    /** IP 地址 */
    ipAddress?: string
    /** 过期时间（秒） */
    maxAge?: number
    /** 扩展数据 */
    data?: Record<string, unknown>
}

/**
 * 会话管理提供者接口
 */
export interface SessionProvider {
    /** 提供者名称 */
    readonly name: string

    /**
     * 创建会话
     */
    create(options: CreateSessionOptions): Promise<Result<SessionData, IAMError>>

    /**
     * 获取会话
     */
    get(sessionId: string): Promise<Result<SessionData | null, IAMError>>

    /**
     * 通过访问令牌获取会话
     */
    getByToken(accessToken: string): Promise<Result<SessionData | null, IAMError>>

    /**
     * 刷新会话
     */
    refresh(refreshToken: string): Promise<Result<SessionData, IAMError>>

    /**
     * 更新会话
     */
    update(sessionId: string, data: Partial<SessionData>): Promise<Result<void, IAMError>>

    /**
     * 删除会话
     */
    delete(sessionId: string): Promise<Result<void, IAMError>>

    /**
     * 删除用户所有会话
     */
    deleteByUserId(userId: string): Promise<Result<number, IAMError>>

    /**
     * 清理过期会话
     */
    cleanup(): Promise<Result<number, IAMError>>
}

// =============================================================================
// OAuth/OIDC (oauth) 接口
// =============================================================================

/**
 * OAuth 提供商配置
 */
export interface OAuthProviderConfig {
    /** 提供商 ID */
    id: string
    /** 提供商名称 */
    name: string
    /** 客户端 ID */
    clientId: string
    /** 客户端密钥 */
    clientSecret: string
    /** 授权 URL */
    authorizationUrl: string
    /** 令牌 URL */
    tokenUrl: string
    /** 用户信息 URL */
    userInfoUrl?: string
    /** 作用域 */
    scopes: string[]
    /** 回调 URL */
    redirectUrl: string
}

/**
 * OAuth 状态
 */
export interface OAuthState {
    /** 状态值 */
    state: string
    /** 代码验证器（PKCE） */
    codeVerifier?: string
    /** 原始 URL */
    returnUrl?: string
    /** 过期时间 */
    expiresAt: Date
}

/**
 * OAuth 令牌
 */
export interface OAuthTokens {
    /** 访问令牌 */
    accessToken: string
    /** 刷新令牌 */
    refreshToken?: string
    /** ID 令牌 */
    idToken?: string
    /** 令牌类型 */
    tokenType: string
    /** 过期时间（秒） */
    expiresIn: number
    /** 作用域 */
    scope?: string
}

/**
 * OAuth 用户信息
 */
export interface OAuthUserInfo {
    /** 提供商用户 ID */
    providerId: string
    /** 邮箱 */
    email?: string
    /** 用户名 */
    username?: string
    /** 显示名称 */
    displayName?: string
    /** 头像 URL */
    avatarUrl?: string
    /** 原始数据 */
    raw: Record<string, unknown>
}

/**
 * OAuth 提供者接口
 */
export interface OAuthProvider {
    /** 提供者名称 */
    readonly name: string

    /**
     * 获取授权 URL
     */
    getAuthorizationUrl(providerId: string, state?: string): Promise<Result<{ url: string; state: OAuthState }, IAMError>>

    /**
     * 处理回调
     */
    handleCallback(providerId: string, code: string, state: string): Promise<Result<OAuthTokens, IAMError>>

    /**
     * 获取用户信息
     */
    getUserInfo(providerId: string, accessToken: string): Promise<Result<OAuthUserInfo, IAMError>>

    /**
     * 刷新令牌
     */
    refreshToken(providerId: string, refreshToken: string): Promise<Result<OAuthTokens, IAMError>>

    /**
     * 链接 OAuth 账户到现有用户
     */
    linkAccount(userId: string, providerId: string, providerUserId: string): Promise<Result<void, IAMError>>

    /**
     * 取消链接 OAuth 账户
     */
    unlinkAccount(userId: string, providerId: string): Promise<Result<void, IAMError>>
}

// =============================================================================
// IAM 服务主接口
// =============================================================================

/**
 * IAM 配置
 */
export interface IAMConfig {
    /** 提供者类型 */
    provider: IAMProvider
    /** 密码策略 */
    passwordPolicy?: PasswordPolicy
    /** 会话配置 */
    session?: {
        /** 会话超时（秒） */
        maxAge: number
        /** 是否滑动窗口 */
        sliding: boolean
    }
    /** JWT 配置 */
    jwt?: {
        /** 密钥 */
        secret: string
        /** 访问令牌过期时间（秒） */
        accessTokenExpiry: number
        /** 刷新令牌过期时间（秒） */
        refreshTokenExpiry: number
        /** 发行者 */
        issuer?: string
        /** 受众 */
        audience?: string
    }
    /** OAuth 配置 */
    oauth?: {
        providers: OAuthProviderConfig[]
    }
    /** 提供者特定配置 */
    providerConfig?: Record<string, unknown>
}

/**
 * IAM 服务接口
 * 聚合所有 IAM 子服务
 */
export interface IAMService {
    /** 身份认证服务 */
    readonly ident: IdentProvider
    /** 访问授权服务 */
    readonly authz: AuthzProvider
    /** 会话管理服务 */
    readonly session: SessionProvider
    /** OAuth 服务 */
    readonly oauth: OAuthProvider

    /**
     * 初始化
     */
    initialize(): Promise<Result<void, IAMError>>

    /**
     * 关闭
     */
    shutdown(): Promise<Result<void, IAMError>>
}
