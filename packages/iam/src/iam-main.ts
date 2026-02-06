/**
 * =============================================================================
 * @hai/iam - IAM 服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `iam` 对象，聚合所有 IAM 功能。
 *
 * 使用方式：
 * 1. 调用 `iam.init(db, cache)` 初始化 IAM 服务
 * 2. 通过 `iam.auth` 进行认证操作
 * 3. 通过 `iam.user` 进行用户管理
 * 4. 通过 `iam.authz` 进行授权检查
 * 5. 通过 `iam.session` 进行会话管理
 * 6. 调用 `iam.close()` 关闭服务
 *
 * @example
 * ```ts
 * import { iam } from '@hai/iam'
 * import { cache } from '@hai/cache'
 * import { db } from '@hai/db'
 *
 * // 1. 初始化数据库与缓存
 * await db.init({ type: 'sqlite', database: './data.db' })
 * await cache.init({ url: 'redis://localhost:6379' })
 *
 * // 2. 初始化 IAM
 * await iam.init(db, cache, {
 *     session: {
 *         type: 'jwt',
 *         jwt: { secret: 'your-secret-key' }
 *     }
 * })
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
 *     { userId: user.id, roles: ['admin'] },
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
import type { IamConfig, IamConfigInput, IamErrorCodeType } from './iam-config.js'
import type {
  AuthOperations,
  AuthzManager,
  IamEntry,
  IamError,
  IamService,
  SessionManager,
  UserOperations,
} from './iam-types.js'
import type { IamComponents } from './service/iam-service-initializer.js'
import { err, ok } from '@hai/core'
import { IamConfigSchema, IamErrorCode } from './iam-config.js'
import { seedIamData } from './iam-database.js'
import { getIamMessage } from './iam-i18n.js'
import { createAuthOperations } from './service/iam-service-auth.js'
import {

  initializeComponents,
} from './service/iam-service-initializer.js'
import { createUserOperations } from './service/iam-service-user.js'

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

/**
 * 创建未初始化错误
 */
function notInitializedError(): IamError {
  return {
    code: IamErrorCode.NOT_INITIALIZED,
    message: getIamMessage('iam_notInitialized'),
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
const notInitializedSession = new Proxy(
  { type: 'jwt' as const },
  {
    get: (target, prop) => (prop === 'type' ? target.type : notInitializedOperation),
  },
) as SessionManager

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
 * 创建 IAM 服务实例
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

    get config(): IamConfig | null {
      return state.config
    },

    get isInitialized(): boolean {
      return state.initialized
    },

    get errorCode(): Record<string, IamErrorCodeType> {
      return IamErrorCode
    },

    async init(db: DbService, cache: CacheService, configInput?: IamConfigInput): Promise<Result<void, IamError>> {
      if (state.initialized) {
        return ok(undefined)
      }

      try {
        // 解析配置
        const config = IamConfigSchema.parse(configInput || {})
        state.config = config

        // 初始化组件（会自动创建表）
        const initResult = await initializeComponents({ db, cache, config })
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
          userRepository: state.components.userRepository,
          passwordStrategy: state.components.passwordStrategy,
          otpStrategy: state.components.otpStrategy,
          oauthStrategy: state.components.oauthStrategy,
          sessionManager: state.components.sessionManager,
          config,
        })

        // 创建用户操作
        state.userOperations = createUserOperations({
          userRepository: state.components.userRepository,
          passwordStrategy: state.components.passwordStrategy,
          sessionManager: state.components.sessionManager,
          authzManager: state.components.authzManager,
          config,
        })

        state.initialized = true
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: IamErrorCode.CONFIG_ERROR,
          message: getIamMessage('iam_initFailed'),
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

      return ok(undefined)
    },
  }
}

// =============================================================================
// 导出
// =============================================================================

/**
 * IAM 服务单例
 */
const iamInstance = createIamServiceInstance()

export const iam: IamEntry = Object.assign(iamInstance, {
  create: () => createIamServiceInstance(),
})
