/**
 * @h-ai/iam — 认证子功能工厂
 *
 * 创建认证策略（密码/OTP/LDAP），组装成统一的认证操作接口。
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { Result } from '@h-ai/core'
import type { DbFunctions } from '@h-ai/db'

import type { IamAuthzFunctions } from '../authz/iam-authz-types.js'
import type { IamConfig } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
import type { AuthResult, IamSessionFunctions, Session } from '../session/iam-session-types.js'
import type { AgreementDisplay, User } from '../user/iam-user-types.js'
import type { AuthStrategy, Credentials, IamAuthnFunctions, LdapCredentials, OtpCredentials, PasswordCredentials } from './iam-authn-types.js'
import type { LdapClientFactory } from './ldap/iam-authn-ldap-strategy.js'
import type { OtpStrategy } from './otp/iam-authn-otp-strategy.js'
import type { PasswordStrategy } from './password/iam-authn-password-strategy.js'

import { core, err, ok } from '@h-ai/core'

import { AgreementConfigSchema, IamErrorCode, LoginConfigSchema, OtpConfigSchema, SecurityConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { createDbUserRepository } from '../user/iam-user-repository-user.js'
import { createLdapStrategy } from './ldap/iam-authn-ldap-strategy.js'
import { createCacheOtpRepository } from './otp/iam-authn-otp-repository-otp.js'
import { createOtpStrategy } from './otp/iam-authn-otp-strategy.js'
import { createPasswordStrategy } from './password/iam-authn-password-strategy.js'

const logger = core.logger.child({ module: 'iam', scope: 'authn' })

// ─── 子功能依赖 ───

/**
 * 认证子功能依赖
 */
