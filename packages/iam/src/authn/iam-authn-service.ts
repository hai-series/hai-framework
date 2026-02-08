/**
 * =============================================================================
 * @hai/iam - 认证服务
 * =============================================================================
 *
 * 提供认证相关操作的实现。
 *
 * @module authn/iam-authn-service
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { AuthzManager } from '../authz/rbac/iam-authz-rbac-types.js'
import type { IamConfig } from '../iam-config.js'
import type { IamError } from '../iam-core-types.js'
import type { AuthResult, Session, SessionManager } from '../session/iam-session-types.js'
import type { AgreementDisplay, User } from '../user/iam-user-types.js'
import type { AuthOperations, AuthStrategy, Credentials, LdapCredentials, OtpCredentials, PasswordCredentials } from './iam-authn-types.js'
import type { OtpStrategy } from './otp/iam-authn-otp-strategy.js'
import type { PasswordStrategy } from './password/iam-authn-password-strategy.js'
import { core, err, ok } from '@hai/core'

import { AgreementConfigSchema, IamErrorCode, LoginConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

const logger = core.logger.child({ module: 'iam', scope: 'auth' })

/**
 * 认证服务依赖
 */
export interface AuthServiceDeps {
  /** 密码策略 */
  passwordStrategy: PasswordStrategy
  /** OTP 策略（可选） */
  otpStrategy?: OtpStrategy
  /** LDAP 策略（可选） */
  ldapStrategy?: AuthStrategy
  /** 会话管理器 */
  sessionManager: SessionManager
  /** 授权管理器 */
  authzManager: AuthzManager
  /** IAM 配置 */
  config: IamConfig
}

/**
 * 创建认证操作
 *
 * 将密码/OTP/LDAP 策略、会话管理器、授权管理器组装成统一的认证操作接口。
 *
 * @param deps - 依赖组件（策略、会话、授权、配置）
 * @returns 认证操作接口，包含 login / loginWithOtp / loginWithLdap / logout / verifyToken / sendOtp
 */
export function createAuthOperations(deps: AuthServiceDeps): AuthOperations {
  const {
    passwordStrategy,
    otpStrategy,
    ldapStrategy,
    sessionManager,
    authzManager,
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
   * 查询用户角色 ID 列表
   *
   * @param userId - 用户 ID
   * @returns 角色 ID 数组
   */
  async function resolveUserRoles(userId: string): Promise<Result<string[], IamError>> {
    const rolesResult = await authzManager.getUserRoles(userId)
    if (!rolesResult.success) {
      return rolesResult as Result<string[], IamError>
    }
    return ok(rolesResult.data.map(role => role.id))
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
    const rolesResult = await resolveUserRoles(user.id)
    if (!rolesResult.success) {
      return rolesResult as Result<AuthResult, IamError>
    }

    const sessionResult = await sessionManager.create({
      userId: user.id,
      username: user.username,
      roles: rolesResult.data,
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
      const sessionResult = await sessionManager.get(accessToken)
      if (sessionResult.success && sessionResult.data) {
        await sessionManager.delete(sessionResult.data.accessToken)
        logger.info('User logged out', { userId: sessionResult.data.userId })
      }

      return ok(undefined)
    },

    async verifyToken(accessToken: string): Promise<Result<Session, IamError>> {
      return sessionManager.verifyToken(accessToken)
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
