/**
 * =============================================================================
 * @hai/iam - OAuth 认证策略
 * =============================================================================
 *
 * OAuth2 第三方登录认证方式
 *
 * @module iam-strategy-oauth
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AuthStrategy,
  Credentials,
  IamError,
  OAuthAccountRepository,
  OAuthConfig,
  OAuthProviderConfig,
  OAuthState,
  OAuthStateStore,
  OAuthTokens,
  OAuthUserInfo,
  StoredUser,
  User,
  UserRepository,
} from '../iam-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode, OAuthConfigSchema } from '../iam-config.js'
import { getIamMessage } from '../index.js'

/**
 * OAuth 认证策略配置
 */
export interface OAuthStrategyConfig {
  /** OAuth 配置 */
  oauthConfig?: OAuthConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** OAuth 账户存储 */
  oauthAccountRepository: OAuthAccountRepository
  /** OAuth 状态存储 */
  oauthStateStore: OAuthStateStore
  /** 是否允许自动注册新用户 */
  autoRegister?: boolean
}

/**
 * 生成安全的状态令牌
 */
function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const length = 32
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

/**
 * 创建 OAuth 认证策略
 */
export function createOAuthStrategy(config: OAuthStrategyConfig): OAuthStrategy {
  const oauthConfig = config.oauthConfig
    ? OAuthConfigSchema.parse(config.oauthConfig)
    : OAuthConfigSchema.parse({})

  const providers = new Map<string, OAuthProviderConfig>()
  for (const provider of oauthConfig.providers) {
    providers.set(provider.id, provider)
  }

  /**
   * 将 StoredUser 转换为 User（移除敏感信息）
   */
  function toUser(storedUser: StoredUser): User {
    return {
      id: storedUser.id,
      username: storedUser.username,
      email: storedUser.email,
      phone: storedUser.phone,
      displayName: storedUser.displayName,
      avatarUrl: storedUser.avatarUrl,
      enabled: storedUser.enabled,
      emailVerified: storedUser.emailVerified,
      phoneVerified: storedUser.phoneVerified,
      createdAt: storedUser.createdAt,
      updatedAt: storedUser.updatedAt,
      metadata: storedUser.metadata,
    }
  }

  return {
    type: 'oauth',
    name: 'oauth-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      // 类型检查
      if (credentials.type !== 'oauth') {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: getIamMessage('iam_credentialTypeMismatch'),
        })
      }

      const { providerId, code, state } = credentials

      // 获取提供商配置
      const provider = providers.get(providerId)
      if (!provider) {
        return err({
          code: IamErrorCode.OAUTH_PROVIDER_NOT_FOUND,
          message: getIamMessage('iam_oauthProviderNotFound', undefined, { providerId }),
        })
      }

      // 验证状态
      const storedStateResult = await config.oauthStateStore.get(state)
      if (!storedStateResult.success) {
        return storedStateResult as Result<User, IamError>
      }

      const storedState = storedStateResult.data
      if (!storedState) {
        return err({
          code: IamErrorCode.OAUTH_INVALID_STATE,
          message: getIamMessage('iam_invalidStateToken'),
        })
      }

      if (new Date() > storedState.expiresAt) {
        await config.oauthStateStore.delete(state)
        return err({
          code: IamErrorCode.OAUTH_INVALID_STATE,
          message: getIamMessage('iam_stateTokenExpired'),
        })
      }

      // 删除已使用的状态
      await config.oauthStateStore.delete(state)

      // 交换授权码获取令牌
      const tokensResult = await exchangeCode(provider, code)
      if (!tokensResult.success) {
        return tokensResult as Result<User, IamError>
      }

      const tokens = tokensResult.data

      // 获取用户信息
      const userInfoResult = await fetchUserInfo(provider, tokens.accessToken)
      if (!userInfoResult.success) {
        return userInfoResult as Result<User, IamError>
      }

      const oauthUserInfo = userInfoResult.data

      // 查找已关联的账户
      const accountResult = await config.oauthAccountRepository.findByProvider(providerId, oauthUserInfo.providerId)
      if (!accountResult.success) {
        return accountResult as Result<User, IamError>
      }

      let storedUser: StoredUser | null = null

      if (accountResult.data) {
        // 已有关联，获取用户
        const userResult = await config.userRepository.findById(accountResult.data.userId)
        if (!userResult.success) {
          return userResult as Result<User, IamError>
        }
        storedUser = userResult.data

        // 更新 OAuth 令牌
        await config.oauthAccountRepository.update(accountResult.data.userId, providerId, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
        })
      }
      else if (config.autoRegister !== false) {
        // 未关联，尝试通过邮箱查找用户或创建新用户
        if (oauthUserInfo.email) {
          const existingUserResult = await config.userRepository.findByEmail(oauthUserInfo.email)
          if (existingUserResult.success && existingUserResult.data) {
            storedUser = existingUserResult.data
          }
        }

        if (!storedUser) {
          // 创建新用户
          const username = oauthUserInfo.username || oauthUserInfo.email || `${providerId}_${oauthUserInfo.providerId}`
          const createResult = await config.userRepository.create({
            username,
            email: oauthUserInfo.email,
            displayName: oauthUserInfo.displayName,
            avatarUrl: oauthUserInfo.avatarUrl,
            enabled: true,
            emailVerified: !!oauthUserInfo.email,
            metadata: {
              authSource: 'oauth',
              oauthProvider: providerId,
            },
          })
          if (!createResult.success) {
            return createResult as Result<User, IamError>
          }
          storedUser = createResult.data
        }

        // 创建 OAuth 账户关联
        await config.oauthAccountRepository.create({
          userId: storedUser.id,
          providerId,
          providerUserId: oauthUserInfo.providerId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
        })
      }

      if (!storedUser) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: getIamMessage('iam_userNotExistNoAutoRegister'),
        })
      }

      // 检查账户状态
      if (!storedUser.enabled) {
        return err({
          code: IamErrorCode.USER_DISABLED,
          message: getIamMessage('iam_accountDisabled'),
        })
      }

      return ok(toUser(storedUser))
    },

    async getAuthorizationUrl(providerId: string, returnUrl?: string): Promise<Result<{ url: string, state: OAuthState }, IamError>> {
      const provider = providers.get(providerId)
      if (!provider) {
        return err({
          code: IamErrorCode.OAUTH_PROVIDER_NOT_FOUND,
          message: getIamMessage('iam_oauthProviderNotFound', undefined, { providerId }),
        })
      }

      const stateValue = generateState()
      const oauthState: OAuthState = {
        state: stateValue,
        returnUrl,
        expiresAt: new Date(Date.now() + oauthConfig.stateExpiresIn * 1000),
      }

      // 存储状态
      const storeResult = await config.oauthStateStore.set(stateValue, oauthState)
      if (!storeResult.success) {
        return storeResult as Result<{ url: string, state: OAuthState }, IamError>
      }

      const params = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: provider.redirectUrl,
        response_type: 'code',
        scope: provider.scopes.join(' '),
        state: stateValue,
      })

      const url = `${provider.authorizationUrl}?${params.toString()}`

      return ok({ url, state: oauthState })
    },

    async getUserInfo(providerId: string, accessToken: string): Promise<Result<OAuthUserInfo, IamError>> {
      const provider = providers.get(providerId)
      if (!provider) {
        return err({
          code: IamErrorCode.OAUTH_PROVIDER_NOT_FOUND,
          message: getIamMessage('iam_oauthProviderNotFound', undefined, { providerId }),
        })
      }

      return fetchUserInfo(provider, accessToken)
    },

    async refreshToken(providerId: string, refreshToken: string): Promise<Result<OAuthTokens, IamError>> {
      const provider = providers.get(providerId)
      if (!provider) {
        return err({
          code: IamErrorCode.OAUTH_PROVIDER_NOT_FOUND,
          message: getIamMessage('iam_oauthProviderNotFound', undefined, { providerId }),
        })
      }

      try {
        const response = await fetch(provider.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: provider.clientId,
            client_secret: provider.clientSecret,
          }),
        })

        if (!response.ok) {
          return err({
            code: IamErrorCode.OAUTH_TOKEN_ERROR,
            message: getIamMessage('iam_refreshTokenFailed'),
          })
        }

        const data = await response.json() as {
          access_token: string
          refresh_token?: string
          id_token?: string
          token_type: string
          expires_in: number
          scope?: string
        }

        return ok({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          idToken: data.id_token,
          tokenType: data.token_type,
          expiresIn: data.expires_in,
          scope: data.scope,
        })
      }
      catch (error) {
        return err({
          code: IamErrorCode.OAUTH_TOKEN_ERROR,
          message: getIamMessage('iam_refreshTokenRequestFailed'),
          cause: error,
        })
      }
    },

    async linkAccount(userId: string, providerId: string, code: string, state: string): Promise<Result<void, IamError>> {
      // 验证状态
      const storedStateResult = await config.oauthStateStore.get(state)
      if (!storedStateResult.success || !storedStateResult.data) {
        return err({
          code: IamErrorCode.OAUTH_INVALID_STATE,
          message: getIamMessage('iam_invalidStateToken'),
        })
      }

      await config.oauthStateStore.delete(state)

      const provider = providers.get(providerId)
      if (!provider) {
        return err({
          code: IamErrorCode.OAUTH_PROVIDER_NOT_FOUND,
          message: `OAuth 提供商 '${providerId}' 不存在`,
        })
      }

      // 交换授权码
      const tokensResult = await exchangeCode(provider, code)
      if (!tokensResult.success) {
        return tokensResult as Result<void, IamError>
      }

      // 获取用户信息
      const userInfoResult = await fetchUserInfo(provider, tokensResult.data.accessToken)
      if (!userInfoResult.success) {
        return userInfoResult as Result<void, IamError>
      }

      // 检查是否已被其他用户关联
      const existingResult = await config.oauthAccountRepository.findByProvider(providerId, userInfoResult.data.providerId)
      if (existingResult.success && existingResult.data && existingResult.data.userId !== userId) {
        return err({
          code: IamErrorCode.OAUTH_CALLBACK_ERROR,
          message: getIamMessage('iam_oauthAccountLinkedByOther'),
        })
      }

      // 创建关联
      await config.oauthAccountRepository.create({
        userId,
        providerId,
        providerUserId: userInfoResult.data.providerId,
        accessToken: tokensResult.data.accessToken,
        refreshToken: tokensResult.data.refreshToken,
        tokenExpiresAt: tokensResult.data.expiresIn ? new Date(Date.now() + tokensResult.data.expiresIn * 1000) : undefined,
      })

      return ok(undefined)
    },

    async unlinkAccount(userId: string, providerId: string): Promise<Result<void, IamError>> {
      return config.oauthAccountRepository.delete(userId, providerId)
    },
  }
}