export interface IamAuthnFunctionsDeps {
  config: IamConfig
  db: DbFunctions
  cache: CacheFunctions
  sessionFunctions: IamSessionFunctions
  authzFunctions: IamAuthzFunctions
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
export interface IamAuthnFunctionsResult {
  /** 对外暴露的认证操作 */
  authn: IamAuthnFunctions
  /** 密码策略引用（仅供内部 user 子功能复用，对外不可见） */
  passwordStrategy: PasswordStrategy
}

/**
 * 创建认证子功能
 *
 * 内部创建密码/OTP/LDAP 策略，组装成统一的认证操作接口。
 */
export async function createIamAuthnFunctions(deps: IamAuthnFunctionsDeps): Promise<Result<IamAuthnFunctionsResult, IamError>> {
  try {
    const { config, db, cache, sessionFunctions, authzFunctions, ldapClientFactory, ldapSyncUser, onOtpSendEmail, onOtpSendSms } = deps

    const userRepository = await createDbUserRepository(db)
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
    const passwordStrategy = createPasswordStrategy({
      passwordConfig: config.password,
      userRepository,
      maxLoginAttempts: securityConfig.maxLoginAttempts,
      lockoutDuration: securityConfig.lockoutDuration,
    })

    // OTP 策略
    let otpStrategy: OtpStrategy | undefined
    const otpConfig = config.otp ? OtpConfigSchema.parse(config.otp) : undefined
    if (loginConfig.otp && otpConfig) {
      const otpRepository = createCacheOtpRepository(cache, { onOtpSendEmail, onOtpSendSms })
      otpStrategy = createOtpStrategy({
        otpConfig,
        userRepository,
        otpRepository,
        autoRegister: true,
        registerConfig: config.register,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutDuration: securityConfig.lockoutDuration,
        onUserAutoRegistered,
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

    // 组装认证操作
    const operations = buildAuthnOperations({
      passwordStrategy,
      otpStrategy,
      ldapStrategy,
      sessionFunctions,
      authzFunctions,
      config,
    })

    logger.info('Authn sub-feature initialized')
    return ok({ authn: operations, passwordStrategy })
  }
  catch (error) {
    logger.error('Authn sub-feature initialization failed', { error })
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: iamM('iam_initComponentFailed'),
      cause: error,
    })
  }
}

// ─── 内部实现 ───

interface AuthnOperationsDeps {
  passwordStrategy: PasswordStrategy
  otpStrategy?: OtpStrategy
  ldapStrategy?: AuthStrategy
  sessionFunctions: IamSessionFunctions
  authzFunctions: IamAuthzFunctions
  config: IamConfig
}

/**
 * 组装认证操作（纯同步，不涉及 I/O）
 */
function buildAuthnOperations(deps: AuthnOperationsDeps): IamAuthnFunctions {
  const {
    passwordStrategy,
    otpStrategy,
    ldapStrategy,
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
  function loginDisabled(type: 'password' | 'otp' | 'ldap'): Result<void, IamError> | null {
    if (!loginConfig[type]) {
      return err({
        code: IamErrorCode.LOGIN_DISABLED,
        message: iamM('iam_loginDisabled', { params: { type } }),
      })
    }
    return null
  }

  /**
   * 查询用户角色 code 列表
   *
   * @param userId - 用户 ID
   * @returns 角色 code 数组
   */
  async function resolveUserRoleCodes(userId: string): Promise<Result<string[], IamError>> {
    const rolesResult = await authzFunctions.getUserRoles(userId)
    if (!rolesResult.success) {
      return rolesResult as Result<string[], IamError>
    }
    return ok(rolesResult.data.map(role => role.code))
  }

  /**
   * 查询用户权限 code 列表
   *
   * @param userId - 用户 ID
   * @returns 权限 code 数组
   */
  async function resolveUserPermissionCodes(userId: string): Promise<Result<string[], IamError>> {
    const permissionsResult = await authzFunctions.getUserPermissions(userId)
    if (!permissionsResult.success) {
      return permissionsResult as Result<string[], IamError>
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
  function resolveStrategy(type: 'password' | 'otp' | 'ldap', strategy?: AuthStrategy): Result<AuthStrategy, IamError> {
    if (strategy) {
      return ok(strategy)
    }

    if (type === 'otp') {
      return err({
        code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
        message: iamM('iam_otpStrategyRequired'),
      })
    }

    if (type === 'ldap') {
      return err({
        code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
        message: iamM('iam_ldapStrategyRequired'),
      })
    }

    return err({
      code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
      message: iamM('iam_featureNotImplemented'),
    })
  }

  /**
   * 构建认证结果
   *
   * 查询用户角色、创建会话、组装协议展示信息，返回完整的登录结果。
   *
   * @param user - 已认证的用户信息
   * @returns 包含用户信息、访问令牌、过期时间和协议展示的认证结果
   */
  async function buildAuthResult(user: User): Promise<Result<AuthResult, IamError>> {
    // 并行获取角色和权限，登录时一次性查 DB，后续纯缓存
    const [roleCodesResult, permCodesResult] = await Promise.all([
      resolveUserRoleCodes(user.id),
      resolveUserPermissionCodes(user.id),
    ])
    if (!roleCodesResult.success) {
      return roleCodesResult as Result<AuthResult, IamError>
    }
    if (!permCodesResult.success) {
      return permCodesResult as Result<AuthResult, IamError>
    }

    const sessionResult = await sessionFunctions.create({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      roleCodes: roleCodesResult.data,
      permissionCodes: permCodesResult.data,
    })

    if (!sessionResult.success) {
      return sessionResult as Result<AuthResult, IamError>
    }

    const session = sessionResult.data

    return ok({
      user,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.expiresAt,
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
    type: 'password' | 'otp' | 'ldap',
    credentials: PasswordCredentials | OtpCredentials | LdapCredentials,
    strategy?: AuthStrategy,
  ): Promise<Result<AuthResult, IamError>> {
    const disabled = loginDisabled(type)
    if (disabled)
      return disabled as Result<AuthResult, IamError>

    const strategyResult = resolveStrategy(type, strategy)
    if (!strategyResult.success)
      return strategyResult as Result<AuthResult, IamError>

    const authResult = await strategyResult.data.authenticate({
      type,
      ...credentials,
    } as Credentials)

    if (!authResult.success) {
      logger.warn('Login failed', { type, reason: authResult.error.code })
      return authResult as Result<AuthResult, IamError>
    }

    const result = await buildAuthResult(authResult.data)
    if (result.success) {
      logger.info('Login succeeded', { type, userId: authResult.data.id })
    }
    return result
  }

  return {
    async login(credentials: PasswordCredentials): Promise<Result<AuthResult, IamError>> {
      return loginWithStrategy('password', credentials, passwordStrategy)
    },

    async loginWithOtp(credentials: OtpCredentials): Promise<Result<AuthResult, IamError>> {
      return loginWithStrategy('otp', credentials, otpStrategy)
    },

    async loginWithLdap(credentials: LdapCredentials): Promise<Result<AuthResult, IamError>> {
      return loginWithStrategy('ldap', credentials, ldapStrategy)
    },

    async logout(accessToken: string): Promise<Result<void, IamError>> {
      const sessionResult = await sessionFunctions.get(accessToken)
      if (sessionResult.success && sessionResult.data) {
        await sessionFunctions.delete(sessionResult.data.accessToken)
        logger.info('User logged out', { userId: sessionResult.data.userId })
      }

      return ok(undefined)
    },

    async verifyToken(accessToken: string): Promise<Result<Session, IamError>> {
      return sessionFunctions.verifyToken(accessToken)
    },

    async sendOtp(identifier: string): Promise<Result<{ expiresAt: Date }, IamError>> {
      const disabled = loginDisabled('otp')
      if (disabled) {
        return disabled as Result<{ expiresAt: Date }, IamError>
      }

      if (!otpStrategy) {
        return err({
          code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
          message: iamM('iam_otpStrategyRequiredForSend'),
        })
      }

      return otpStrategy.challenge(identifier)
    },
  }
}
