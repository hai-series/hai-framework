/**
 * @h-ai/iam — IAM 服务主入口
 *
 * 管理运行时状态、实现生命周期（init / close）、通过 get 访问器暴露子功能。
 * @module iam-main
 */

import type { HaiResult } from '@h-ai/core'
import type { IamConfig } from './iam-config.js'
import type { IamPublicConfig } from './iam-public-config.js'

import type { ApiKeyOperations, AuthnOperations, AuthzOperations, IamConfigInput, IamFunctions, SessionOperations, TicketOperations, UserOperations } from './iam-types.js'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'

import { resetApiKeyRepoSingleton } from './authn/apikey/iam-authn-apikey-repository.js'
import { createAuthnOperations, withIamRegistration } from './authn/iam-authn-functions.js'
import { resetOtpRepoSingleton } from './authn/otp/iam-authn-otp-repository-otp.js'
import { createAuthzOperations } from './authz/iam-authz-functions.js'
import { resetPermissionRepoSingleton } from './authz/iam-authz-repository-permission.js'
import { resetRoleRepoSingleton } from './authz/iam-authz-repository-role.js'
import { observeApiKeys, observeAuth, observeAuthorization, observeCredentialSessionRevocation, observeSessions, observeUsers } from './iam-audit.js'
import { startIamReadCacheMaintenance, stopIamReadCacheMaintenance } from './iam-cache.js'
import { IamConfigSchema } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { resolveIamNotifications } from './iam-notifications.js'
import { buildIamPublicConfig, readIamPublicConfig } from './iam-public-config.js'
import { readIamSessionCredential, readIamUserAccess } from './iam-security-cache.js'
import { seedIamData } from './iam-seed.js'
import {

  HaiIamError,

} from './iam-types.js'
import { createSessionOperations } from './session/iam-session-functions.js'
import { createTicketOperations } from './ticket/iam-ticket-functions.js'
import { createIamAccountScan } from './user/iam-user-account-scan.js'
import { createUserOperations } from './user/iam-user-functions.js'
import { createDbUserRepository, resetUserRepoSingleton } from './user/iam-user-repository-user.js'

const logger = core.logger.child({ module: 'iam', scope: 'main' })
const accountScan = createIamAccountScan(logger)

// ─── 内部状态 ───

let initInProgress: Promise<void> | undefined
let closeInProgress: Promise<void> | undefined
let currentConfig: IamConfig | null = null
let currentPublicConfig: IamPublicConfig | null = null
let currentAuth: AuthnOperations | null = null
let currentUser: UserOperations | null = null
let currentAuthz: AuthzOperations | null = null
let currentSession: SessionOperations | null = null
let currentApiKey: ApiKeyOperations | null = null
let currentTicket: TicketOperations | null = null

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

/** 释放用于准备当前运行期的仓库引用，包含初始化失败后尚未发布的实例。 */
function resetRepositorySingletons(): void {
  resetApiKeyRepoSingleton()
  resetOtpRepoSingleton()
  resetUserRepoSingleton()
  resetRoleRepoSingleton()
  resetPermissionRepoSingleton()
}

