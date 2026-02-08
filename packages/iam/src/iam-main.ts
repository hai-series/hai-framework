/**
 * =============================================================================
 * @hai/iam - IAM 服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `iam` 对象，聚合所有 IAM 功能。
 *
 * 使用方式：
 * 1. 调用 `iam.init(db, config, { cache })` 初始化 IAM 服务
 * 2. 通过 `iam.auth` 进行认证操作
 * 3. 通过 `iam.user` 进行用户管理
 * 4. 通过 `iam.authz` 进行授权检查
 * 5. 通过 `iam.session` 进行会话管理
 * 6. 调用 `iam.close()` 关闭服务
 *
 * @example
 * ```ts
 * import { iam } from '@hai/iam'
 * import { db } from '@hai/db'
 *
 * // 1. 初始化数据库
 * await db.init({ type: 'sqlite', database: './data.db' })
 *
 * // 2. 初始化 IAM
 * await iam.init(db, {
 *     session: {
 *         maxAge: 86400,
 *         sliding: true
 *     }
 * }, { cache })
 *
 * // 3. 注册用户
 * const user = await iam.user.register({
 *     username: 'admin',
 *     email: 'admin@example.com',
 *     password: 'Password123'
 * })
 *
 * // 4. 登录
 * const result = await iam.auth.login({
 *     identifier: 'admin',
 *     password: 'Password123'
 * })
 *
 * // 5. 验证令牌
 * const payload = await iam.auth.verifyToken(result.data.accessToken)
 *
 * // 6. 检查权限
 * const hasPermission = await iam.authz.checkPermission(
 *     { userId: user.id, roles: ['role_admin'] },
 *     'users:read'
 * )
 *
 * // 7. 关闭
 * await iam.close()
 * ```
 *
 * @module iam-main
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { AuthOperations } from './authn/iam-authn-types.js'
import type { LdapClientFactory } from './authn/ldap/iam-authn-ldap-strategy.js'
import type { AuthzManager } from './authz/rbac/iam-authz-rbac-types.js'
import type { IamClient, IamClientConfig } from './client/iam-client.js'
import type { IamConfig, IamConfigInput, IamErrorCodeType } from './iam-config.js'
import type { IamError } from './iam-core-types.js'
import type { IamComponents } from './iam-initializer.js'
import type { SessionManager } from './session/iam-session-types.js'
import type { UserOperations } from './user/iam-user-types.js'
import { core, err, ok } from '@hai/core'

import { createAuthOperations } from './authn/iam-authn-service.js'
import { createIamClient } from './client/iam-client.js'
import { IamConfigSchema, IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { initializeComponents, seedIamData } from './iam-initializer.js'
import { createUserOperations } from './user/iam-user-service.js'

const logger = core.logger.child({ module: 'iam', scope: 'main' })

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

/**
 * 创建未初始化错误
 *
 * 当 IAM 服务尚未调用 `init()` 时，所有操作均返回此错误。
 *
 * @returns 包含 NOT_INITIALIZED 错误码的 IamError
 */
function notInitializedError(): IamError {
  return {
    code: IamErrorCode.NOT_INITIALIZED,
    message: iamM('iam_notInitialized'),
  }
}

/** 未初始化时的统一占位操作类型 */
type NotInitializedOperation = (...args: unknown[]) => Promise<Result<unknown, IamError>>

/** 未初始化时的占位操作实现 */
const notInitializedOperation: NotInitializedOperation = async () => err(notInitializedError())

/** 未初始化时的同步占位操作实现 */
const notInitializedSyncOperation = () => err(notInitializedError())

/** 未初始化时的操作代理（所有方法均返回未初始化错误） */
const notInitializedOperations = new Proxy(
  {},
  {
    get: () => notInitializedOperation,
  },
)

/** 未初始化的认证操作占位 */
const notInitializedAuth = notInitializedOperations as AuthOperations

/** 未初始化的用户操作占位 */
const notInitializedUser = new Proxy(
  { validatePassword: notInitializedSyncOperation },
  {
    get: (target, prop) => (prop in target ? target[prop as keyof typeof target] : notInitializedOperation),
  },
) as unknown as UserOperations

/** 未初始化的授权管理器占位 */
const notInitializedAuthz = notInitializedOperations as AuthzManager

/** 未初始化的会话管理器占位 */
const notInitializedSession = notInitializedOperations as SessionManager

// =============================================================================
// 创建 IAM 服务实例
// =============================================================================

/**
 * IAM 服务实例状态
 */
interface IamServiceState {
  /** 是否已初始化 */
  initialized: boolean
  /** 当前配置 */
  config: IamConfig | null
  /** 组件容器 */
  components: IamComponents | null
  /** 认证操作 */
  authOperations: AuthOperations
  /** 用户操作 */
  userOperations: UserOperations
}

/**
 * IAM 客户端操作接口
 *
 * 通过 `iam.client` 访问，提供前端客户端的创建能力。
 * 客户端通过 HTTP API 与 IAM 服务通信，适用于前端场景。
 *
 * @example
 * ```ts
 * const client = iam.client.create({ baseUrl: '/api/iam' })
 * const result = await client.login({ identifier: 'admin', password: 'xxx' })
 * ```
 */
export interface IamClientOperations {
  /** 创建 IAM 客户端实例 */
  create: (config: IamClientConfig) => IamClient
}