/**
 * 交换授权码获取令牌
 */
async function exchangeCode(provider: OAuthProviderConfig, code: string): Promise<Result<OAuthTokens, IamError>> {
  try {
    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: provider.redirectUrl,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      }),
    })

    if (!response.ok) {
      return err({
        code: IamErrorCode.OAUTH_TOKEN_ERROR,
        message: getIamMessage('iam_exchangeCodeFailed'),
      })
    }

    const data = await response.json() as {
      access_token: string
      refresh_token?: string
      id_token?: string
      token_type: string
      expires_in: number
      scope?: string
    }

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      scope: data.scope,
    })
  }
  catch (error) {
    return err({
      code: IamErrorCode.OAUTH_TOKEN_ERROR,
      message: getIamMessage('iam_tokenRequestFailed'),
      cause: error,
    })
  }
}

/**
 * 获取 OAuth 用户信息
 */
async function fetchUserInfo(provider: OAuthProviderConfig, accessToken: string): Promise<Result<OAuthUserInfo, IamError>> {
  if (!provider.userInfoUrl) {
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: getIamMessage('iam_userInfoUrlNotConfigured'),
    })
  }

  try {
    const response = await fetch(provider.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return err({
        code: IamErrorCode.OAUTH_TOKEN_ERROR,
        message: getIamMessage('iam_getUserInfoFailed'),
      })
    }

    const data = await response.json() as Record<string, unknown>

    // 标准化用户信息（不同提供商格式不同）
    const userInfo: OAuthUserInfo = {
      providerId: String(data.id || data.sub || ''),
      email: data.email as string | undefined,
      username: (data.login as string | undefined) || (data.username as string | undefined),
      displayName: data.name as string | undefined,
      avatarUrl: (data.avatar_url as string | undefined) || (data.picture as string | undefined),
      raw: data,
    }

    return ok(userInfo)
  }
  catch (error) {
    return err({
      code: IamErrorCode.OAUTH_TOKEN_ERROR,
      message: getIamMessage('iam_getUserInfoRequestFailed'),
      cause: error,
    })
  }
}

/**
 * 扩展的 OAuth 策略接口
 */
export interface OAuthStrategy extends AuthStrategy {
  /**
   * 获取授权 URL
   */
  getAuthorizationUrl: (providerId: string, returnUrl?: string) => Promise<Result<{ url: string, state: OAuthState }, IamError>>

  /**
   * 获取用户信息
   */
  getUserInfo: (providerId: string, accessToken: string) => Promise<Result<OAuthUserInfo, IamError>>

  /**
   * 刷新令牌
   */
  refreshToken: (providerId: string, refreshToken: string) => Promise<Result<OAuthTokens, IamError>>

  /**
   * 关联账户
   */
  linkAccount: (userId: string, providerId: string, code: string, state: string) => Promise<Result<void, IamError>>

  /**
   * 取消关联账户
   */
  unlinkAccount: (userId: string, providerId: string) => Promise<Result<void, IamError>>
}
