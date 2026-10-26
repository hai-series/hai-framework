/**
 * @h-ai/iam — IAM 服务主入口
 *
 * 管理运行时状态、实现生命周期（init / close）、通过 get 访问器暴露子功能。
 * @module iam-main
 */

import type { HaiResult } from '@h-ai/core'

import type { IamConfig } from './iam-config.js'
import type { IamPublicConfig } from './iam-public-config.js'
import type { ApiKeyOperations, AuthnOperations, AuthResult, AuthzOperations, IamConfigInput, IamFunctions, SessionOperations, TicketOperations, UserOperations } from './iam-types.js'

import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'

import { resetApiKeyRepoSingleton } from './authn/apikey/iam-authn-apikey-repository.js'
import { createAuthnOperations } from './authn/iam-authn-functions.js'
import { resetOtpRepoSingleton } from './authn/otp/iam-authn-otp-repository-otp.js'
import { createAuthzOperations } from './authz/iam-authz-functions.js'
import { resetPermissionRepoSingleton } from './authz/iam-authz-repository-permission.js'
import { resetRoleRepoSingleton } from './authz/iam-authz-repository-role.js'
import { observeApiKeys, observeAuth, observeAuthorization, observeSessions, observeUsers } from './iam-audit.js'
import { IamConfigSchema } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { migrateIam } from './iam-migration.js'
import { resolveIamNotifications } from './iam-notifications.js'
import { buildIamPublicConfig } from './iam-public-config.js'
import { seedIamData } from './iam-seed.js'
import {

  HaiIamError,

} from './iam-types.js'
import { createSessionOperations } from './session/iam-session-functions.js'
import { createTicketOperations } from './ticket/iam-ticket-functions.js'
import { createUserOperations } from './user/iam-user-functions.js'
import { createDbUserRepository, resetUserRepoSingleton } from './user/iam-user-repository-user.js'
import { checkPasswordState, isUserActive } from './user/iam-user-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'main' })

// ─── 内部状态 ───

/** init() 是否正在执行（并发防护） */
let initInProgress = false
let currentConfig: IamConfig | null = null
let currentPublicConfig: IamPublicConfig | null = null
let currentAuth: AuthnOperations | null = null
let currentUser: UserOperations | null = null
let currentAuthz: AuthzOperations | null = null
let currentSession: SessionOperations | null = null
let currentApiKey: ApiKeyOperations | null = null
let currentTicket: TicketOperations | null = null
let accountScanTimer: ReturnType<typeof setInterval> | undefined
let accountScanRunning: Promise<void> | undefined

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit(
  HaiIamError.NOT_INITIALIZED,
  () => iamM('iam_notInitialized'),
)

const notInitializedAuth = notInitialized.proxy<AuthnOperations>()
const notInitializedAuthz = notInitialized.proxy<AuthzOperations>()
const notInitializedSession = notInitialized.proxy<SessionOperations>()
const notInitializedApiKey = notInitialized.proxy<ApiKeyOperations>()
const notInitializedTicket = notInitialized.proxy<TicketOperations>()

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

/**
 * IAM 服务单例；应用先初始化共享 RelDB/Cache，再 init → use → close，子功能返回 HaiResult。
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * // Cache、RelDB、Crypto 已由应用按顺序初始化。
 * const initialized = await iam.init({ seedDefaultData: false })
 * if (initialized.success) {
 *   const result = await iam.user.getUser('user-1')
 *   if (result.success && result.data)
 *     result.data.username
 *   await iam.close()
 * }
 * ```
 */
