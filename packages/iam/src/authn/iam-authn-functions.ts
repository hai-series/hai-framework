/**
 * @h-ai/iam — 认证子功能工厂
 *
 * 创建认证策略（密码/OTP/LDAP），组装成统一的认证操作接口。
 * @module iam-authn-functions
 */

import type { HaiResult } from '@h-ai/core'

import type { AuthzOperations } from '../authz/iam-authz-types.js'
import type { IamConfig } from '../iam-config.js'
import type { AuthResult, Session, SessionOperations } from '../session/iam-session-types.js'
import type { AgreementDisplay, User } from '../user/iam-user-types.js'
import type { ApiKeyOperations } from './apikey/iam-authn-apikey-types.js'
import type { ApiKeyCredentials, AuthnOperations, AuthStrategy, Credentials, LdapCredentials, OtpCredentials, PasswordCredentials } from './iam-authn-types.js'
import type { LdapClientFactory } from './ldap/iam-authn-ldap-strategy.js'
import type { OtpStrategyResult } from './otp/iam-authn-otp-strategy.js'
import type { PasswordStrategyResult } from './password/iam-authn-password-strategy.js'

import { core, err, ok } from '@h-ai/core'

import { AgreementConfigSchema, ApiKeyConfigSchema, LoginConfigSchema, OtpConfigSchema, SecurityConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createDbUserRepository } from '../user/iam-user-repository-user.js'
import { createDbApiKeyRepository } from './apikey/iam-authn-apikey-repository.js'
import { createApiKeyStrategy } from './apikey/iam-authn-apikey-strategy.js'
import { createLdapStrategy } from './ldap/iam-authn-ldap-strategy.js'
import { createCacheOtpRepository } from './otp/iam-authn-otp-repository-otp.js'
import { createOtpStrategy } from './otp/iam-authn-otp-strategy.js'
import { createPasswordStrategy } from './password/iam-authn-password-strategy.js'

const logger = core.logger.child({ module: 'iam', scope: 'authn' })

// ─── 子功能依赖 ───

/**
 * 认证子功能依赖
 */
export interface AuthnOperationsDeps {
  config: IamConfig
  sessionFunctions: SessionOperations
  authzFunctions: AuthzOperations
  ldapClientFactory?: LdapClientFactory
  ldapSyncUser?: boolean
  /** OTP 邮件发送回调（由业务层注入） */
  onOtpSendEmail?: (email: string, code: string) => Promise<void>
  /** OTP 短信发送回调（由业务层注入） */
  onOtpSendSms?: (phone: string, code: string) => Promise<void>
}

/**
 * 认证子功能工厂返回值
 *
 * 将公共 API 与内部依赖分离，避免将密码策略暴露在公共接口上。
 */
export interface AuthnOperationsResult {
  /** 对外暴露的认证操作（不含 registerAndLogin，由 iam-main 组合注入） */
  authn: Omit<AuthnOperations, 'registerAndLogin'>
  /** 密码策略结果（仅供内部 user 子功能复用，对外不可见） */
  passwordStrategyResult: PasswordStrategyResult
  /** API Key 管理操作（仅在启用 apikey 登录时可用） */
  apiKeyFunctions: ApiKeyOperations | null
}

/**
 * 创建认证子功能
 *
 * 内部创建密码/OTP/LDAP 策略，组装成统一的认证操作接口。
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
    async function onUserAutoRegistered(userId: string): Promise<void> {
      if (!config.rbac?.defaultRole)
        return
      const roleResult = await authzFunctions.getRoleByCode(config.rbac.defaultRole)
      if (roleResult.success && roleResult.data) {
        await authzFunctions.assignRole(userId, roleResult.data.id)
      }
    }

    // 密码策略
    const passwordResult = createPasswordStrategy({
      passwordConfig: config.password,
      userRepository,
      maxLoginAttempts: securityConfig.maxLoginAttempts,
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
        lockoutDuration: securityConfig.lockoutDuration,
        onUserAutoRegistered,
        onOtpSendEmail,
        onOtpSendSms,
      })
    }

    // LDAP 策略
    let ldapStrategy: AuthStrategy | undefined
    if (loginConfig.ldap && config.ldap && ldapClientFactory) {
      ldapStrategy = createLdapStrategy({
        ldapConfig: config.ldap,
        userRepository,
        ldapClientFactory,
        syncUser: ldapSyncUser ?? true,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutDuration: securityConfig.lockoutDuration,
        onUserAutoRegistered,
      })
    }

    // API Key 策略
    let apiKeyStrategy: AuthStrategy | undefined
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
      config,
    })

    logger.info('Authn sub-feature initialized')
    return ok({ authn: operations, passwordStrategyResult: passwordResult, apiKeyFunctions })
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

interface BuildAuthnDeps {
  passwordStrategy: AuthStrategy
  otpStrategy?: AuthStrategy
  otpChallenge?: (identifier: string) => Promise<HaiResult<{ expiresAt: Date }>>
  ldapStrategy?: AuthStrategy
  apiKeyStrategy?: AuthStrategy
  sessionFunctions: SessionOperations
  authzFunctions: AuthzOperations
  config: IamConfig
}

/**
 * 组装认证操作（纯同步，不涉及 I/O）
 *
 * 不含 registerAndLogin，该方法需要 userFunctions 依赖，由 iam-main 在初始化后组合注入。
 */
