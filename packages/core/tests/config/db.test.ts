/**
 * =============================================================================
 * @hai/core - 数据库配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
    // 错误码
    DbErrorCode,
    // Schema
    DatabaseTypeSchema,
    SqliteConfigSchema,
    PostgresConfigSchema,
    MysqlConfigSchema,
    DatabaseConfigSchema,
    RedisConfigSchema,
    DbConfigSchema,
} from '../../src/config/core-config-db.js'

describe('core-config-db', () => {
    describe('DbErrorCode', () => {
        it('应有正确的错误码范围 (3000-3999)', () => {
            expect(DbErrorCode.CONNECTION_FAILED).toBe(3000)
            expect(DbErrorCode.QUERY_FAILED).toBe(3001)
            expect(DbErrorCode.CONSTRAINT_VIOLATION).toBe(3002)
            expect(DbErrorCode.TRANSACTION_FAILED).toBe(3003)
            expect(DbErrorCode.MIGRATION_FAILED).toBe(3004)
            expect(DbErrorCode.RECORD_NOT_FOUND).toBe(3005)
            expect(DbErrorCode.DUPLICATE_ENTRY).toBe(3006)
            expect(DbErrorCode.DEADLOCK).toBe(3007)
            expect(DbErrorCode.TIMEOUT).toBe(3008)
            expect(DbErrorCode.POOL_EXHAUSTED).toBe(3009)
        })
    })

    describe('DatabaseTypeSchema', () => {
        it('应接受有效的数据库类型', () => {
            const types = ['sqlite', 'postgresql', 'mysql']
            for (const type of types) {
                expect(DatabaseTypeSchema.parse(type)).toBe(type)
            }
        })

        it('应拒绝无效的数据库类型', () => {
            expect(() => DatabaseTypeSchema.parse('oracle')).toThrow()
        })
    })

    describe('SqliteConfigSchema', () => {
        it('应使用默认值', () => {
            const result = SqliteConfigSchema.parse({ type: 'sqlite' })
            expect(result.type).toBe('sqlite')
            expect(result.filename).toBe('./data/app.db')
            expect(result.walMode).toBe(true)
        })

        it('应接受自定义配置', () => {
            const config = {
                type: 'sqlite',
                filename: './custom/db.sqlite',
                walMode: false,
            }
            const result = SqliteConfigSchema.parse(config)
            expect(result.filename).toBe('./custom/db.sqlite')
            expect(result.walMode).toBe(false)
        })
    })

    describe('PostgresConfigSchema', () => {
        it('应使用默认值', () => {
            const config = {
                type: 'postgresql',
                database: 'testdb',
                user: 'testuser',
                password: 'testpass',
            }
            const result = PostgresConfigSchema.parse(config)
            expect(result.host).toBe('localhost')
            expect(result.port).toBe(5432)
            expect(result.ssl).toBe(false)
            expect(result.poolMin).toBe(2)
            expect(result.poolMax).toBe(10)
            expect(result.schema).toBe('public')
        })

        it('应验证端口范围', () => {
            const baseConfig = {
                type: 'postgresql',
                database: 'testdb',
                user: 'testuser',
                password: 'testpass',
            }
            expect(() => PostgresConfigSchema.parse({ ...baseConfig, port: 0 })).toThrow()
            expect(() => PostgresConfigSchema.parse({ ...baseConfig, port: 70000 })).toThrow()
            expect(PostgresConfigSchema.parse({ ...baseConfig, port: 5433 }).port).toBe(5433)
        })
    })

    describe('MysqlConfigSchema', () => {
        it('应使用默认值', () => {
            const config = {
                type: 'mysql',
                database: 'testdb',
                user: 'testuser',
                password: 'testpass',
            }
            const result = MysqlConfigSchema.parse(config)
            expect(result.host).toBe('localhost')
            expect(result.port).toBe(3306)
            expect(result.charset).toBe('utf8mb4')
        })
    })

    describe('DatabaseConfigSchema', () => {
        it('应接受 SQLite 配置', () => {
            const config = {
                type: 'sqlite',
                filename: './test.db',
            }
            const result = DatabaseConfigSchema.parse(config)
            expect(result.type).toBe('sqlite')
        })

        it('应接受 PostgreSQL 配置', () => {
            const config = {
                type: 'postgresql',
                database: 'testdb',
                user: 'user',
                password: 'pass',
            }
            const result = DatabaseConfigSchema.parse(config)
            expect(result.type).toBe('postgresql')
        })

        it('应接受 MySQL 配置', () => {
            const config = {
                type: 'mysql',
                database: 'testdb',
                user: 'user',
                password: 'pass',
            }
            const result = DatabaseConfigSchema.parse(config)
            expect(result.type).toBe('mysql')
        })
    })

    describe('RedisConfigSchema', () => {
        it('应使用默认值', () => {
            const result = RedisConfigSchema.parse({})
            expect(result.enabled).toBe(false)
            expect(result.host).toBe('localhost')
            expect(result.port).toBe(6379)
            expect(result.db).toBe(0)
            expect(result.keyPrefix).toBe('hai:')
        })

        it('应接受完整配置', () => {
            const config = {
                enabled: true,
                host: 'redis.example.com',
                port: 6380,
                password: 'secret',
                db: 1,
                keyPrefix: 'app:',
                tls: true,
            }
            const result = RedisConfigSchema.parse(config)
            expect(result.enabled).toBe(true)
            expect(result.host).toBe('redis.example.com')
            expect(result.tls).toBe(true)
        })
    })

    describe('DbConfigSchema', () => {
        it('应接受 SQLite 配置', () => {
            const config = {
                database: {
                    type: 'sqlite',
                    filename: './test.db',
                },
            }
            const result = DbConfigSchema.parse(config)
            expect(result.database.type).toBe('sqlite')
        })

        it('应接受 PostgreSQL 配置', () => {
            const config = {
                database: {
                    type: 'postgresql',
                    database: 'testdb',
                    user: 'user',
                    password: 'pass',
                },
                redis: {
                    enabled: true,
                },
            }
            const result = DbConfigSchema.parse(config)
            expect(result.database.type).toBe('postgresql')
            expect(result.redis?.enabled).toBe(true)
        })

        it('应接受完整配置', () => {
            const config = {
                database: {
                    type: 'mysql',
                    database: 'testdb',
                    user: 'user',
                    password: 'pass',
                },
                redis: {
                    enabled: true,
                    host: 'redis.example.com',
                },
                queryLogging: true,
                slowQueryThreshold: 500,
            }
            const result = DbConfigSchema.parse(config)
            expect(result.queryLogging).toBe(true)
            expect(result.slowQueryThreshold).toBe(500)
        })
    })
})
