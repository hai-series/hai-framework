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
import type { IamConfig } from '../iam-config.js'
import type { IamError } from '../iam-core-types.js'
import type { AuthResult, RefreshResult, SessionManager, TokenPayload } from '../session/iam-session-types.js'
import type { AgreementDisplay } from '../user/iam-user-types.js'
import type { AuthOperations, AuthStrategy, LdapCredentials, OtpCredentials, PasswordCredentials } from './iam-authn-types.js'
import type { OtpStrategy } from './otp/iam-authn-otp-strategy.js'
import type { PasswordStrategy } from './password/iam-authn-password-strategy.js'
import { err, ok } from '@hai/core'

import { AgreementConfigSchema, IamErrorCode, LoginConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

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
  /** IAM 配置 */
  config: IamConfig
}

/**
 * 创建认证操作
 *
 * @param deps - 依赖组件
 * @returns 认证操作接口
 */
export function createAuthOperations(deps: AuthServiceDeps): AuthOperations {
  const {
    passwordStrategy,
    otpStrategy,
    ldapStrategy,
    sessionManager,
    config,
  } = deps

  const loginConfig = LoginConfigSchema.parse(config.login ?? {})
  const agreementConfig = AgreementConfigSchema.parse(config.agreements ?? {})

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

  function loginDisabled(type: 'password' | 'otp' | 'ldap'): Result<void, IamError> | null {
    if (!loginConfig[type]) {
      return err({
        code: IamErrorCode.LOGIN_DISABLED,
        message: iamM('iam_loginDisabled', { params: { type } }),
      })
    }
    return null
  }

  return {
    async login(credentials: PasswordCredentials): Promise<Result<AuthResult, IamError>> {
      const disabled = loginDisabled('password')
      if (disabled) {
        return disabled as Result<AuthResult, IamError>
      }

      // 使用密码策略认证
      const authResult = await passwordStrategy.authenticate({
        type: 'password',
        ...credentials,
      })

      if (!authResult.success) {
        return authResult as Result<AuthResult, IamError>
      }

      const user = authResult.data

      // 创建会话
      const sessionResult = await sessionManager.create({
        userId: user.id,
        username: user.username,
      })

      if (!sessionResult.success) {
        return sessionResult as Result<AuthResult, IamError>
      }

      const session = sessionResult.data

      return ok({
        user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: session.expiresAt,
        refreshTokenExpiresAt: session.expiresAt,
        agreements: buildAgreementDisplay(),
      })
    },

    async loginWithOtp(credentials: OtpCredentials): Promise<Result<AuthResult, IamError>> {
      const disabled = loginDisabled('otp')
      if (disabled) {
        return disabled as Result<AuthResult, IamError>
      }

      if (!otpStrategy) {
        return err({
          code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
          message: iamM('iam_otpStrategyRequired'),
        })
      }

      const authResult = await otpStrategy.authenticate({
        type: 'otp',
        ...credentials,
      })

      if (!authResult.success) {
        return authResult as Result<AuthResult, IamError>
      }

      const user = authResult.data

      const sessionResult = await sessionManager.create({
        userId: user.id,
        username: user.username,
      })

      if (!sessionResult.success) {
        return sessionResult as Result<AuthResult, IamError>
      }

      const session = sessionResult.data

      return ok({
        user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: session.expiresAt,
        refreshTokenExpiresAt: session.expiresAt,
        agreements: buildAgreementDisplay(),
      })
    },

    async loginWithLdap(credentials: LdapCredentials): Promise<Result<AuthResult, IamError>> {
      const disabled = loginDisabled('ldap')
      if (disabled) {
        return disabled as Result<AuthResult, IamError>
      }

      if (!ldapStrategy) {
        return err({
          code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
          message: iamM('iam_ldapStrategyRequired'),
        })
      }

      const authResult = await ldapStrategy.authenticate({
        type: 'ldap',
        ...credentials,
      })

      if (!authResult.success) {
        return authResult as Result<AuthResult, IamError>
      }

      const user = authResult.data

      const sessionResult = await sessionManager.create({
        userId: user.id,
        username: user.username,
      })

      if (!sessionResult.success) {
        return sessionResult as Result<AuthResult, IamError>
      }

      const session = sessionResult.data

      return ok({
        user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: session.expiresAt,
        refreshTokenExpiresAt: session.expiresAt,
        agreements: buildAgreementDisplay(),
      })
    },

    async logout(accessToken: string): Promise<Result<void, IamError>> {
      const sessionResult = await sessionManager.getByToken(accessToken)
      if (sessionResult.success && sessionResult.data) {
        await sessionManager.delete(sessionResult.data.id)
      }

      return ok(undefined)
    },

    async refresh(refreshToken: string): Promise<Result<RefreshResult, IamError>> {
      return sessionManager.refresh(refreshToken)
    },

    async verifyToken(accessToken: string): Promise<Result<TokenPayload, IamError>> {
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
