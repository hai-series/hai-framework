/**
 * @h-ai/iam — IAM 服务主入口
 *
 * 管理运行时状态、实现生命周期（init / close）、通过 get 访问器暴露子功能。
 * @module iam-main
 */

import type { Result } from '@h-ai/core'

import type { IamConfig } from './iam-config.js'
import type {
  IamAuthnFunctions,
  IamAuthzFunctions,
  IamConfigInput,
  IamError,
  IamFunctions,
  IamSessionFunctions,
  IamUserFunctions,
} from './iam-types.js'

import { core, err, ok } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'

import { createIamAuthnFunctions } from './authn/iam-authn-functions.js'
import { resetOtpRepoSingleton } from './authn/otp/iam-authn-otp-repository-otp.js'
import { createIamAuthzFunctions } from './authz/iam-authz-functions.js'
import { resetPermissionRepoSingleton } from './authz/iam-authz-repository-permission.js'
import { resetRoleRepoSingleton } from './authz/iam-authz-repository-role.js'
import { IamConfigSchema, IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { seedIamData } from './iam-seed.js'
import { createIamSessionFunctions } from './session/iam-session-functions.js'
import { createIamUserFunctions } from './user/iam-user-functions.js'
import { resetResetTokenRepoSingleton } from './user/iam-user-repository-reset-token.js'
import { resetUserRepoSingleton } from './user/iam-user-repository-user.js'

const logger = core.logger.child({ module: 'iam', scope: 'main' })

// ─── 内部状态 ───

let currentConfig: IamConfig | null = null
let currentAuth: IamAuthnFunctions | null = null
let currentUser: IamUserFunctions | null = null
let currentAuthz: IamAuthzFunctions | null = null
let currentSession: IamSessionFunctions | null = null

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<IamError>(
  IamErrorCode.NOT_INITIALIZED,
  () => iamM('iam_notInitialized'),
)

const notInitializedAuth = notInitialized.proxy<IamAuthnFunctions>()
const notInitializedAuthz = notInitialized.proxy<IamAuthzFunctions>()
const notInitializedSession = notInitialized.proxy<IamSessionFunctions>()

/**
 * 用户子功能的未初始化代理
 *
 * 需要特殊处理 validatePassword：该方法是同步的，
 * 其余方法为异步，因此不能统一使用 proxy('async') 或 proxy('sync')。
 */
const syncUserProxy = notInitialized.proxy<IamUserFunctions>('sync')
const asyncUserProxy = notInitialized.proxy<IamUserFunctions>()
const notInitializedUser: IamUserFunctions = new Proxy({} as IamUserFunctions, {
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

      // 创建子功能（按依赖顺序）
      const sessionResult = await createIamSessionFunctions({ config: parsed, cache })
      if (!sessionResult.success) {
        return sessionResult
      }
      currentSession = sessionResult.data

      const authzResult = await createIamAuthzFunctions({ config: parsed, db, cache })
      if (!authzResult.success) {
        return authzResult
      }
      currentAuthz = authzResult.data

      const authnResult = await createIamAuthnFunctions({
        config: parsed,
        db,
        cache,
        sessionFunctions: currentSession,
        authzFunctions: currentAuthz,
        ldapClientFactory,
        ldapSyncUser,
        onOtpSendEmail,
        onOtpSendSms,
      })
      if (!authnResult.success) {
        return authnResult
      }
      currentAuth = authnResult.data.authn

      const userResult = await createIamUserFunctions({
        config: parsed,
        db,
        cache,
        passwordStrategy: authnResult.data.passwordStrategy,
        sessionFunctions: currentSession,
        authzFunctions: currentAuthz,
        onPasswordResetRequest,
      })
      if (!userResult.success) {
        return userResult
      }
      currentUser = userResult.data

      // 种子数据
      if (parsed.seedDefaultData) {
        const seedResult = await seedIamData(currentAuthz)
        if (!seedResult.success) {
          return seedResult
        }
      }

      currentConfig = parsed
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

  get auth(): IamAuthnFunctions { return currentAuth ?? notInitializedAuth },
  get user(): IamUserFunctions { return currentUser ?? notInitializedUser },
  get authz(): IamAuthzFunctions { return currentAuthz ?? notInitializedAuthz },
  get session(): IamSessionFunctions { return currentSession ?? notInitializedSession },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

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
    currentConfig = null

    // 重置所有仓库单例，释放对旧 db 实例的引用
    resetOtpRepoSingleton()
    resetUserRepoSingleton()
    resetResetTokenRepoSingleton()
    resetRoleRepoSingleton()
    resetPermissionRepoSingleton()

    logger.info('IAM module closed')
  },
}
