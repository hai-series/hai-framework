/**
 * =============================================================================
 * @hai/iam - 认证服务
 * =============================================================================
 *
 * 提供认证相关操作的实现。
 * 将认证逻辑从 iam-main.ts 中提取出来。
 *
 * @module service/iam-service-auth
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { IamConfig } from '../iam-config.js'
import type {
  AgreementDisplay,
  AuthOperations,
  AuthResult,
  IamError,
  LdapCredentials,
  OAuthCredentials,
  OtpCredentials,
  PasswordCredentials,
  RefreshResult,
  SessionManager,
  TokenPayload,
  UserRepository,
} from '../iam-types.js'
import type { OAuthStrategy, OtpStrategy, PasswordStrategy } from '../strategy/index.js'
import { err, ok } from '@hai/core'

import { AgreementConfigSchema, IamErrorCode, LoginConfigSchema } from '../iam-config.js'
import { getIamMessage } from '../iam-i18n.js'

/**
 * 认证服务依赖
 */
export interface AuthServiceDeps {
  /** 用户存储 */
  userRepository: UserRepository
  /** 密码策略 */
  passwordStrategy: PasswordStrategy
  /** OTP 策略（可选） */
  otpStrategy?: OtpStrategy
  /** OAuth 策略（可选） */
  oauthStrategy?: OAuthStrategy
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
    oauthStrategy,
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

  function loginDisabled(type: 'password' | 'otp' | 'ldap' | 'oauth'): Result<void, IamError> | null {
    if (!loginConfig[type]) {
      return err({
        code: IamErrorCode.LOGIN_DISABLED,
        message: getIamMessage('iam_loginDisabled', { params: { type } }),
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
          message: getIamMessage('iam_otpStrategyRequired'),
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

    async loginWithLdap(_credentials: LdapCredentials): Promise<Result<AuthResult, IamError>> {
      const disabled = loginDisabled('ldap')
      if (disabled) {
        return disabled as Result<AuthResult, IamError>
      }

      return err({
        code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
        message: getIamMessage('iam_ldapStrategyRequired'),
      })
    },

    async getOAuthUrl(providerId: string, returnUrl?: string): Promise<Result<{ url: string, state: string }, IamError>> {
      const disabled = loginDisabled('oauth')
      if (disabled) {
        return disabled as Result<{ url: string, state: string }, IamError>
      }

      if (!oauthStrategy) {
        return err({
          code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
          message: getIamMessage('iam_oauthStrategyRequired'),
        })
      }

      const result = await oauthStrategy.getAuthorizationUrl(providerId, returnUrl)
      if (!result.success) {
        return result as Result<{ url: string, state: string }, IamError>
      }

      return ok({
        url: result.data.url,
        state: result.data.state.state,
      })
    },

    async handleOAuthCallback(credentials: OAuthCredentials): Promise<Result<AuthResult, IamError>> {
      const disabled = loginDisabled('oauth')
      if (disabled) {
        return disabled as Result<AuthResult, IamError>
      }

      if (!oauthStrategy) {
        return err({
          code: IamErrorCode.STRATEGY_NOT_SUPPORTED,
          message: getIamMessage('iam_oauthStrategyRequired'),
        })
      }

      const authResult = await oauthStrategy.authenticate({
        type: 'oauth',
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
          message: getIamMessage('iam_otpStrategyRequiredForSend'),
        })
      }

      return otpStrategy.challenge(identifier)
    },
  }
}
