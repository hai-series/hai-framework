/**
 * =============================================================================
 * @hai/core - IAM 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
    // 错误码
    AuthErrorCode,
    // Schema
    IAMProviderTypeSchema,
    SessionConfigSchema,
    JwtConfigSchema,
    PasswordPolicySchema,
    LoginLimitsSchema,
    OAuthProviderSchema,
    IAMConfigSchema,
} from '../../src/config/core-config-iam.js'

describe('core-config-iam', () => {
    describe('AuthErrorCode', () => {
        it('应有正确的错误码范围 (2000-2999)', () => {
            expect(AuthErrorCode.INVALID_CREDENTIALS).toBe(2000)
            expect(AuthErrorCode.TOKEN_EXPIRED).toBe(2001)
            expect(AuthErrorCode.TOKEN_INVALID).toBe(2002)
            expect(AuthErrorCode.SESSION_EXPIRED).toBe(2003)
            expect(AuthErrorCode.SESSION_NOT_FOUND).toBe(2004)
            expect(AuthErrorCode.USER_NOT_FOUND).toBe(2005)
            expect(AuthErrorCode.USER_DISABLED).toBe(2006)
            expect(AuthErrorCode.PASSWORD_WEAK).toBe(2007)
            expect(AuthErrorCode.PASSWORD_MISMATCH).toBe(2008)
            expect(AuthErrorCode.MFA_REQUIRED).toBe(2009)
            expect(AuthErrorCode.MFA_INVALID).toBe(2010)
            expect(AuthErrorCode.OAUTH_FAILED).toBe(2011)
            expect(AuthErrorCode.PERMISSION_DENIED).toBe(2012)
            expect(AuthErrorCode.ROLE_NOT_FOUND).toBe(2013)
        })
    })

    describe('IAMProviderTypeSchema', () => {
        it('应接受有效的 IAM 提供者类型', () => {
            const types = ['hai', 'firebase', 'supabase', 'auth0', 'custom']
            for (const type of types) {
                expect(IAMProviderTypeSchema.parse(type)).toBe(type)
            }
        })

        it('应拒绝无效的类型', () => {
            expect(() => IAMProviderTypeSchema.parse('invalid')).toThrow()
        })
    })

    describe('SessionConfigSchema', () => {
        it('应接受有效配置并使用默认值', () => {
            const config = {
                secret: 'a'.repeat(32), // 至少32字符
            }
            const result = SessionConfigSchema.parse(config)
            expect(result.name).toBe('hai_session')
            expect(result.maxAge).toBe(86400)
            expect(result.path).toBe('/')
            expect(result.secure).toBe(true)
            expect(result.httpOnly).toBe(true)
            expect(result.sameSite).toBe('lax')
            expect(result.sliding).toBe(true)
        })

        it('应验证 secret 最小长度', () => {
            expect(() => SessionConfigSchema.parse({ secret: 'short' })).toThrow()
        })

        it('应接受完整配置', () => {
            const config = {
                secret: 'a'.repeat(64),
                name: 'my_session',
                maxAge: 3600,
                path: '/app',
                secure: false,
                httpOnly: true,
                sameSite: 'strict',
                sliding: false,
            }
            const result = SessionConfigSchema.parse(config)
            expect(result.name).toBe('my_session')
            expect(result.sameSite).toBe('strict')
        })
    })

    describe('JwtConfigSchema', () => {
        it('应接受有效配置并使用默认值', () => {
            const config = {
                secret: 'a'.repeat(32),
            }
            const result = JwtConfigSchema.parse(config)
            expect(result.issuer).toBe('hai-admin')
            expect(result.audience).toBe('hai-admin-users')
            expect(result.accessTokenExpiry).toBe(3600)
            expect(result.refreshTokenExpiry).toBe(604800)
            expect(result.algorithm).toBe('HS256')
        })

        it('应验证 secret 最小长度', () => {
            expect(() => JwtConfigSchema.parse({ secret: 'short' })).toThrow()
        })

        it('应接受有效的算法', () => {
            const algorithms = ['HS256', 'HS384', 'HS512']
            for (const algorithm of algorithms) {
                const result = JwtConfigSchema.parse({
                    secret: 'a'.repeat(32),
                    algorithm,
                })
                expect(result.algorithm).toBe(algorithm)
            }
        })
    })

    describe('PasswordPolicySchema', () => {
        it('应使用默认值', () => {
            const result = PasswordPolicySchema.parse({})
            expect(result.minLength).toBe(8)
            expect(result.maxLength).toBe(72)
            expect(result.requireUppercase).toBe(true)
            expect(result.requireLowercase).toBe(true)
            expect(result.requireNumbers).toBe(true)
            expect(result.requireSpecial).toBe(false)
            expect(result.argon2MemoryCost).toBe(65536)
            expect(result.argon2TimeCost).toBe(3)
            expect(result.argon2Parallelism).toBe(4)
        })

        it('应验证最小长度范围', () => {
            expect(() => PasswordPolicySchema.parse({ minLength: 5 })).toThrow()
            expect(PasswordPolicySchema.parse({ minLength: 6 }).minLength).toBe(6)
        })

        it('应验证最大长度范围', () => {
            expect(() => PasswordPolicySchema.parse({ maxLength: 129 })).toThrow()
            expect(PasswordPolicySchema.parse({ maxLength: 128 }).maxLength).toBe(128)
        })
    })

    describe('LoginLimitsSchema', () => {
        it('应使用默认值', () => {
            const result = LoginLimitsSchema.parse({})
            expect(result.maxAttempts).toBe(5)
            expect(result.lockoutDuration).toBe(300)
            expect(result.attemptWindow).toBe(900)
            expect(result.captchaEnabled).toBe(true)
            expect(result.captchaThreshold).toBe(3)
        })

        it('应验证最小值', () => {
            expect(() => LoginLimitsSchema.parse({ maxAttempts: 0 })).toThrow()
            expect(() => LoginLimitsSchema.parse({ lockoutDuration: 30 })).toThrow()
            expect(() => LoginLimitsSchema.parse({ attemptWindow: 30 })).toThrow()
        })
    })

    describe('OAuthProviderSchema', () => {
        it('应使用默认值', () => {
            const result = OAuthProviderSchema.parse({})
            expect(result.enabled).toBe(false)
        })

        it('应接受完整配置', () => {
            const config = {
                enabled: true,
                clientId: 'client-id',
                clientSecret: 'client-secret',
                scope: ['email', 'profile'],
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                userInfoUrl: 'https://auth.example.com/userinfo',
            }
            const result = OAuthProviderSchema.parse(config)
            expect(result.enabled).toBe(true)
            expect(result.scope).toEqual(['email', 'profile'])
        })

        it('应验证 URL 格式', () => {
            expect(() => OAuthProviderSchema.parse({
                authorizationUrl: 'not-a-url',
            })).toThrow()
        })
    })

    describe('IAMConfigSchema', () => {
        it('应使用默认值', () => {
            const config = {
                session: { secret: 'a'.repeat(32) },
                jwt: { secret: 'b'.repeat(32) },
            }
            const result = IAMConfigSchema.parse(config)
            expect(result.provider).toBe('hai')
        })

        it('应接受完整配置', () => {
            const config = {
                provider: 'firebase',
                session: { secret: 'a'.repeat(32), maxAge: 7200 },
                jwt: { secret: 'b'.repeat(32), accessTokenExpiry: 1800 },
                passwordPolicy: { minLength: 10 },
                loginLimits: { maxAttempts: 3 },
                oauth: {
                    google: { enabled: true, clientId: 'xxx' },
                },
            }
            const result = IAMConfigSchema.parse(config)
            expect(result.provider).toBe('firebase')
            expect(result.session?.maxAge).toBe(7200)
            expect(result.passwordPolicy?.minLength).toBe(10)
        })
    })
})
