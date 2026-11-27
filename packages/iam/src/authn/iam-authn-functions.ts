/**
 * @h-ai/iam — 认证子功能工厂
 *
 * 创建认证策略（密码/OTP/LDAP），组装成统一的认证操作接口。
 * @module iam-authn-functions
 */

import type { HaiResult } from '@h-ai/core'
import type { AuthzOperations } from '../authz/iam-authz-types.js'
import type { IamConfig } from '../iam-config.js'
import type { IamConfigInput } from '../iam-types.js'
import type { AuthResult, SessionOperations } from '../session/iam-session-types.js'
import type { UserRepository } from '../user/iam-user-repository-user.js'
import type { User, UserOperations } from '../user/iam-user-types.js'
import type { ApiKeyStrategyResult } from './apikey/iam-authn-apikey-strategy.js'
import type { ApiKey, ApiKeyOperations } from './apikey/iam-authn-apikey-types.js'
import type { ApiKeyCredentials, AuthenticatedUser, AuthnOperations, AuthRequestContext, AuthStrategy, Credentials, LdapCredentials, OtpCredentials, PasswordCredentials } from './iam-authn-types.js'
import type { LdapClientFactory } from './ldap/iam-authn-ldap-strategy.js'
import type { OtpStrategyResult } from './otp/iam-authn-otp-strategy.js'

import type { PasswordStrategyResult } from './password/iam-authn-password-strategy.js'
import { core } from '@h-ai/core'

import { buildAgreementDisplay } from '../iam-agreement.js'
import { AgreementConfigSchema, ApiKeyConfigSchema, LoginConfigSchema, OtpConfigSchema, SecurityConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createTicketOperations } from '../ticket/iam-ticket-functions.js'
import { createDbUserRepository } from '../user/iam-user-repository-user.js'
import { checkPasswordState, isUserActive } from '../user/iam-user-utils.js'
import { createDbApiKeyRepository } from './apikey/iam-authn-apikey-repository.js'
import { applyApiKeyScopes } from './apikey/iam-authn-apikey-scope.js'
import { createApiKeyStrategy } from './apikey/iam-authn-apikey-strategy.js'
import { createLoginAccessCheck } from './iam-authn-access.js'
import { createIamCaptcha, verifyIamCaptcha } from './iam-authn-captcha.js'
import { rejectMissingPasswordCredentials } from './iam-authn-utils.js'
import { loadLdapClientFactory } from './ldap/iam-authn-ldap-client.js'
import { prepareLdapIdentities } from './ldap/iam-authn-ldap-repository.js'
import { createLdapStrategy } from './ldap/iam-authn-ldap-strategy.js'
import { createCacheOtpRepository } from './otp/iam-authn-otp-repository-otp.js'
import { createOtpStrategy } from './otp/iam-authn-otp-strategy.js'
import { createPasswordStrategy } from './password/iam-authn-password-strategy.js'

const logger = core.logger.child({ module: 'iam', scope: 'authn' })

// ─── 子功能依赖 ───

/**
 * 认证子功能依赖
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function assemble(config: IamConfig, sessionFunctions: SessionOperations, authzFunctions: AuthzOperations, verifyCurrentSession: AuthnOperations['verifyToken']) {
 *   const deps: AuthnOperationsDeps = { config, sessionFunctions, authzFunctions, verifyCurrentSession }
 *   return createAuthnOperations(deps)
 * }
 * ```
 */
export interface AuthnOperationsDeps {
  config: IamConfig
  sessionFunctions: SessionOperations
  /** 验证会话并返回从同一份账号记录读取的当前授权。 */
  verifyCurrentSession: AuthnOperations['verifyToken']
  authzFunctions: AuthzOperations
  ldapClientFactory?: LdapClientFactory
  ldapSyncUser?: boolean
  /** OTP 邮件发送回调（由业务层注入） */
  onOtpSendEmail?: IamConfigInput['onOtpSendEmail']
  /** OTP 短信发送回调（由业务层注入） */
  onOtpSendSms?: IamConfigInput['onOtpSendSms']
}

