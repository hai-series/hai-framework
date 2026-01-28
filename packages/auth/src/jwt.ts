/**
 * =============================================================================
 * @hai/auth - JWT 令牌管理
 * =============================================================================
 * 提供 JWT 令牌的生成、验证和刷新功能
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import type { JwtConfig } from '@hai/config'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const logger = createLogger({ name: 'auth-jwt' })

/**
 * JWT 错误类型
 */
export type JWTErrorType =
    | 'TOKEN_GENERATION_FAILED'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_INVALID'
    | 'TOKEN_VERIFICATION_FAILED'

/**
 * JWT 错误
 */
export interface JWTError {
    type: JWTErrorType
    message: string
}

/**
 * 访问令牌 Payload
 */
export interface AccessTokenPayload extends JWTPayload {
    /** 用户 ID */
    sub: string
    /** 用户名 */
    username?: string
    /** 角色列表 */
    roles?: string[]
    /** 权限列表 */
    permissions?: string[]
    /** 类型标识 */
    type: 'access'
}

/**
 * 刷新令牌 Payload
 */
export interface RefreshTokenPayload extends JWTPayload {
    /** 用户 ID */
    sub: string
    /** 会话 ID */
    sessionId: string
    /** 类型标识 */
    type: 'refresh'
}

/**
 * 令牌对
 */
export interface TokenPair {
    /** 访问令牌 */
    accessToken: string
    /** 刷新令牌 */
    refreshToken: string
    /** 访问令牌过期时间戳 */
    accessTokenExpiresAt: number
    /** 刷新令牌过期时间戳 */
    refreshTokenExpiresAt: number
}

/**
 * JWT 管理器
 */
export class JWTManager {
    private config: JwtConfig
    private secretKey: Uint8Array

    constructor(config: JwtConfig) {
        this.config = config
        this.secretKey = new TextEncoder().encode(config.secret)
    }

    /**
     * 生成访问令牌
     * 
     * @param payload - 令牌内容
     */
    async generateAccessToken(
        payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud'>,
    ): Promise<Result<string, JWTError>> {
        try {
            const now = Math.floor(Date.now() / 1000)

            const token = await new SignJWT({ ...payload, type: 'access' })
                .setProtectedHeader({ alg: this.config.algorithm })
                .setIssuedAt(now)
                .setIssuer(this.config.issuer)
                .setAudience(this.config.audience)
                .setExpirationTime(now + this.config.accessTokenExpiry)
                .setSubject(payload.sub)
                .sign(this.secretKey)

            return ok(token)
        }
        catch (error) {
            logger.error({ error }, 'Failed to generate access token')
            return err({
                type: 'TOKEN_GENERATION_FAILED',
                message: `Failed to generate access token: ${error}`,
            })
        }
    }

    /**
     * 生成刷新令牌
     * 
     * @param payload - 令牌内容
     */
    async generateRefreshToken(
        payload: Omit<RefreshTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud'>,
    ): Promise<Result<string, JWTError>> {
        try {
            const now = Math.floor(Date.now() / 1000)

            const token = await new SignJWT({ ...payload, type: 'refresh' })
                .setProtectedHeader({ alg: this.config.algorithm })
                .setIssuedAt(now)
                .setIssuer(this.config.issuer)
                .setAudience(this.config.audience)
                .setExpirationTime(now + this.config.refreshTokenExpiry)
                .setSubject(payload.sub)
                .sign(this.secretKey)

            return ok(token)
        }
        catch (error) {
            logger.error({ error }, 'Failed to generate refresh token')
            return err({
                type: 'TOKEN_GENERATION_FAILED',
                message: `Failed to generate refresh token: ${error}`,
            })
        }
    }

