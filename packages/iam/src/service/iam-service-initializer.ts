/**
 * =============================================================================
 * @hai/iam - 服务初始化器
 * =============================================================================
 *
 * 负责初始化 IAM 所需的各种存储和策略组件。
 * 将初始化逻辑从 iam-main.ts 中提取出来。
 *
 * @module service/iam-service-initializer
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { PermissionCache } from '../authz/iam-authz-rbac.js'
import type { IamConfig } from '../iam-config.js'
import type {
  AuthzManager,
  IamError,
  PermissionRepository,
  RolePermissionRepository,
  RoleRepository,
  SessionManager,
  SessionMappingRepository,
  UserRepository,
  UserRoleRepository,
} from '../iam-types.js'
import type { OAuthStrategy, OtpStrategy, PasswordStrategy } from '../strategy/index.js'
import process from 'node:process'
import { err, ok } from '@hai/core'
import { crypto as haiCrypto } from '@hai/crypto'

import { createRbacManager } from '../authz/index.js'
import {
  IamErrorCode,
  LoginConfigSchema,
  OAuthConfigSchema,
  OtpConfigSchema,
  SecurityConfigSchema,
  SessionConfigSchema,
} from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import {
  createCacheOAuthStateStore,
  createCacheOtpStore,
  createCachePermissionCache,
  createCacheSessionMappingRepository,
  createDbOAuthAccountRepository,
  createDbOAuthStateStore,
  createDbOtpStore,
  createDbPermissionRepository,
  createDbRolePermissionRepository,
  createDbRoleRepository,
  createDbSessionMappingRepository,
  createDbUserRepository,
  createDbUserRoleRepository,
} from '../repository/index.js'
import { createJwtSessionManager, createStatefulSessionManager } from '../session/index.js'
import {
  createOAuthStrategy,
  createOtpStrategy,
  createPasswordStrategy,
} from '../strategy/index.js'

/**
 * IAM 组件容器
 */
export interface IamComponents {
  /** 用户存储 */
  userRepository: UserRepository
  /** 角色存储 */
  roleRepository: RoleRepository
  /** 权限存储 */
  permissionRepository: PermissionRepository
  /** 角色-权限关联存储 */
  rolePermissionRepository: RolePermissionRepository
  /** 用户-角色关联存储 */
  userRoleRepository: UserRoleRepository
  /** 权限缓存 */
  permissionCache: PermissionCache
  /** 密码策略 */
  passwordStrategy: PasswordStrategy
  /** OTP 策略（可选） */
  otpStrategy?: OtpStrategy
  /** OAuth 策略（可选） */
  oauthStrategy?: OAuthStrategy
  /** 会话管理器 */
  sessionManager: SessionManager
  /** 授权管理器 */
  authzManager: AuthzManager
}

/**
 * 初始化选项
 */
export interface InitOptions {
  /** 数据库服务 */
  db: DbService
  /** 缓存服务（用于权限缓存） */
  cache: CacheService
  /** IAM 配置 */
  config: IamConfig
}

/** 密码提供者 */
const passwordProvider = haiCrypto.password.create()

/**
 * 生成默认 JWT 密钥
 */
function createDefaultJwtSecret(): string {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `change-me-in-production-${uuid}`
}

/**
 * 初始化 IAM 组件
 *
 * @param options - 初始化选项
 * @returns IAM 组件容器
 */
