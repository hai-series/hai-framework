/**
 * =============================================================================
 * @hai/iam - 统一服务入口
 * =============================================================================
 * 身份与访问管理服务的统一出口
 * 
 * 使用方式:
 * ```typescript
 * import { iam } from '@hai/iam'
 * 
 * // 登录
 * const result = await iam.ident.login({ identifier: 'user', password: 'pass' })
 * 
 * // 检查权限
 * const hasPermission = await iam.authz.checkPermission(ctx, 'users:read')
 * 
 * // 创建会话
 * const session = await iam.session.create({ userId: 'xxx' })
 * ```
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import type {
    AuthzProvider,
    IAMConfig,
    IAMError,
    IAMProvider,
    IAMService,
    IdentProvider,
    OAuthProvider,
    SessionProvider,
} from './iam-types.js'

// 导入默认实现（hai provider）
import { createHaiIdentProvider } from './provider/hai/iam-hai-ident.js'
import { createHaiAuthzProvider } from './provider/hai/iam-hai-authz.js'
import { createHaiSessionProvider } from './provider/hai/iam-hai-session.js'
import { createHaiOAuthProvider } from './provider/hai/iam-hai-oauth.js'

// =============================================================================
// 提供者工厂
// =============================================================================

/**
 * 提供者工厂映射
 */
const providerFactories: Record<IAMProvider, {
    ident: (config: IAMConfig) => IdentProvider
    authz: (config: IAMConfig) => AuthzProvider
    session: (config: IAMConfig) => SessionProvider
    oauth: (config: IAMConfig) => OAuthProvider
}> = {
    hai: {
        ident: createHaiIdentProvider,
        authz: createHaiAuthzProvider,
        session: createHaiSessionProvider,
        oauth: createHaiOAuthProvider,
    },
    // 其他提供者可以在这里注册
    firebase: {
        ident: () => { throw new Error('Firebase provider not implemented') },
        authz: () => { throw new Error('Firebase provider not implemented') },
        session: () => { throw new Error('Firebase provider not implemented') },
        oauth: () => { throw new Error('Firebase provider not implemented') },
    },
    supabase: {
        ident: () => { throw new Error('Supabase provider not implemented') },
        authz: () => { throw new Error('Supabase provider not implemented') },
        session: () => { throw new Error('Supabase provider not implemented') },
        oauth: () => { throw new Error('Supabase provider not implemented') },
    },
    auth0: {
        ident: () => { throw new Error('Auth0 provider not implemented') },
        authz: () => { throw new Error('Auth0 provider not implemented') },
        session: () => { throw new Error('Auth0 provider not implemented') },
        oauth: () => { throw new Error('Auth0 provider not implemented') },
    },
    custom: {
        ident: () => { throw new Error('Custom provider must be registered') },
        authz: () => { throw new Error('Custom provider must be registered') },
        session: () => { throw new Error('Custom provider must be registered') },
        oauth: () => { throw new Error('Custom provider must be registered') },
    },
}

// =============================================================================
// IAM 服务实现
// =============================================================================

/**
 * IAM 服务实现类
 */
class IAMServiceImpl implements IAMService {
    private _ident: IdentProvider | null = null
    private _authz: AuthzProvider | null = null
    private _session: SessionProvider | null = null
    private _oauth: OAuthProvider | null = null
    private _config: IAMConfig
    private _initialized = false

    constructor(config: IAMConfig) {
        this._config = config
    }

    get ident(): IdentProvider {
        if (!this._ident) {
            throw new Error('IAM service not initialized. Call initialize() first.')
        }
        return this._ident
    }

    get authz(): AuthzProvider {
        if (!this._authz) {
            throw new Error('IAM service not initialized. Call initialize() first.')
        }
        return this._authz
    }

    get session(): SessionProvider {
        if (!this._session) {
            throw new Error('IAM service not initialized. Call initialize() first.')
        }
        return this._session
    }

    get oauth(): OAuthProvider {
        if (!this._oauth) {
            throw new Error('IAM service not initialized. Call initialize() first.')
        }
        return this._oauth
    }

    async initialize(): Promise<Result<void, IAMError>> {
        if (this._initialized) {
            return ok(undefined)
        }

        try {
            const factory = providerFactories[this._config.provider]
            if (!factory) {
                return err({
                    type: 'CONFIGURATION_ERROR',
                    message: `Unknown IAM provider: ${this._config.provider}`,
                })
            }

            this._ident = factory.ident(this._config)
            this._authz = factory.authz(this._config)
            this._session = factory.session(this._config)
            this._oauth = factory.oauth(this._config)
            this._initialized = true

            return ok(undefined)
        }
        catch (error) {
            return err({
                type: 'INTERNAL_ERROR',
                message: 'Failed to initialize IAM service',
                cause: error,
            })
        }
    }

    async shutdown(): Promise<Result<void, IAMError>> {
        this._ident = null
        this._authz = null
        this._session = null
        this._oauth = null
        this._initialized = false
        return ok(undefined)
    }
}

// =============================================================================
// 全局 IAM 实例
// =============================================================================

let globalIAMService: IAMService | null = null

/**
 * 默认配置
 */
const defaultConfig: IAMConfig = {
    provider: 'hai',
    passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecialChar: false,
    },
    session: {
        maxAge: 7 * 24 * 60 * 60, // 7 days
        sliding: true,
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'change-me-in-production',
        accessTokenExpiry: 15 * 60, // 15 minutes
        refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days
    },
}

/**
 * 创建 IAM 服务
 */
export function createIAMService(config?: Partial<IAMConfig>): IAMService {
    return new IAMServiceImpl({
        ...defaultConfig,
        ...config,
    })
}

/**
 * 配置全局 IAM 服务
 */
export function configureIAM(config?: Partial<IAMConfig>): void {
    globalIAMService = createIAMService(config)
}

/**
 * 获取全局 IAM 服务
 */
export function getIAM(): IAMService {
    if (!globalIAMService) {
        // 自动创建默认实例
        globalIAMService = createIAMService()
    }
    return globalIAMService
}

/**
 * 注册自定义提供者
 */
export function registerProvider(
    name: IAMProvider,
    factories: {
        ident?: (config: IAMConfig) => IdentProvider
        authz?: (config: IAMConfig) => AuthzProvider
        session?: (config: IAMConfig) => SessionProvider
        oauth?: (config: IAMConfig) => OAuthProvider
    },
): void {
    const existing = providerFactories[name] || providerFactories.custom
    providerFactories[name] = {
        ident: factories.ident || existing.ident,
        authz: factories.authz || existing.authz,
        session: factories.session || existing.session,
        oauth: factories.oauth || existing.oauth,
    }
}

// =============================================================================
// 导出全局 iam 常量
// =============================================================================

/**
 * IAM 服务代理对象
 * 提供便捷的访问方式: iam.ident.login(), iam.authz.checkPermission(), etc.
 */
export const iam = {
    /**
     * 身份认证服务
     */
    get ident(): IdentProvider {
        return getIAM().ident
    },

    /**
     * 访问授权服务
     */
    get authz(): AuthzProvider {
        return getIAM().authz
    },

    /**
     * 会话管理服务
     */
    get session(): SessionProvider {
        return getIAM().session
    },

    /**
     * OAuth 服务
     */
    get oauth(): OAuthProvider {
        return getIAM().oauth
    },

    /**
     * 初始化 IAM 服务
     */
    initialize: () => getIAM().initialize(),

    /**
     * 关闭 IAM 服务
     */
    shutdown: () => getIAM().shutdown(),

    /**
     * 配置 IAM 服务
     */
    configure: configureIAM,
}