function buildAuthnOperations(deps: BuildAuthnDeps): Omit<AuthnOperations, 'registerAndLogin'> {
  const {
    passwordStrategy,
    otpStrategy,
    otpChallenge,
    ldapStrategy,
    apiKeyStrategy,
    sessionFunctions,
    authzFunctions,
    config,
  } = deps

  const loginConfig = LoginConfigSchema.parse(config.login ?? {})
  const agreementConfig = AgreementConfigSchema.parse(config.agreements ?? {})

  /**
   * 构建协议展示信息
   *
   * 根据配置决定是否在登录时展示用户协议/隐私协议链接。
   *
   * @returns 协议展示信息，或 undefined（未启用时）
   */
  function buildAgreementDisplay(): AgreementDisplay | undefined {
    if (!agreementConfig.showOnLogin) {
      return undefined
    }
    if (!agreementConfig.userAgreementUrl && !agreementConfig.privacyPolicyUrl) {
      return undefined
    }
    return {
      userAgreementUrl: agreementConfig.userAgreementUrl,
      privacyPolicyUrl: agreementConfig.privacyPolicyUrl,
      showOnRegister: agreementConfig.showOnRegister,
      showOnLogin: agreementConfig.showOnLogin,
    }
  }

  /**
   * 检查指定登录方式是否被禁用
   *
   * @param type - 登录方式类型
   * @returns 禁用时返回错误 Result，否则返回 null
   */
  function loginDisabled(type: 'password' | 'otp' | 'ldap' | 'apikey'): HaiResult<void> | null {
    if (!loginConfig[type]) {
      return err(
        HaiIamError.LOGIN_DISABLED,
        iamM('iam_loginDisabled', { params: { type } }),
      )
    }
    return null
  }

  /**
   * 查询用户角色 code 列表
   *
   * @param userId - 用户 ID
   * @returns 角色 code 数组
   */
  async function resolveUserRoleCodes(userId: string): Promise<HaiResult<string[]>> {
    const rolesResult = await authzFunctions.getUserRoles(userId)
    if (!rolesResult.success) {
      return rolesResult as HaiResult<string[]>
    }
    return ok(rolesResult.data.map(role => role.code))
  }

  /**
   * 查询用户权限 code 列表
   *
   * @param userId - 用户 ID
   * @returns 权限 code 数组
   */
  async function resolveUserPermissionCodes(userId: string): Promise<HaiResult<string[]>> {
    const permissionsResult = await authzFunctions.getUserPermissions(userId)
    if (!permissionsResult.success) {
      return permissionsResult as HaiResult<string[]>
    }
    return ok(permissionsResult.data.map(p => p.code))
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
  async function buildAuthResult(user: User): Promise<HaiResult<AuthResult>> {
    // 并行获取角色和权限，登录时一次性查 DB，后续纯缓存
    const [roleCodesResult, permCodesResult] = await Promise.all([
      resolveUserRoleCodes(user.id),
      resolveUserPermissionCodes(user.id),
    ])
    if (!roleCodesResult.success) {
      return roleCodesResult as HaiResult<AuthResult>
    }
    if (!permCodesResult.success) {
      return permCodesResult as HaiResult<AuthResult>
    }

    const sessionResult = await sessionFunctions.create({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      roles: roleCodesResult.data,
      permissions: permCodesResult.data,
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

    return ok({
      user,
      tokens: tokenPair,
      roles: roleCodesResult.data,
      permissions: permCodesResult.data,
      agreements: buildAgreementDisplay(),
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
    type: 'password' | 'otp' | 'ldap' | 'apikey',
    credentials: PasswordCredentials | OtpCredentials | LdapCredentials | ApiKeyCredentials,
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

  return {
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
      return loginWithStrategy('apikey', credentials, apiKeyStrategy)
    },

    async logout(accessToken: string): Promise<HaiResult<void>> {
      const sessionResult = await sessionFunctions.get(accessToken)
      if (sessionResult.success && sessionResult.data) {
        // 吊销 refreshToken，防止登出后被重用
        const tokenPair = sessionResult.data.data?._tokenPair
        if (tokenPair?.refreshToken) {
          await sessionFunctions.revokeRefresh(tokenPair.refreshToken)
        }
        await sessionFunctions.delete(sessionResult.data.accessToken)
        logger.info('User logged out', { userId: sessionResult.data.userId })
      }

      return ok(undefined)
    },

    async verifyToken(accessToken: string): Promise<HaiResult<Session>> {
      return sessionFunctions.verifyToken(accessToken)
    },

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
  }
}
