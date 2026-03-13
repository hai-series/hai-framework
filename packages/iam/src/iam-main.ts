/**
 * @h-ai/iam — IAM 服务主入口
 *
 * 管理运行时状态、实现生命周期（init / close）、通过 get 访问器暴露子功能。
 * @module iam-main
 */

import type { Result } from '@h-ai/core'

import type { IamConfig } from './iam-config.js'
import type {
  ApiKeyOperations,
  AuthnOperations,
  AuthResult,
  AuthzOperations,
  IamConfigInput,
  IamError,
  IamFunctions,
  SessionOperations,
  UserOperations,
} from './iam-types.js'

import { core, err, ok } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'

import { resetApiKeyRepoSingleton } from './authn/apikey/iam-authn-apikey-repository.js'
import { createAuthnOperations } from './authn/iam-authn-functions.js'
import { resetOtpRepoSingleton } from './authn/otp/iam-authn-otp-repository-otp.js'
import { createAuthzOperations } from './authz/iam-authz-functions.js'
import { resetPermissionRepoSingleton } from './authz/iam-authz-repository-permission.js'
import { resetRoleRepoSingleton } from './authz/iam-authz-repository-role.js'
import { IamConfigSchema, IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { seedIamData } from './iam-seed.js'
import { createSessionOperations } from './session/iam-session-functions.js'
import { createUserOperations } from './user/iam-user-functions.js'
import { resetResetTokenRepoSingleton } from './user/iam-user-repository-reset-token.js'
import { resetUserRepoSingleton } from './user/iam-user-repository-user.js'

const logger = core.logger.child({ module: 'iam', scope: 'main' })

// ─── 内部状态 ───

let currentConfig: IamConfig | null = null
let currentAuth: AuthnOperations | null = null
let currentUser: UserOperations | null = null
let currentAuthz: AuthzOperations | null = null
let currentSession: SessionOperations | null = null
let currentApiKey: ApiKeyOperations | null = null

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<IamError>(
  IamErrorCode.NOT_INITIALIZED,
  () => iamM('iam_notInitialized'),
)

const notInitializedAuth = notInitialized.proxy<AuthnOperations>()
const notInitializedAuthz = notInitialized.proxy<AuthzOperations>()
const notInitializedSession = notInitialized.proxy<SessionOperations>()
const notInitializedApiKey = notInitialized.proxy<ApiKeyOperations>()

/**
 * 用户子功能的未初始化代理
 *
 * 需要特殊处理 validatePassword：该方法是同步的，
 * 其余方法为异步，因此不能统一使用 proxy('async') 或 proxy('sync')。
 */
const syncUserProxy = notInitialized.proxy<UserOperations>('sync')
const asyncUserProxy = notInitialized.proxy<UserOperations>()
const notInitializedUser: UserOperations = new Proxy({} as UserOperations, {
  get(_, prop, receiver) {
    return prop === 'validatePassword'
      ? Reflect.get(syncUserProxy as object, prop, receiver)
      : Reflect.get(asyncUserProxy as object, prop, receiver)
  },
})

// ─── 服务对象 ───

export const iam: IamFunctions = {
  async init(config: IamConfigInput): Promise<Result<void, IamError>> {
    if (currentConfig !== null) {
      logger.warn('IAM module is already initialized, reinitializing')
      await iam.close()
    }

    try {
      const { db, cache, ldapClientFactory, ldapSyncUser, onPasswordResetRequest, onOtpSendEmail, onOtpSendSms, ...settingsInput } = config

      logger.info('Initializing IAM module')

      // 确保 crypto 已初始化（密码哈希依赖）
      if (!crypto.isInitialized) {
        const cryptoResult = await crypto.init()
        if (!cryptoResult.success) {
          return err({
            code: IamErrorCode.CONFIG_ERROR,
            message: iamM('iam_initFailed'),
            cause: cryptoResult.error,
          })
        }
      }

      const parseResult = IamConfigSchema.safeParse(settingsInput)
      if (!parseResult.success) {
        logger.error('IAM config validation failed', { error: parseResult.error.message })
        return err({
          code: IamErrorCode.CONFIG_ERROR,
          message: iamM('iam_configError', { params: { error: parseResult.error.message } }),
          cause: parseResult.error,
        })
      }
      const parsed = parseResult.data

      // 创建子功能（按依赖顺序），使用局部变量暂存，全部成功后再原子性赋值
      const sessionResult = await createSessionOperations({ config: parsed, cache })
      if (!sessionResult.success) {
        return sessionResult
      }

      const authzResult = await createAuthzOperations({ config: parsed, db, cache })
      if (!authzResult.success) {
        return authzResult
      }

      const authnResult = await createAuthnOperations({
        config: parsed,
        db,
        cache,
        sessionFunctions: sessionResult.data,
        authzFunctions: authzResult.data,
        ldapClientFactory,
        ldapSyncUser,
        onOtpSendEmail,
        onOtpSendSms,
      })
      if (!authnResult.success) {
        return authnResult
      }

      const userResult = await createUserOperations({
        config: parsed,
        db,
        cache,
        passwordStrategy: authnResult.data.passwordStrategy,
        sessionFunctions: sessionResult.data,
        authzFunctions: authzResult.data,
        onPasswordResetRequest,
      })
      if (!userResult.success) {
        return userResult
      }

      // 种子数据
      if (parsed.seedDefaultData) {
        const seedResult = await seedIamData(authzResult.data)
        if (!seedResult.success) {
          return seedResult
        }
      }

      // 所有子功能创建成功，原子性赋值到模块状态
      currentSession = sessionResult.data
      currentAuthz = authzResult.data
      currentUser = userResult.data
      currentConfig = parsed
      currentApiKey = authnResult.data.apiKeyFunctions

      // 组合 auth：注入 registerAndLogin（依赖 user + auth 两个子功能）
      const authn = authnResult.data.authn
      currentAuth = {
        ...authn,
        async registerAndLogin(options) {
          const regResult = await currentUser!.register(options)
          if (!regResult.success) {
            return regResult as Result<AuthResult, IamError>
          }
          return authn.login({ identifier: options.username, password: options.password })
        },
      }
      logger.info('IAM module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('IAM module initialization failed', { error })
      return err({
        code: IamErrorCode.CONFIG_ERROR,
        message: iamM('iam_initFailed'),
        cause: error,
      })
    }
  },

  get auth(): AuthnOperations { return currentAuth ?? notInitializedAuth },
  get user(): UserOperations { return currentUser ?? notInitializedUser },
  get authz(): AuthzOperations { return currentAuthz ?? notInitializedAuthz },
  get session(): SessionOperations { return currentSession ?? notInitializedSession },
  get apiKey(): ApiKeyOperations { return currentApiKey ?? notInitializedApiKey },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },
  get isRegisterEnabled() { return currentConfig?.register?.enabled !== false },

  async close() {
    if (currentConfig === null && currentAuth === null && currentUser === null && currentAuthz === null && currentSession === null) {
      logger.info('IAM module already closed, skipping')
      return
    }

    logger.info('Closing IAM module')

    currentAuth = null
    currentUser = null
    currentAuthz = null
    currentSession = null
    currentApiKey = null
    currentConfig = null

    // 重置所有仓库单例，释放对旧 db 实例的引用
    resetApiKeyRepoSingleton()
    resetOtpRepoSingleton()
    resetUserRepoSingleton()
    resetResetTokenRepoSingleton()
    resetRoleRepoSingleton()
    resetPermissionRepoSingleton()

    logger.info('IAM module closed')
  },
}