export async function initializeComponents(options: InitOptions): Promise<Result<IamComponents, IamError>> {
  const { db, cache, config } = options

  try {
    // 初始化存储
    const userRepository = await createDbUserRepository(db)
    const roleRepository = await createDbRoleRepository(db)
    const permissionRepository = await createDbPermissionRepository(db)
    const rolePermissionRepository = await createDbRolePermissionRepository(db, permissionRepository)
    const userRoleRepository = await createDbUserRoleRepository(db, roleRepository)

    // 权限缓存（使用 cache 服务）
    const permissionCache: PermissionCache = createCachePermissionCache(cache)

    // 密码策略
    const securityConfig = SecurityConfigSchema.parse(config.security ?? {})

    const passwordStrategy = createPasswordStrategy({
      passwordConfig: config.password,
      userRepository,
      hashPassword: (password: string) => {
        const result = passwordProvider.hash(password)
        if (!result.success) {
          return err({
            code: IamErrorCode.INTERNAL_ERROR,
            message: result.error.message,
          })
        }
        return ok(result.data)
      },
      verifyPassword: (password: string, hash: string) => {
        const result = passwordProvider.verify(password, hash)
        if (!result.success) {
          return err({
            code: IamErrorCode.INTERNAL_ERROR,
            message: result.error.message,
          })
        }
        return ok(result.data)
      },
      maxLoginAttempts: securityConfig.maxLoginAttempts,
      lockoutDuration: securityConfig.lockoutDuration,
    }) as PasswordStrategy

    const loginConfig = LoginConfigSchema.parse(config.login ?? {})
    const otpConfig = config.otp ? OtpConfigSchema.parse(config.otp) : undefined
    const oauthConfig = config.oauth ? OAuthConfigSchema.parse(config.oauth) : undefined

    // OTP 策略
    let otpStrategy: OtpStrategy | undefined
    if (loginConfig.otp && otpConfig) {
      const otpStore = otpConfig.store.type === 'cache'
        ? createCacheOtpStore(cache, { keyPrefix: otpConfig.store.keyPrefix })
        : await createDbOtpStore(db)
      otpStrategy = createOtpStrategy({
        otpConfig,
        userRepository,
        otpStore,
        otpSender: {
          sendEmail: async (_email, _code) => ok(undefined),
          sendSms: async (_phone, _code) => ok(undefined),
        },
        autoRegister: true,
        registerConfig: config.register,
      })
    }

    // OAuth 策略
    let oauthStrategy: OAuthStrategy | undefined
    if (loginConfig.oauth && oauthConfig) {
      const oauthStateStore = oauthConfig.stateStore.type === 'cache'
        ? createCacheOAuthStateStore(cache, { keyPrefix: oauthConfig.stateStore.keyPrefix })
        : await createDbOAuthStateStore(db)
      const oauthAccountRepository = await createDbOAuthAccountRepository(db)
      oauthStrategy = createOAuthStrategy({
        oauthConfig,
        userRepository,
        oauthAccountRepository,
        oauthStateStore,
        autoRegister: true,
        registerConfig: config.register,
      })
    }

    // 会话管理器
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const jwtConfig = sessionConfig.jwt || {
      secret: process.env.JWT_SECRET || createDefaultJwtSecret(),
      algorithm: 'HS256' as const,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
    }

    let sessionManager: SessionManager
    if (sessionConfig.type === 'stateful') {
      const mappingStoreConfig = sessionConfig.mappingStore
      const sessionMappingRepository: SessionMappingRepository = mappingStoreConfig.type === 'cache'
        ? createCacheSessionMappingRepository(cache, {
            keyPrefix: mappingStoreConfig.keyPrefix,
            userSessionTtl: mappingStoreConfig.userSessionTtl ?? sessionConfig.maxAge,
          })
        : await createDbSessionMappingRepository(db)
      sessionManager = createStatefulSessionManager({
        jwt: jwtConfig,
        maxAge: sessionConfig.maxAge,
        sliding: sessionConfig.sliding,
        sessionMappingRepository,
      })
    }
    else {
      sessionManager = createJwtSessionManager({
        jwt: jwtConfig,
        maxAge: sessionConfig.maxAge,
      })
    }

    // 授权管理器
    const authzManager = createRbacManager({
      rbacConfig: config.rbac,
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      userRoleRepository,
      permissionCache,
    })

    return ok({
      userRepository,
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      userRoleRepository,
      permissionCache,
      passwordStrategy,
      otpStrategy,
      oauthStrategy,
      sessionManager,
      authzManager,
    })
  }
  catch (error) {
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: iamM('iam_initComponentFailed'),
      cause: error,
    })
  }
}

/**
 * 密码哈希函数
 */
export function hashPassword(password: string): Result<string, IamError> {
  const result = passwordProvider.hash(password)
  if (!result.success) {
    return err({
      code: IamErrorCode.INTERNAL_ERROR,
      message: result.error.message,
    })
  }
  return ok(result.data)
}

/**
 * 密码验证函数
 */
export function verifyPassword(password: string, hash: string): Result<boolean, IamError> {
  const result = passwordProvider.verify(password, hash)
  if (!result.success) {
    return err({
      code: IamErrorCode.INTERNAL_ERROR,
      message: result.error.message,
    })
  }
  return ok(result.data)
}