/** 清理已发布运行期；仅由持有生命周期执行权的初始化或关闭流程调用。 */
async function closeRuntime(): Promise<void> {
  if (!currentConfig)
    return

  logger.info('Closing IAM module')
  await accountScan.stop()
  await stopIamReadCacheMaintenance()

  currentAuth = null
  currentUser = null
  currentAuthz = null
  currentSession = null
  currentApiKey = null
  currentTicket = null
  currentConfig = null
  currentPublicConfig = null
  resetRepositorySingletons()

  logger.info('IAM module closed')
}

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
    if (initInProgress || closeInProgress) {
      logger.warn('IAM lifecycle operation already in progress, skipping initialization')
      return core.err(
        HaiIamError.CONFIG_ERROR,
        iamM('iam_initInProgress'),
      )
    }
    let resolveInit!: () => void
    initInProgress = new Promise<void>((resolve) => {
      resolveInit = resolve
    })

    try {
      if (currentConfig !== null) {
        logger.warn('IAM module is already initialized, reinitializing')
        await closeRuntime()
      }
      const { ldapClientFactory, ldapSyncUser } = config

      logger.info('Initializing IAM module')

      // 前置依赖检查：reldb 和 cache 必须已初始化
      if (!reldb.isInitialized) {
        return core.err(
          HaiIamError.CONFIG_ERROR,
          iamM('iam_depsNotInitialized', {
            params: { dep: 'reldb' },
          }),
        )
      }
      if (!cache.isInitialized) {
        return core.err(
          HaiIamError.CONFIG_ERROR,
          iamM('iam_depsNotInitialized', {
            params: { dep: 'cache' },
          }),
        )
      }

      // 确保 crypto 已初始化（密码哈希依赖）
      if (!crypto.isInitialized) {
        const cryptoResult = await crypto.init()
        if (!cryptoResult.success) {
          return core.err(
            HaiIamError.CONFIG_ERROR,
            iamM('iam_initFailed'),
            cryptoResult.error,
          )
        }
      }

      // Schema 只保留声明的设置字段，运行时模块和发送回调不会进入配置快照。
      const parseResult = IamConfigSchema.safeParse(config)
      if (!parseResult.success) {
        // 仅记录问题路径和校验说明，避免 JSON 字符串转义及配置值泄漏。
        const issues = parseResult.error.issues.map(issue => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
          message: issue.message,
        }))
        const fields = [
          ...new Set(issues.map(issue => issue.path).filter(Boolean)),
        ]
        logger.error('IAM config validation failed', { errorCode: HaiIamError.CONFIG_ERROR.code, issues })
        return core.err({
          ...HaiIamError.CONFIG_ERROR,
          message: iamM('iam_configError', {
            params: {
              error: fields.join(', '),
            },
          }),
          cause: parseResult.error,
          ext: { fields },
        })
      }
      const parsed = parseResult.data

      // Reach 是可选的外部依赖；通知回调解析在基础依赖和配置验证成功后执行。
      const { onPasswordResetRequest, onOtpSendEmail, onOtpSendSms } = await resolveIamNotifications(config)
      logger.info('IAM notification channels resolved', {
        email: Boolean(onOtpSendEmail),
        sms: Boolean(onOtpSendSms),
        passwordReset: Boolean(onPasswordResetRequest),
      })

      // 创建子功能（按依赖顺序），使用局部变量暂存，全部成功后再原子性赋值
      const credentialUsers = await createDbUserRepository()
      const sessionResult = await createSessionOperations({
        config: parsed,
        readCredential: userId => readIamSessionCredential(credentialUsers, parsed.password, userId),
      })
      if (!sessionResult.success) {
        return sessionResult
      }
      const { revokeCredentialSessions, verifyCurrentSession, ...sessionOperations } = sessionResult.data
      const sessions = observeSessions(sessionOperations)

      const authzResult = await createAuthzOperations({
        config: parsed,
        session: sessions,
        getUserAuthorization: async (userId) => {
          const found = await readIamUserAccess(credentialUsers, userId)
          return found.success
            ? core.ok(found.data.authorization)
            : found
        },
      })
      if (!authzResult.success) {
        return authzResult
      }
      const authorization = observeAuthorization(authzResult.data)

      const authnResult = await createAuthnOperations({
        config: parsed,
        sessionFunctions: sessions,
        verifyCurrentSession,
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
        revokeCredentialSessions: observeCredentialSessionRevocation(revokeCredentialSessions),
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

      const publicConfig = buildIamPublicConfig(parsed, {
        ...config,
        onPasswordResetRequest,
        onOtpSendEmail,
        onOtpSendSms,
      })
      const apiKey = authnResult.data.apiKeyFunctions
        ? observeApiKeys(authnResult.data.apiKeyFunctions)
        : null
      // 一次性票据能力（仅依赖 cache + crypto，随 IAM 初始化即可用）
      const ticket = createTicketOperations()

      const auth = observeAuth(withIamRegistration(authnResult.data, () => users))
      accountScan.start(users, parsed.accounts)
      startIamReadCacheMaintenance()

      // 所有子功能就绪后一次发布运行期。
      currentSession = sessions
      currentAuthz = authorization
      currentUser = users
      currentConfig = parsed
      currentPublicConfig = publicConfig
      currentApiKey = apiKey
      currentTicket = ticket
      currentAuth = auth
      logger.info('IAM module initialized')
      return core.ok(undefined)
    }
    catch (error) {
      logger.error('IAM module initialization failed', { error })
      return core.err(
        HaiIamError.CONFIG_ERROR,
        iamM('iam_initFailed'),
        error,
      )
    }
    finally {
      if (!currentConfig) {
        await stopIamReadCacheMaintenance()
        resetRepositorySingletons()
      }
      initInProgress = undefined
      resolveInit()
    }
  },

  get auth(): AuthnOperations {
    return currentAuth ?? notInitializedAuth
  },
  getPublicConfig: () => readIamPublicConfig(currentPublicConfig, currentAuthz, notInitialized.result),
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
    return currentConfig
      ? core.sanitize.sanitizeSensitiveFields(currentConfig)
      : null
  },
  get publicConfig() {
    return currentPublicConfig
      ? structuredClone(currentPublicConfig)
      : null
  },
  get isInitialized() {
    return currentConfig !== null
  },
  get isRegisterEnabled() {
    return currentConfig?.register?.enabled !== false
  },

  async close() {
    if (closeInProgress)
      return closeInProgress
    const initializing = initInProgress
    closeInProgress = (async () => {
      await initializing
      await closeRuntime()
    })()
    try {
      await closeInProgress
    }
    finally {
      closeInProgress = undefined
    }
  },
}