/**
 * 认证子功能工厂返回值
 *
 * 将公共 API 与内部依赖分离，避免将密码策略暴露在公共接口上。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function verify(operations: AuthnOperationsResult, token: string) {
 *   const result = await operations.authn.verifyToken(token)
 *   if (!result.success)
 *     return result
 *   return result.data.userId
 * }
 * ```
 */
export interface AuthnOperationsResult {
  /** 对外暴露的认证操作（不含 registerAndLogin，由 iam-main 组合注入） */
  authn: Omit<AuthnOperations, 'registerAndLogin'>
  /** 密码策略结果（仅供内部 user 子功能复用，对外不可见） */
  passwordStrategyResult: PasswordStrategyResult
  /** API Key 管理操作（仅在启用 apikey 登录时可用） */
  apiKeyFunctions: ApiKeyOperations | null
  /** 注册完成后直接创建会话，不受密码登录方式开关影响。 */
  loginRegisteredUser: (user: User, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
}

/**
 * 创建认证子功能
 *
 * 内部创建密码/OTP/LDAP 策略，组装成统一的认证操作接口。
 * @param deps - 由 IAM 生命周期按依赖顺序创建的内部组件。
 * @returns 成功返回数据，失败返回业务或基础设施错误；调用方必须先判断 success。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function assemble(deps: AuthnOperationsDeps) {
 *   const result = await createAuthnOperations(deps)
 *   if (!result.success)
 *     return result
 *   return result.data.authn.verifyToken('token-from-authorization-header')
 * }
 * ```
 */
export async function createAuthnOperations(deps: AuthnOperationsDeps): Promise<HaiResult<AuthnOperationsResult>> {
  try {
    const { config, sessionFunctions, verifyCurrentSession, authzFunctions, ldapClientFactory, ldapSyncUser, onOtpSendEmail, onOtpSendSms } = deps

    const userRepository = await createDbUserRepository()
    const securityConfig = SecurityConfigSchema.parse(config.security ?? {})
    const loginConfig = LoginConfigSchema.parse(config.login ?? {})

    /**
     * 自动注册时解析配置指定的默认角色。
     */
    async function getRegistrationRole(): Promise<HaiResult<string | null>> {
      if (!config.rbac?.enabled || !config.rbac.defaultRole)
        return core.ok(null)
      const roleResult = await authzFunctions.getRoleByCode(config.rbac.defaultRole)
      if (!roleResult.success)
        return roleResult
      if (!roleResult.data)
        return core.err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
      return core.ok(roleResult.data.id)
    }

    // 密码策略
    const passwordResult = createPasswordStrategy({
      passwordConfig: config.password,
      userRepository,
      maxLoginAttempts: securityConfig.maxLoginAttempts,
      lockoutEnabled: securityConfig.lockoutEnabled,
      failureWindow: securityConfig.failureWindow,
      lockoutDuration: securityConfig.lockoutDuration,
    })

    // OTP 策略
    let otpResult: OtpStrategyResult | undefined
    const otpConfig = config.otp
      ? OtpConfigSchema.parse(config.otp)
      : undefined
    if (loginConfig.otp && otpConfig) {
      const otpRepository = createCacheOtpRepository()
      otpResult = createOtpStrategy({
        otpConfig,
        userRepository,
        otpRepository,
        autoRegister: true,
        registerConfig: config.register,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutEnabled: securityConfig.lockoutEnabled,
        failureWindow: securityConfig.failureWindow,
        lockoutDuration: securityConfig.lockoutDuration,
        getRegistrationRole,
        assignRegistrationRole: authzFunctions.assignRole,
        onOtpSendEmail,
        onOtpSendSms,
      })
    }

    // LDAP 策略
    let ldapStrategy: AuthStrategy | undefined
    if (loginConfig.ldap) {
      if (!config.ldap?.directoryId)
        return core.err(HaiIamError.CONFIG_ERROR, iamM('iam_ldapDirectoryRequired'))
      // 仅在启用目录认证且未注入工厂时加载可选 SDK；缺少 SDK 在 init 时返回配置错误。
      const clientFactory = ldapClientFactory ?? await loadLdapClientFactory()
      const storage = await prepareLdapIdentities()
      if (!storage.success)
        return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_ldapRepositoryFailed'), storage.error)
      ldapStrategy = createLdapStrategy({
        ldapConfig: config.ldap,
        directoryId: config.ldap.directoryId,
        userRepository,
        ldapClientFactory: clientFactory,
        syncUser: ldapSyncUser ?? true,
        defaultAccountStatus: config.register.defaultAccountStatus,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutEnabled: securityConfig.lockoutEnabled,
        failureWindow: securityConfig.failureWindow,
        lockoutDuration: securityConfig.lockoutDuration,
        getRegistrationRole,
        assignRegistrationRole: authzFunctions.assignRole,
      })
    }

    // API Key 策略
    let apiKeyStrategy: ApiKeyStrategyResult['strategy'] | undefined
    let apiKeyFunctions: ApiKeyOperations | null = null
    if (loginConfig.apikey) {
      const apiKeyConfig = config.apikey
        ? ApiKeyConfigSchema.parse(config.apikey)
        : undefined
      const apiKeyRepository = await createDbApiKeyRepository()
      const apiKeyResult = createApiKeyStrategy({
        apikeyConfig: apiKeyConfig,
        userRepository,
        apiKeyRepository,
        getUserAuthorization: authzFunctions.getUserAuthorization,
      })
      apiKeyStrategy = apiKeyResult.strategy
      apiKeyFunctions = apiKeyResult.apiKeyFunctions
    }

    // 组装认证操作
    const operations = buildAuthnOperations({
      passwordStrategy: passwordResult,
      otpStrategy: otpResult?.strategy,
      otpChallenge: otpResult?.challenge,
      ldapStrategy,
      apiKeyStrategy,
      sessionFunctions,
      verifyCurrentSession,
      authzFunctions,
      userRepository,
      config,
    })

    logger.info('Authn sub-feature initialized')
    return core.ok({
      authn: operations.authn,
      loginRegisteredUser: operations.loginRegisteredUser,
      passwordStrategyResult: passwordResult,
      apiKeyFunctions,
    })
  }
  catch (error) {
    logger.error('Authn sub-feature initialization failed', { error })
    return core.err(
      HaiIamError.CONFIG_ERROR,
      iamM('iam_initComponentFailed'),
      error,
    )
  }
}

// ─── 内部实现 ───

/**
 * 认证操作内部装配依赖；策略只产出可信身份快照，会话发布由统一流程执行。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function passwordLogin(deps: BuildAuthnDeps, credentials: PasswordCredentials) {
 *   return deps.passwordStrategy.strategy.authenticate({ type: 'password', ...credentials })
 * }
 * ```
 */
interface BuildAuthnDeps {
  userRepository: UserRepository
  passwordStrategy: PasswordStrategyResult
  otpStrategy?: AuthStrategy
  otpChallenge?: (identifier: string) => Promise<HaiResult<{ expiresAt: Date }>>
  ldapStrategy?: AuthStrategy
  apiKeyStrategy?: ApiKeyStrategyResult['strategy']
  sessionFunctions: SessionOperations
  verifyCurrentSession: AuthnOperations['verifyToken']
  authzFunctions: AuthzOperations
  config: IamConfig
}

/**
 * 组装认证操作（纯同步，不涉及 I/O）
 *
 * 不含 registerAndLogin，该方法需要 userFunctions 依赖，由 iam-main 在初始化后组合注入。
 */
function buildAuthnOperations(deps: BuildAuthnDeps): Pick<AuthnOperationsResult, 'authn' | 'loginRegisteredUser'> {
  const {
    passwordStrategy,
    otpStrategy,
    otpChallenge,
    ldapStrategy,
    apiKeyStrategy,
    sessionFunctions,
    verifyCurrentSession,
    authzFunctions,
    userRepository,
    config,
  } = deps

  const loginConfig = LoginConfigSchema.parse(config.login ?? {})
  const agreementConfig = AgreementConfigSchema.parse(config.agreements ?? {})
  const checkAccess = createLoginAccessCheck(config.loginAccess)

  /**
   * 检查指定登录方式是否被禁用
   *
   * @param type - 登录方式类型
   * @returns 禁用时返回错误 HaiResult，否则返回 null
   */
  function loginDisabled(type: 'password' | 'otp' | 'ldap' | 'apikey'): HaiResult<never> | null {
    if (!loginConfig[type]) {
      return core.err(
        HaiIamError.LOGIN_DISABLED,
        iamM('iam_loginDisabled', {
          params: { type },
        }),
      )
    }
    return null
  }

  /**
   * 解析认证策略实例
   *
   * 根据登录类型获取对应的策略实例，若策略未注册则返回错误。
   *
   * @param type - 登录方式类型
   * @param strategy - 已注册的策略实例（可选）
   * @returns 策略实例，或策略不支持错误
   */
  function resolveStrategy(type: 'password' | 'otp' | 'ldap' | 'apikey', strategy?: AuthStrategy): HaiResult<AuthStrategy> {
    if (strategy) {
      return core.ok(strategy)
    }

    if (type === 'otp') {
      return core.err(
        HaiIamError.STRATEGY_NOT_SUPPORTED,
        iamM('iam_otpStrategyRequired'),
      )
    }

    if (type === 'ldap') {
      return core.err(
        HaiIamError.STRATEGY_NOT_SUPPORTED,
        iamM('iam_ldapStrategyRequired'),
      )
    }

    return core.err(
      HaiIamError.STRATEGY_NOT_SUPPORTED,
      iamM('iam_featureNotImplemented'),
    )
  }

  /**
   * 构建认证结果
   *
   * 查询用户角色、创建会话、组装协议展示信息，返回完整的登录结果。
   *
   * @param user - 已认证的用户信息
   * @returns 包含用户信息、访问令牌、过期时间和协议展示的认证结果
   */
  async function buildAuthResult(user: AuthenticatedUser, apiKey?: ApiKey, context?: AuthRequestContext): Promise<HaiResult<AuthResult>> {
    const permitted = checkAccess(context)
    if (!permitted.success)
      return permitted
    if (!isUserActive(user))
      return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
    const stored = await userRepository.findById(user.id)
    if (!stored.success)
      return stored
    if (!stored.data || !isUserActive(stored.data))
      return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
    const passwordState = checkPasswordState(stored.data, config.password)
    if (!passwordState.success)
      return passwordState
    const authorization = await authzFunctions.getUserAuthorization(user.id)
    if (!authorization.success)
      return authorization
    const access = authorization.data
    const effective = apiKey
      ? applyApiKeyScopes(access, apiKey.scopes)
      : access
    const sessionResult = await sessionFunctions.create({
      userId: user.id,
      expectedCredentialVersion: user.credentialVersion,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      ...effective,
      apiKeyId: apiKey?.id,
      apiKeyScopes: apiKey?.scopes,
      terminalType: context?.terminalType ?? (apiKey ? 'api' : 'web'),
    })

    if (!sessionResult.success) {
      return sessionResult as HaiResult<AuthResult>
    }

    const session = sessionResult.data

    // 令牌对来自本次会话签发的返回值。
    const tokenPair = session.data?._tokenPair
    if (!tokenPair) {
      return core.err(HaiIamError.SESSION_CREATE_FAILED, iamM('iam_createSessionFailed'))
    }

    // 只有真正签发会话的登录才刷新最近使用时间；配额/重复登录拒绝不能延缓休眠。
    const recorded = await userRepository.recordSuccessfulLogin(user.id)
    if (!recorded.success) {
      const revoked = await sessionFunctions.delete(session.accessToken)
      if (!revoked.success)
        logger.error('Failed to revoke session after login timestamp write failure', { userId: user.id, error: revoked.error })
      return recorded
    }

    const { credentialVersion, ...publicUser } = user
    void credentialVersion
    return core.ok({
      user: publicUser,
      tokens: tokenPair,
      ...effective,
      agreements: buildAgreementDisplay(agreementConfig, agreementConfig.showOnLogin),
    })
  }

  /**
   * 通用策略登录流程
   *
   * 检查登录方式是否启用→解析策略→执行认证→构建结果。
   *
   * @param type - 登录方式
   * @param credentials - 用户凭证
   * @param strategy - 认证策略实例（可选）
   * @returns 认证结果（包含用户、令牌、协议）
   */
  async function loginWithStrategy(
    type: 'password' | 'otp' | 'ldap',
    credentials: PasswordCredentials | OtpCredentials | LdapCredentials,
    strategy?: AuthStrategy,
    context?: AuthRequestContext,
  ): Promise<HaiResult<AuthResult>> {
    const captcha = await verifyIamCaptcha(config.captcha, 'login', credentials.captcha)
    if (!captcha.success)
      return captcha
    const permitted = checkAccess(context)
    if (!permitted.success)
      return permitted
    const disabled = loginDisabled(type)
    if (disabled)
      return disabled as HaiResult<AuthResult>

    const strategyResult = resolveStrategy(type, strategy)
    if (!strategyResult.success)
      return strategyResult as HaiResult<AuthResult>

    const authResult = await strategyResult.data.authenticate({
      type,
      ...credentials,
    } as Credentials)

    if (!authResult.success) {
      logger.warn('Login failed', { type, reason: authResult.error.code })
      // 不公开生命周期或锁定状态，也不让受限账号继续充当密码/验证码猜测的反馈源。
      if (authResult.error.code === HaiIamError.ACCOUNT_UNAVAILABLE.code || authResult.error.code === HaiIamError.USER_LOCKED.code)
        return rejectMissingPasswordCredentials()
      return authResult as HaiResult<AuthResult>
    }

    if (credentials.expectedUserId && credentials.expectedUserId !== authResult.data.id)
      return core.err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
    const result = await buildAuthResult(authResult.data, undefined, context)
    if (!result.success && (result.error.code === HaiIamError.ACCOUNT_UNAVAILABLE.code || result.error.code === HaiIamError.USER_LOCKED.code)) {
      logger.warn('Account eligibility changed during login', { type, userId: authResult.data.id, reason: result.error.code })
      return core.err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
    }
    if (result.success) {
      logger.info('Login succeeded', { type, userId: authResult.data.id })
    }
    return result
  }

  const tickets = createTicketOperations()
  const sensitive = config.reauthentication
  async function requiresProof(operation: string): Promise<HaiResult<boolean>> {
    if (!sensitive?.enabled)
      return core.ok(false)
    if (sensitive.operations.includes(operation))
      return core.ok(true)
    const configured = await authzFunctions.getSensitiveOperations(operation)
    if (!configured.success)
      return configured
    return core.ok(sensitive.operations.includes(operation) || configured.data.includes(operation))
  }

  return {
    loginRegisteredUser: async (user, context) => {
      const stored = await userRepository.findById(user.id)
      if (!stored.success)
        return stored
      if (!stored.data || !isUserActive(stored.data))
        return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
      return buildAuthResult({ ...user, credentialVersion: stored.data.credentialVersion ?? '' }, undefined, context)
    },
    authn: {
      createCaptcha: input => createIamCaptcha(config.captcha, input),
      async reauthenticate(accessToken, password, operation) {
        const required = await requiresProof(operation)
        if (!required.success)
          return required
        if (!required.data)
          return core.err(HaiIamError.PERMISSION_DENIED, iamM('iam_reauthenticationRequired'))
        const current = await verifyCurrentSession(accessToken)
        if (!current.success)
          return current
        const verified = await passwordStrategy.authenticateUser(current.data.userId, password)
        if (!verified.success)
          return verified
        if (verified.data.credentialVersion !== current.data.credentialVersion)
          return core.err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
        return tickets.issue({
          subjectId: current.data.userId,
          purpose: `iam:reauth:${operation}`,
          ttlMs: sensitive!.ttlSeconds * 1000,
          grant: { operation, sessionVersion: current.data.version, credentialVersion: current.data.credentialVersion },
        })
      },

      async checkSensitiveOperation(accessToken, operation, ticket) {
        const current = await verifyCurrentSession(accessToken)
        if (!current.success)
          return current
        const required = await requiresProof(operation)
        if (!required.success)
          return required
        if (!required.data)
          return core.ok(undefined)
        if (!ticket)
          return core.err(HaiIamError.REAUTHENTICATION_REQUIRED, iamM('iam_reauthenticationRequired'))
        const proof = await tickets.consume(ticket, { purpose: `iam:reauth:${operation}` })
        if (!proof.success)
          return proof
        if (proof.data.subjectId !== current.data.userId || proof.data.grant.operation !== operation || proof.data.grant.sessionVersion !== current.data.version || proof.data.grant.credentialVersion !== current.data.credentialVersion)
          return core.err(HaiIamError.REAUTHENTICATION_REQUIRED, iamM('iam_reauthenticationRequired'))
        return core.ok(undefined)
      },

      async login(credentials: PasswordCredentials, context?: AuthRequestContext): Promise<HaiResult<AuthResult>> {
        return loginWithStrategy('password', credentials, passwordStrategy.strategy, context)
      },

      async loginWithOtp(credentials: OtpCredentials, context?: AuthRequestContext): Promise<HaiResult<AuthResult>> {
        return loginWithStrategy('otp', credentials, otpStrategy, context)
      },

      async loginWithLdap(credentials: LdapCredentials, context?: AuthRequestContext): Promise<HaiResult<AuthResult>> {
        return loginWithStrategy('ldap', credentials, ldapStrategy, context)
      },

      async loginWithApiKey(credentials: ApiKeyCredentials, context?: AuthRequestContext): Promise<HaiResult<AuthResult>> {
        const disabled = loginDisabled('apikey')
        if (disabled)
          return disabled
        if (!apiKeyStrategy)
          return core.err(HaiIamError.STRATEGY_NOT_SUPPORTED, iamM('iam_featureNotImplemented'))
        const authenticated = await apiKeyStrategy.authenticate({ type: 'apikey', ...credentials })
        if (!authenticated.success)
          return authenticated
        return buildAuthResult(authenticated.data.user, authenticated.data.apiKey, context)
      },

      async logout(accessToken: string): Promise<HaiResult<void>> {
      // 不先读取/滑动 access；过期 access 对应的 refresh 也必须在同一次 CAS 中撤销。
        return sessionFunctions.delete(accessToken)
      },

      verifyToken: verifyCurrentSession,

      async sendOtp(identifier: string, options?: { captcha?: string }): Promise<HaiResult<{ expiresAt: Date }>> {
        const captcha = await verifyIamCaptcha(config.captcha, 'sendOtp', options?.captcha)
        if (!captcha.success)
          return captcha
        const disabled = loginDisabled('otp')
        if (disabled) {
          return disabled as HaiResult<{ expiresAt: Date }>
        }

        if (!otpChallenge) {
          return core.err(
            HaiIamError.STRATEGY_NOT_SUPPORTED,
            iamM('iam_otpStrategyRequiredForSend'),
          )
        }

        return otpChallenge(identifier)
      },
    },
  }
}

/**
 * 在注册成功后通过当前认证运行期建立会话。
 * @param operations - 当前运行期建立会话的认证操作。
 * @param currentUsers - 发起注册时获取该模块的用户操作。
 * @returns 包含注册并登录的认证操作；注册失败时不建立会话。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function connectRegistration(operations: AuthnOperationsResult, users: UserOperations) {
 *   return withIamRegistration(operations, () => users).registerAndLogin
 * }
 * ```
 */
export function withIamRegistration(operations: AuthnOperationsResult, currentUsers: () => UserOperations): AuthnOperations {
  return {
    ...operations.authn,
    async registerAndLogin(options, context) {
      const result = await currentUsers().register(options)
      if (!result.success)
        return result
      return operations.loginRegisteredUser(result.data.user, context)
    },
  }
}