export const iam: IamFunctions = {
  async init(config: IamConfigInput): Promise<HaiResult<void>> {
    // 并发防护：防止多次同时调用导致子功能/连接泄漏
    if (initInProgress) {
      logger.warn('IAM init already in progress, skipping concurrent call')
      return err(
        HaiIamError.CONFIG_ERROR,
        iamM('iam_initInProgress'),
      )
    }
    initInProgress = true

    try {
      if (currentConfig !== null) {
        logger.warn('IAM module is already initialized, reinitializing')
        await iam.close()
      }
      const { ldapClientFactory, ldapSyncUser } = config

      logger.info('Initializing IAM module')

      // 前置依赖检查：reldb 和 cache 必须已初始化
      if (!reldb.isInitialized) {
        return err(
          HaiIamError.CONFIG_ERROR,
          iamM('iam_depsNotInitialized', { params: { dep: 'reldb' } }),
        )
      }
      if (!cache.isInitialized) {
        return err(
          HaiIamError.CONFIG_ERROR,
          iamM('iam_depsNotInitialized', { params: { dep: 'cache' } }),
        )
      }

      // 确保 crypto 已初始化（密码哈希依赖）
      if (!crypto.isInitialized) {
        const cryptoResult = await crypto.init()
        if (!cryptoResult.success) {
          return err(
            HaiIamError.CONFIG_ERROR,
            iamM('iam_initFailed'),
            cryptoResult.error,
          )
        }
      }

      // Schema 只保留声明的设置字段，运行时模块和发送回调不会进入配置快照。
      const parseResult = IamConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('IAM config validation failed', { error: parseResult.error.message })
        return err(
          HaiIamError.CONFIG_ERROR,
          iamM('iam_configError', { params: { error: parseResult.error.message } }),
          parseResult.error,
        )
      }
      const parsed = parseResult.data

      // Reach 是可选的外部依赖；通知回调解析在基础依赖和配置验证成功后执行。
      const { onPasswordResetRequest, onOtpSendEmail, onOtpSendSms } = await resolveIamNotifications(config)
      logger.info('IAM notification channels resolved', { email: Boolean(onOtpSendEmail), sms: Boolean(onOtpSendSms), passwordReset: Boolean(onPasswordResetRequest) })

      // 创建子功能（按依赖顺序），使用局部变量暂存，全部成功后再原子性赋值
      const migration = await migrateIam()
      if (!migration.success)
        return migration
      const credentialUsers = await createDbUserRepository()
      const sessionResult = await createSessionOperations({
        config: parsed,
        readCredential: async (userId) => {
          const found = await credentialUsers.findById(userId)
          if (!found.success)
            return found
          if (found.data) {
            const passwordState = checkPasswordState(found.data, parsed.password)
            if (!passwordState.success)
              return passwordState
          }
          return ok(found.data ? { version: found.data.credentialVersion ?? '', enabled: isUserActive(found.data) } : null)
        },
      })
      if (!sessionResult.success) {
        return sessionResult
      }
      const sessions = observeSessions(sessionResult.data)

      const authzResult = await createAuthzOperations({ config: parsed, session: sessions })
      if (!authzResult.success) {
        return authzResult
      }
      const authorization = observeAuthorization(authzResult.data)

      const authnResult = await createAuthnOperations({
        config: parsed,
        sessionFunctions: sessions,
        authzFunctions: authorization,
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
        passwordStrategyResult: authnResult.data.passwordStrategyResult,
        sessionFunctions: sessions,
        authzFunctions: authorization,
        onPasswordResetRequest,
      })
      if (!userResult.success) {
        return userResult
      }
      const users = observeUsers(userResult.data)

      // 种子数据
      if (parsed.seedDefaultData) {
        const seedResult = await seedIamData(authorization)
        if (!seedResult.success) {
          return seedResult
        }
      }

      // 所有子功能创建成功，原子性赋值到模块状态
      currentSession = sessions
      currentAuthz = authorization
      currentUser = users
      currentConfig = parsed
      currentPublicConfig = buildIamPublicConfig(parsed, { ...config, onPasswordResetRequest, onOtpSendEmail, onOtpSendSms })
      currentApiKey = authnResult.data.apiKeyFunctions ? observeApiKeys(authnResult.data.apiKeyFunctions) : null
      // 一次性票据能力（仅依赖 cache + crypto，随 IAM 初始化即可用）
      currentTicket = createTicketOperations()

      // 组合 auth：注入 registerAndLogin（依赖 user + auth 两个子功能）
      const authn = authnResult.data.authn
      currentAuth = observeAuth({
        ...authn,
        async registerAndLogin(options, context) {
          const regResult = await currentUser!.register(options)
          if (!regResult.success) {
            return regResult as HaiResult<AuthResult>
          }
          return authnResult.data.loginRegisteredUser(regResult.data.user, context)
        },
      })
      if ((parsed.accounts?.dormantAfterDays ?? 0) > 0) {
        accountScanTimer = setInterval(() => {
          if (accountScanRunning)
            return
          accountScanRunning = users.scanInactiveAccounts().then((result) => {
            if (!result.success)
              logger.error('Inactive account scan failed', { error: result.error })
          }).catch((error: unknown) => {
            logger.error('Inactive account scan failed', { error })
          }).finally(() => { accountScanRunning = undefined })
        }, (parsed.accounts?.scanIntervalSeconds ?? 3600) * 1000)
        accountScanTimer.unref()
      }
      logger.info('IAM module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('IAM module initialization failed', { error })
      return err(
        HaiIamError.CONFIG_ERROR,
        iamM('iam_initFailed'),
        error,
      )
    }
    finally {
      initInProgress = false
    }
  },

  get auth(): AuthnOperations {
    return currentAuth ?? notInitializedAuth
  },
  get user(): UserOperations {
    return currentUser ?? notInitializedUser
  },
  get authz(): AuthzOperations {
    return currentAuthz ?? notInitializedAuthz
  },
  get session(): SessionOperations {
    return currentSession ?? notInitializedSession
  },
  get apiKey(): ApiKeyOperations {
    return currentApiKey ?? notInitializedApiKey
  },
  get ticket(): TicketOperations {
    return currentTicket ?? notInitializedTicket
  },
  get config() {
    return currentConfig ? core.sanitize.sanitizeSensitiveFields(currentConfig) : null
  },
  get publicConfig() {
    return currentPublicConfig ? structuredClone(currentPublicConfig) : null
  },
  get isInitialized() {
    return currentConfig !== null
  },
  get isRegisterEnabled() {
    return currentConfig?.register?.enabled !== false
  },

  async close() {
    if (currentConfig === null && currentAuth === null && currentUser === null && currentAuthz === null && currentSession === null) {
      logger.info('IAM module already closed, skipping')
      return
    }

    logger.info('Closing IAM module')
    clearInterval(accountScanTimer)
    accountScanTimer = undefined
    await accountScanRunning

    currentAuth = null
    currentUser = null
    currentAuthz = null
    currentSession = null
    currentApiKey = null
    currentTicket = null
    currentConfig = null
    currentPublicConfig = null

    // 重置所有仓库单例，释放对旧 db 实例的引用
    resetApiKeyRepoSingleton()
    resetOtpRepoSingleton()
    resetUserRepoSingleton()
    resetRoleRepoSingleton()
    resetPermissionRepoSingleton()

    logger.info('IAM module closed')
  },
}