/** IAM 客户端操作实例（无状态，无需初始化） */
const iamClientOperations: IamClientOperations = {
  create: createIamClient,
}

/**
 * IAM 服务接口
 *
 * 统一聚合所有 IAM 功能
 */
export interface IamService {
  /** 认证操作 */
  readonly auth: AuthOperations
  /** 用户管理操作 */
  readonly user: UserOperations
  /** 授权管理 */
  readonly authz: AuthzManager
  /** 会话管理 */
  readonly session: SessionManager
  /** 前端客户端操作（无需 init 即可使用） */
  readonly client: IamClientOperations

  /** 当前配置 */
  readonly config: IamConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean

  /** 错误码常量 */
  readonly errorCode: Record<string, IamErrorCodeType>

  /**
   * 初始化 IAM 服务
   *
   * @param db - 数据库服务实例（必需）
   * @param config - IAM 配置（可选）
   * @param options - 运行时选项（可选）
   */
  init: (db: DbService, config?: IamConfigInput, options?: IamInitOptions) => Promise<Result<void, IamError>>

  /**
   * 关闭
   */
  close: () => Promise<Result<void, IamError>>
}

/**
 * IAM 初始化运行时选项
 */
export interface IamInitOptions {
  /** LDAP 客户端工厂（启用 LDAP 登录时必填） */
  ldapClientFactory?: LdapClientFactory
  /** LDAP 用户同步开关（默认 true） */
  ldapSyncUser?: boolean
  /** 缓存服务（必需） */
  cache: CacheService
}

/**
 * 创建 IAM 服务实例
 *
 * 内部工厂函数，构造带有延迟初始化语义的 `IamService` 对象。
 * 初始状态下所有操作均为占位（返回未初始化错误），
 * 调用 `init()` 后替换为实际实现。
 *
 * @returns 全新的 IamService 实例
 */
function createIamServiceInstance(): IamService {
  // 服务状态
  const state: IamServiceState = {
    initialized: false,
    config: null,
    components: null,
    authOperations: notInitializedAuth,
    userOperations: notInitializedUser,
  }

  return {
    get auth(): AuthOperations {
      return state.authOperations
    },

    get user(): UserOperations {
      return state.userOperations
    },

    get authz(): AuthzManager {
      return state.components?.authzManager || notInitializedAuthz
    },

    get session(): SessionManager {
      return state.components?.sessionManager || notInitializedSession
    },

    get client(): IamClientOperations {
      return iamClientOperations
    },

    get config(): IamConfig | null {
      return state.config
    },

    get isInitialized(): boolean {
      return state.initialized
    },

    get errorCode(): Record<string, IamErrorCodeType> {
      return IamErrorCode
    },

    async init(db: DbService, configInput?: IamConfigInput, options?: IamInitOptions): Promise<Result<void, IamError>> {
      if (state.initialized) {
        return ok(undefined)
      }

      try {
        if (!options?.cache) {
          return err({
            code: IamErrorCode.CONFIG_ERROR,
            message: iamM('iam_cacheRequired'),
          })
        }

        // 解析配置
        const config = IamConfigSchema.parse(configInput || {})
        state.config = config

        // 初始化组件（会自动创建表）
        const initResult = await initializeComponents({
          db,
          config,
          ldapClientFactory: options?.ldapClientFactory,
          ldapSyncUser: options?.ldapSyncUser,
          cache: options.cache,
        })
        if (!initResult.success) {
          return initResult
        }

        state.components = initResult.data

        // 初始化默认角色和权限数据
        if (config.seedDefaultData) {
          const seedResult = await seedIamData(db)
          if (!seedResult.success) {
            return seedResult
          }
        }

        // 创建认证操作
        state.authOperations = createAuthOperations({
          passwordStrategy: state.components.passwordStrategy,
          otpStrategy: state.components.otpStrategy,
          ldapStrategy: state.components.ldapStrategy,
          sessionManager: state.components.sessionManager,
          authzManager: state.components.authzManager,
          config,
        })

        // 创建用户操作
        state.userOperations = createUserOperations({
          db,
          userRepository: state.components.userRepository,
          passwordStrategy: state.components.passwordStrategy,
          sessionManager: state.components.sessionManager,
          authzManager: state.components.authzManager,
          config,
        })

        state.initialized = true
        logger.info('IAM service initialized')
        return ok(undefined)
      }
      catch (error) {
        logger.error('IAM initialization failed', { error })
        return err({
          code: IamErrorCode.CONFIG_ERROR,
          message: iamM('iam_initFailed'),
          cause: error,
        })
      }
    },

    async close(): Promise<Result<void, IamError>> {
      state.config = null
      state.initialized = false
      state.components = null
      state.authOperations = notInitializedAuth
      state.userOperations = notInitializedUser

      logger.info('IAM service closed')
      return ok(undefined)
    },
  }
}

// =============================================================================
// 导出
// =============================================================================

/**
 * IAM 服务单例
 *
 * 默认导出的全局实例，适用于单进程场景。
 * 如需多实例（如测试隔离），使用 `iam.create()` 创建独立实例。
 */
const iamInstance = createIamServiceInstance()

export const iam: IamService & { create: () => IamService } = Object.assign(iamInstance, {
  create: () => createIamServiceInstance(),
})
