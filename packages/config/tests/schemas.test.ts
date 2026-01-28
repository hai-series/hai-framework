/**
 * =============================================================================
 * @hai/config - Schema 单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
    AIConfigSchema,
    AppConfigSchema,
    AuthConfigSchema,
    DatabaseConfigSchema,
    DbConfigSchema,
} from '../src/schemas/index.js'

describe('AppConfigSchema', () => {
    it('should parse valid app config with defaults', () => {
        const result = AppConfigSchema.safeParse({})

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('hai Admin')
            expect(result.data.env).toBe('development')
            expect(result.data.server.port).toBe(3000)
            expect(result.data.log.level).toBe('info')
            expect(result.data.features.registration).toBe(true)
        }
    })

    it('should parse full app config', () => {
        const config = {
            name: 'My App',
            version: '1.0.0',
            env: 'production',
            debug: false,
            server: {
                port: 8080,
                host: '127.0.0.1',
                https: true,
                certPath: '/path/to/cert.pem',
                keyPath: '/path/to/key.pem',
                trustProxy: false,
            },
            log: {
                level: 'warn',
                pretty: false,
                redact: ['password', 'token'],
            },
            features: {
                registration: false,
                aiEnabled: true,
                mcpEnabled: true,
            },
            timezone: 'UTC',
            defaultLocale: 'en-US',
            supportedLocales: ['en-US', 'zh-CN', 'ja-JP'],
        }

        const result = AppConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.name).toBe('My App')
            expect(result.data.env).toBe('production')
            expect(result.data.server.port).toBe(8080)
            expect(result.data.log.redact).toContain('password')
        }
    })

    it('should reject invalid env value', () => {
        const result = AppConfigSchema.safeParse({
            env: 'invalid',
        })

        expect(result.success).toBe(false)
    })

    it('should reject invalid port', () => {
        const result = AppConfigSchema.safeParse({
            server: { port: 70000 },
        })

        expect(result.success).toBe(false)
    })
})

describe('AuthConfigSchema', () => {
    it('should require session secret', () => {
        const result = AuthConfigSchema.safeParse({})

        expect(result.success).toBe(false)
    })

    it('should parse valid auth config', () => {
        const config = {
            session: {
                secret: 'a-very-long-secret-key-for-session-encryption',
                name: 'app_session',
                maxAge: 7200,
            },
            passwordPolicy: {
                minLength: 10,
                requireSpecial: true,
            },
            loginLimits: {
                maxAttempts: 3,
                lockoutDuration: 600,
            },
            e2eeEnabled: true,
        }

        const result = AuthConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.session.name).toBe('app_session')
            expect(result.data.passwordPolicy.minLength).toBe(10)
            expect(result.data.loginLimits.maxAttempts).toBe(3)
            expect(result.data.e2eeEnabled).toBe(true)
        }
    })

    it('should reject short session secret', () => {
        const result = AuthConfigSchema.safeParse({
            session: {
                secret: 'short',
            },
        })

        expect(result.success).toBe(false)
    })

    it('should parse OAuth providers', () => {
        const config = {
            session: {
                secret: 'a-very-long-secret-key-for-session-encryption',
            },
            oauth: {
                github: {
                    enabled: true,
                    clientId: 'github-client-id',
                    clientSecret: 'github-client-secret',
                    scopes: ['user', 'repo'],
                },
                google: {
                    enabled: false,
                },
            },
        }

        const result = AuthConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.oauth.github?.enabled).toBe(true)
            expect(result.data.oauth.github?.scopes).toContain('user')
        }
    })
})

describe('DatabaseConfigSchema', () => {
    it('should parse SQLite config', () => {
        const config = {
            type: 'sqlite',
            filename: './data/test.db',
            walMode: true,
        }

        const result = DatabaseConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.type).toBe('sqlite')
            if (result.data.type === 'sqlite') {
                expect(result.data.filename).toBe('./data/test.db')
            }
        }
    })

    it('should parse PostgreSQL config', () => {
        const config = {
            type: 'postgresql',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            user: 'admin',
            password: 'secret',
            ssl: true,
            poolMax: 20,
        }

        const result = DatabaseConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.type).toBe('postgresql')
            if (result.data.type === 'postgresql') {
                expect(result.data.host).toBe('localhost')
                expect(result.data.poolMax).toBe(20)
            }
        }
    })

    it('should parse MySQL config', () => {
        const config = {
            type: 'mysql',
            host: '127.0.0.1',
            port: 3306,
            database: 'app',
            user: 'root',
            password: 'password',
            charset: 'utf8mb4',
        }

        const result = DatabaseConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.type).toBe('mysql')
        }
    })

    it('should reject invalid database type', () => {
        const result = DatabaseConfigSchema.safeParse({
            type: 'mongodb',
        })

        expect(result.success).toBe(false)
    })
})

describe('DbConfigSchema', () => {
    it('should parse full db config', () => {
        const config = {
            database: {
                type: 'sqlite',
                filename: './data/app.db',
            },
            redis: {
                enabled: true,
                host: 'localhost',
                port: 6379,
                keyPrefix: 'app:',
            },
            queryLogging: true,
            slowQueryThreshold: 500,
        }

        const result = DbConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.redis.enabled).toBe(true)
            expect(result.data.queryLogging).toBe(true)
        }
    })
})

describe('AIConfigSchema', () => {
    it('should parse valid AI config with defaults', () => {
        const result = AIConfigSchema.safeParse({})

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.enabled).toBe(true)
            expect(result.data.defaultModel).toBe('gpt-3.5-turbo')
            expect(result.data.defaultParams.temperature).toBe(0.7)
        }
    })

    it('should parse full AI config', () => {
        const config = {
            enabled: true,
            defaultModel: 'deepseek-chat',
            models: [
                {
                    id: 'deepseek-chat',
                    name: 'DeepSeek Chat',
                    provider: 'deepseek',
                    endpoint: 'https://api.deepseek.com/v1',
                    apiKey: 'sk-xxx',
                    maxContextLength: 16384,
                    maxOutputLength: 4096,
                    supportsTools: true,
                    supportsStreaming: true,
                },
                {
                    id: 'gpt-4',
                    name: 'GPT-4',
                    provider: 'openai',
                    maxContextLength: 8192,
                    supportsTools: true,
                    supportsVision: true,
                },
            ],
            defaultParams: {
                temperature: 0.5,
                topP: 0.9,
                frequencyPenalty: 0.1,
            },
            rateLimit: {
                enabled: true,
                requestsPerMinute: 100,
                tokensPerMinute: 200000,
            },
            timeout: 30000,
            maxRetries: 2,
        }

        const result = AIConfigSchema.safeParse(config)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.models.length).toBe(2)
            expect(result.data.models[0].provider).toBe('deepseek')
            expect(result.data.defaultParams.temperature).toBe(0.5)
        }
    })

    it('should reject invalid provider', () => {
        const result = AIConfigSchema.safeParse({
            models: [
                {
                    id: 'test',
                    name: 'Test',
                    provider: 'invalid-provider',
                },
            ],
        })

        expect(result.success).toBe(false)
    })

    it('should reject invalid temperature', () => {
        const result = AIConfigSchema.safeParse({
            defaultParams: {
                temperature: 3.0, // max is 2
            },
        })

        expect(result.success).toBe(false)
    })
})
