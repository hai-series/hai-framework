/**
 * =============================================================================
 * @hai/iam - HAI Provider: OAuth
 * =============================================================================
 * HAI 默认 OAuth 提供者实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import type {
    IAMConfig,
    IAMError,
    OAuthProvider,
    OAuthProviderConfig,
    OAuthState,
    OAuthTokens,
    OAuthUserInfo,
} from '../../iam-types.js'

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
 * HAI OAuth 提供者实现
 */
class HaiOAuthProvider implements OAuthProvider {
    readonly name = 'hai-oauth'

    private providers: Map<string, OAuthProviderConfig> = new Map()
    private states: Map<string, OAuthState> = new Map()
    private linkedAccounts: Map<string, Map<string, string>> = new Map() // userId -> providerId -> providerUserId

    constructor(config: IAMConfig) {
        // 加载配置的 OAuth 提供商
        if (config.oauth?.providers) {
            for (const provider of config.oauth.providers) {
                this.providers.set(provider.id, provider)
            }
        }
    }

    async getAuthorizationUrl(providerId: string, customState?: string): Promise<Result<{ url: string; state: OAuthState }, IAMError>> {
        try {
            const provider = this.providers.get(providerId)
            if (!provider) {
                return err({ type: 'OAUTH_PROVIDER_NOT_FOUND', message: `OAuth provider '${providerId}' not found` })
            }

            const stateValue = customState || generateState()
            const state: OAuthState = {
                state: stateValue,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 分钟过期
            }

            this.states.set(stateValue, state)

            const params = new URLSearchParams({
                client_id: provider.clientId,
                redirect_uri: provider.redirectUrl,
                response_type: 'code',
                scope: provider.scopes.join(' '),
                state: stateValue,
            })

            const url = `${provider.authorizationUrl}?${params.toString()}`

            return ok({ url, state })
        }
        catch (error) {
            return err({ type: 'INTERNAL_ERROR', message: 'Failed to generate authorization URL', cause: error })
        }
    }

    async handleCallback(providerId: string, code: string, state: string): Promise<Result<OAuthTokens, IAMError>> {
        try {
            const provider = this.providers.get(providerId)
            if (!provider) {
                return err({ type: 'OAUTH_PROVIDER_NOT_FOUND', message: `OAuth provider '${providerId}' not found` })
            }

            // 验证状态令牌
            const storedState = this.states.get(state)
            if (!storedState) {
                return err({ type: 'OAUTH_INVALID_STATE', message: 'Invalid state token' })
            }

            if (new Date() > storedState.expiresAt) {
                this.states.delete(state)
                return err({ type: 'OAUTH_INVALID_STATE', message: 'State token expired' })
            }

            this.states.delete(state)

            // 交换授权码获取令牌
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
                return err({ type: 'OAUTH_TOKEN_ERROR', message: 'Failed to exchange authorization code' })
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
            return err({ type: 'INTERNAL_ERROR', message: 'Failed to handle OAuth callback', cause: error })
        }
    }

    async getUserInfo(providerId: string, accessToken: string): Promise<Result<OAuthUserInfo, IAMError>> {
        try {
            const provider = this.providers.get(providerId)
            if (!provider) {
                return err({ type: 'OAUTH_PROVIDER_NOT_FOUND', message: `OAuth provider '${providerId}' not found` })
            }

            if (!provider.userInfoUrl) {
                return err({ type: 'CONFIGURATION_ERROR', message: 'User info URL not configured' })
            }

            const response = await fetch(provider.userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                },
            })

            if (!response.ok) {
                return err({ type: 'OAUTH_TOKEN_ERROR', message: 'Failed to fetch user info' })
            }

            const data = await response.json() as Record<string, unknown>

            // 标准化用户信息（不同提供商格式不同）
            const userInfo: OAuthUserInfo = {
                providerId: String(data.id || data.sub || ''),
                email: data.email as string | undefined,
                username: data.login as string | undefined || data.username as string | undefined,
                displayName: data.name as string | undefined,
                avatarUrl: data.avatar_url as string | undefined || data.picture as string | undefined,
                raw: data,
            }

            return ok(userInfo)
        }
        catch (error) {
            return err({ type: 'INTERNAL_ERROR', message: 'Failed to get user info', cause: error })
        }
    }

    async refreshToken(providerId: string, refreshToken: string): Promise<Result<OAuthTokens, IAMError>> {
        try {
            const provider = this.providers.get(providerId)
            if (!provider) {
                return err({ type: 'OAUTH_PROVIDER_NOT_FOUND', message: `OAuth provider '${providerId}' not found` })
            }

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
                return err({ type: 'OAUTH_TOKEN_ERROR', message: 'Failed to refresh token' })
            }

            const data = await response.json() as {
                access_token: string
                refresh_token?: string
                token_type: string
                expires_in: number
                scope?: string
            }

            return ok({
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenType: data.token_type,
                expiresIn: data.expires_in,
                scope: data.scope,
            })
        }
        catch (error) {
            return err({ type: 'INTERNAL_ERROR', message: 'Failed to refresh OAuth token', cause: error })
        }
    }

    async linkAccount(userId: string, providerId: string, providerUserId: string): Promise<Result<void, IAMError>> {
        try {
            let userAccounts = this.linkedAccounts.get(userId)
            if (!userAccounts) {
                userAccounts = new Map()
                this.linkedAccounts.set(userId, userAccounts)
            }

            userAccounts.set(providerId, providerUserId)
            return ok(undefined)
        }
        catch (error) {
            return err({ type: 'INTERNAL_ERROR', message: 'Failed to link account', cause: error })
        }
    }

    async unlinkAccount(userId: string, providerId: string): Promise<Result<void, IAMError>> {
        try {
            const userAccounts = this.linkedAccounts.get(userId)
            if (userAccounts) {
                userAccounts.delete(providerId)
            }
            return ok(undefined)
        }
        catch (error) {
            return err({ type: 'INTERNAL_ERROR', message: 'Failed to unlink account', cause: error })
        }
    }
}

export function createHaiOAuthProvider(config: IAMConfig): OAuthProvider {
    return new HaiOAuthProvider(config)
}