    /**
     * 生成令牌对
     * 
     * @param userId - 用户 ID
     * @param sessionId - 会话 ID
     * @param options - 额外选项
     */
    async generateTokenPair(
        userId: string,
        sessionId: string,
        options: {
            username?: string
            roles?: string[]
            permissions?: string[]
        } = {},
    ): Promise<Result<TokenPair, JWTError>> {
        const now = Math.floor(Date.now() / 1000)

        const accessTokenResult = await this.generateAccessToken({
            sub: userId,
            username: options.username,
            roles: options.roles,
            permissions: options.permissions,
        })

        if (!accessTokenResult.ok) {
            return accessTokenResult as Result<TokenPair, JWTError>
        }

        const refreshTokenResult = await this.generateRefreshToken({
            sub: userId,
            sessionId,
        })

        if (!refreshTokenResult.ok) {
            return refreshTokenResult as Result<TokenPair, JWTError>
        }

        return ok({
            accessToken: accessTokenResult.value,
            refreshToken: refreshTokenResult.value,
            accessTokenExpiresAt: now + this.config.accessTokenExpiry,
            refreshTokenExpiresAt: now + this.config.refreshTokenExpiry,
        })
    }

    /**
     * 验证访问令牌
     * 
     * @param token - JWT 令牌
     */
    async verifyAccessToken(token: string): Promise<Result<AccessTokenPayload, JWTError>> {
        try {
            const { payload } = await jwtVerify(token, this.secretKey, {
                issuer: this.config.issuer,
                audience: this.config.audience,
            })

            if ((payload as AccessTokenPayload).type !== 'access') {
                return err({
                    type: 'TOKEN_INVALID',
                    message: 'Invalid token type',
                })
            }

            return ok(payload as AccessTokenPayload)
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)

            if (errorMessage.includes('expired')) {
                return err({
                    type: 'TOKEN_EXPIRED',
                    message: 'Access token has expired',
                })
            }

            logger.warn({ error }, 'Access token verification failed')
            return err({
                type: 'TOKEN_VERIFICATION_FAILED',
                message: `Token verification failed: ${errorMessage}`,
            })
        }
    }

    /**
     * 验证刷新令牌
     * 
     * @param token - JWT 令牌
     */
    async verifyRefreshToken(token: string): Promise<Result<RefreshTokenPayload, JWTError>> {
        try {
            const { payload } = await jwtVerify(token, this.secretKey, {
                issuer: this.config.issuer,
                audience: this.config.audience,
            })

            if ((payload as RefreshTokenPayload).type !== 'refresh') {
                return err({
                    type: 'TOKEN_INVALID',
                    message: 'Invalid token type',
                })
            }

            return ok(payload as RefreshTokenPayload)
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)

            if (errorMessage.includes('expired')) {
                return err({
                    type: 'TOKEN_EXPIRED',
                    message: 'Refresh token has expired',
                })
            }

            logger.warn({ error }, 'Refresh token verification failed')
            return err({
                type: 'TOKEN_VERIFICATION_FAILED',
                message: `Token verification failed: ${errorMessage}`,
            })
        }
    }

    /**
     * 使用刷新令牌获取新的访问令牌
     * 
     * @param refreshToken - 刷新令牌
     * @param options - 额外选项
     */
    async refreshAccessToken(
        refreshToken: string,
        options: {
            username?: string
            roles?: string[]
            permissions?: string[]
        } = {},
    ): Promise<Result<{ accessToken: string, expiresAt: number }, JWTError>> {
        // 验证刷新令牌
        const verifyResult = await this.verifyRefreshToken(refreshToken)
        if (!verifyResult.ok) {
            return verifyResult as Result<{ accessToken: string, expiresAt: number }, JWTError>
        }

        const payload = verifyResult.value

        // 生成新的访问令牌
        const accessTokenResult = await this.generateAccessToken({
            sub: payload.sub,
            username: options.username,
            roles: options.roles,
            permissions: options.permissions,
        })

        if (!accessTokenResult.ok) {
            return accessTokenResult as Result<{ accessToken: string, expiresAt: number }, JWTError>
        }

        const now = Math.floor(Date.now() / 1000)

        return ok({
            accessToken: accessTokenResult.value,
            expiresAt: now + this.config.accessTokenExpiry,
        })
    }
}

/**
 * 创建 JWT 管理器
 * 
 * @param config - JWT 配置
 */
export function createJWTManager(config: JwtConfig): JWTManager {
    return new JWTManager(config)
}
