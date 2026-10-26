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
import type { AuthResult, Session, SessionOperations } from '../session/iam-session-types.js'
import type { UserRepository } from '../user/iam-user-repository-user.js'
import type { User } from '../user/iam-user-types.js'
import type { ApiKeyStrategyResult } from './apikey/iam-authn-apikey-strategy.js'
import type { ApiKey, ApiKeyOperations } from './apikey/iam-authn-apikey-types.js'
import type { ApiKeyCredentials, AuthenticatedUser, AuthnOperations, AuthStrategy, Credentials, LdapCredentials, OtpCredentials, PasswordCredentials } from './iam-authn-types.js'
import type { LdapClientFactory } from './ldap/iam-authn-ldap-strategy.js'
import type { OtpStrategyResult } from './otp/iam-authn-otp-strategy.js'
import type { PasswordStrategyResult } from './password/iam-authn-password-strategy.js'

import { core, err, ok } from '@h-ai/core'

import { buildAgreementDisplay } from '../iam-agreement.js'
import { AgreementConfigSchema, ApiKeyConfigSchema, LoginConfigSchema, OtpConfigSchema, SecurityConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createDbUserRepository } from '../user/iam-user-repository-user.js'
import { checkPasswordState, isUserActive } from '../user/iam-user-utils.js'
import { createDbApiKeyRepository } from './apikey/iam-authn-apikey-repository.js'
import { applyApiKeyScopes } from './apikey/iam-authn-apikey-scope.js'
import { createApiKeyStrategy } from './apikey/iam-authn-apikey-strategy.js'
import { loadLdapClientFactory } from './ldap/iam-authn-ldap-client.js'
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
 * async function assemble(config: IamConfig, sessionFunctions: SessionOperations, authzFunctions: AuthzOperations) {
 *   const deps: AuthnOperationsDeps = { config, sessionFunctions, authzFunctions }
 *   return createAuthnOperations(deps)
 * }
 * ```
 */
export interface AuthnOperationsDeps {
  config: IamConfig
  sessionFunctions: SessionOperations
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
  loginRegisteredUser: (user: User) => Promise<HaiResult<AuthResult>>
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
    const { config, sessionFunctions, authzFunctions, ldapClientFactory, ldapSyncUser, onOtpSendEmail, onOtpSendSms } = deps

    const userRepository = await createDbUserRepository()
    const securityConfig = SecurityConfigSchema.parse(config.security ?? {})
    const loginConfig = LoginConfigSchema.parse(config.login ?? {})

    /**
     * 用户自动注册后分配默认角色的回调
     *
     * 供 OTP/LDAP 策略在自动创建用户后调用。
     */
    async function onUserAutoRegistered(userId: string): Promise<HaiResult<void>> {
      if (!config.rbac?.enabled || !config.rbac.defaultRole)
        return ok(undefined)
      const roleResult = await authzFunctions.getRoleByCode(config.rbac.defaultRole)
      if (!roleResult.success)
        return roleResult
      if (!roleResult.data)
        return err(HaiIamError.ROLE_NOT_FOUND, iamM('iam_roleNotExist'))
      return authzFunctions.assignRole(userId, roleResult.data.id)
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
    const otpConfig = config.otp ? OtpConfigSchema.parse(config.otp) : undefined
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
        onUserAutoRegistered,
        onOtpSendEmail,
        onOtpSendSms,
      })
    }

    // LDAP 策略
    let ldapStrategy: AuthStrategy | undefined
    if (loginConfig.ldap && config.ldap) {
      // 仅在启用目录认证且未注入工厂时加载可选 SDK；缺少 SDK 在 init 时返回配置错误。
      const clientFactory = ldapClientFactory ?? await loadLdapClientFactory()
      ldapStrategy = createLdapStrategy({
        ldapConfig: config.ldap,
        userRepository,
        ldapClientFactory: clientFactory,
        syncUser: ldapSyncUser ?? true,
        defaultEnabled: config.register.defaultEnabled,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutEnabled: securityConfig.lockoutEnabled,
        failureWindow: securityConfig.failureWindow,
        lockoutDuration: securityConfig.lockoutDuration,
        onUserAutoRegistered,
      })
    }

    // API Key 策略
    let apiKeyStrategy: ApiKeyStrategyResult['strategy'] | undefined
    let apiKeyFunctions: ApiKeyOperations | null = null
    if (loginConfig.apikey) {
      const apiKeyConfig = config.apikey ? ApiKeyConfigSchema.parse(config.apikey) : undefined
      const apiKeyRepository = await createDbApiKeyRepository()
      const apiKeyResult = createApiKeyStrategy({
        apikeyConfig: apiKeyConfig,
        userRepository,
        apiKeyRepository,
      })
      apiKeyStrategy = apiKeyResult.strategy
      apiKeyFunctions = apiKeyResult.apiKeyFunctions
    }

    // 组装认证操作
    const operations = buildAuthnOperations({
      passwordStrategy: passwordResult.strategy,
      otpStrategy: otpResult?.strategy,
      otpChallenge: otpResult?.challenge,
      ldapStrategy,
      apiKeyStrategy,
      sessionFunctions,
      authzFunctions,
      userRepository,
      config,
    })

    logger.info('Authn sub-feature initialized')
    return ok({ authn: operations.authn, loginRegisteredUser: operations.loginRegisteredUser, passwordStrategyResult: passwordResult, apiKeyFunctions })
  }
  catch (error) {
    logger.error('Authn sub-feature initialization failed', { error })
    return err(
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
 *   return deps.passwordStrategy.authenticate({ type: 'password', ...credentials })
 * }
 * ```
 */
interface BuildAuthnDeps {
  userRepository: UserRepository
  passwordStrategy: AuthStrategy
  otpStrategy?: AuthStrategy
  otpChallenge?: (identifier: string) => Promise<HaiResult<{ expiresAt: Date }>>
  ldapStrategy?: AuthStrategy
  apiKeyStrategy?: ApiKeyStrategyResult['strategy']
  sessionFunctions: SessionOperations
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
    authzFunctions,
    userRepository,
    config,
  } = deps

  const loginConfig = LoginConfigSchema.parse(config.login ?? {})
  const agreementConfig = AgreementConfigSchema.parse(config.agreements ?? {})

  /**
   * 检查指定登录方式是否被禁用
   *
   * @param type - 登录方式类型
   * @returns 禁用时返回错误 HaiResult，否则返回 null
   */
  function loginDisabled(type: 'password' | 'otp' | 'ldap' | 'apikey'): HaiResult<never> | null {
    if (!loginConfig[type]) {
      return err(
        HaiIamError.LOGIN_DISABLED,
        iamM('iam_loginDisabled', { params: { type } }),
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
      return ok(strategy)
    }

    if (type === 'otp') {
      return err(
        HaiIamError.STRATEGY_NOT_SUPPORTED,
        iamM('iam_otpStrategyRequired'),
      )
    }

    if (type === 'ldap') {
      return err(
        HaiIamError.STRATEGY_NOT_SUPPORTED,
        iamM('iam_ldapStrategyRequired'),
      )
    }

    return err(
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
  async function buildAuthResult(user: AuthenticatedUser, apiKey?: ApiKey): Promise<HaiResult<AuthResult>> {
    if (!user.enabled)
      return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
    if (!stored.data || !isUserActive(stored.data))
    const passwordState = checkPasswordState(stored.data, config.password)
    if (!passwordState.success)
      return passwordState
    const authorization = await authzFunctions.getUserAuthorization(user.id)
    if (!authorization.success)
      return authorization
    const access = authorization.data
    const effective = apiKey ? applyApiKeyScopes(access, apiKey.scopes) : access
    const sessionResult = await sessionFunctions.create({
      userId: user.id,
      expectedCredentialVersion: user.credentialVersion,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      ...effective,
      apiKeyId: apiKey?.id,
      apiKeyScopes: apiKey?.scopes,
    })

    if (!sessionResult.success) {
      return sessionResult as HaiResult<AuthResult>
    }

    const session = sessionResult.data

    // 从 session.data._tokenPair 提取 TokenPair（由 session.create 写入）
    const tokenPair = session.data?._tokenPair
    if (!tokenPair) {
      return err(HaiIamError.SESSION_CREATE_FAILED, iamM('iam_createSessionFailed'))
    }

    // 只有真正签发会话的登录才刷新最近使用时间；配额/重复登录拒绝不能延缓休眠。
    const { credentialVersion, ...publicUser } = user
    void credentialVersion
    return ok({
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
  ): Promise<HaiResult<AuthResult>> {
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
      return authResult as HaiResult<AuthResult>
    }

    const result = await buildAuthResult(authResult.data)
    if (result.success) {
      logger.info('Login succeeded', { type, userId: authResult.data.id })
    }
    return result
  }

  return { loginRegisteredUser: async (user) => {
    const stored = await userRepository.findById(user.id)
    if (!stored.success)
      return stored
    if (!stored.data || !isUserActive(stored.data))
      return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
    return buildAuthResult({ ...user, credentialVersion: stored.data.credentialVersion ?? '' })
  }, authn: {
    async login(credentials: PasswordCredentials): Promise<HaiResult<AuthResult>> {
      return loginWithStrategy('password', credentials, passwordStrategy)
    },

    async loginWithOtp(credentials: OtpCredentials): Promise<HaiResult<AuthResult>> {
      return loginWithStrategy('otp', credentials, otpStrategy)
    },

    async loginWithLdap(credentials: LdapCredentials): Promise<HaiResult<AuthResult>> {
      return loginWithStrategy('ldap', credentials, ldapStrategy)
    },

    async loginWithApiKey(credentials: ApiKeyCredentials): Promise<HaiResult<AuthResult>> {
      const disabled = loginDisabled('apikey')
      if (disabled)
        return disabled
      if (!apiKeyStrategy)
        return err(HaiIamError.STRATEGY_NOT_SUPPORTED, iamM('iam_featureNotImplemented'))
      const authenticated = await apiKeyStrategy.authenticate({ type: 'apikey', ...credentials })
      if (!authenticated.success)
        return authenticated
      return buildAuthResult(authenticated.data.user, authenticated.data.apiKey)
    },

    async logout(accessToken: string): Promise<HaiResult<void>> {
      // 不先读取/滑动 access；过期 access 对应的 refresh 也必须在同一次 CAS 中撤销。
      return sessionFunctions.delete(accessToken)
    },

    verifyToken: verifyCurrentSession,

    async sendOtp(identifier: string): Promise<HaiResult<{ expiresAt: Date }>> {
      const disabled = loginDisabled('otp')
      if (disabled) {
        return disabled as HaiResult<{ expiresAt: Date }>
      }

      if (!otpChallenge) {
        return err(
          HaiIamError.STRATEGY_NOT_SUPPORTED,
          iamM('iam_otpStrategyRequiredForSend'),
        )
      }

      return otpChallenge(identifier)
    },
  } }
}
