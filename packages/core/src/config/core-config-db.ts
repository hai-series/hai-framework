/**
 * =============================================================================
 * @hai/core - 数据库配置 Schema
 * =============================================================================
 * 定义数据库相关配置的 Zod schema
 * 
 * 对应配置文件: _db.yml
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码（数据库 3000-3999）
// =============================================================================

/**
 * 数据库错误码 (3000-3999)
 */
export const DbErrorCode = {
    CONNECTION_FAILED: 3000,
    QUERY_FAILED: 3001,
    CONSTRAINT_VIOLATION: 3002,
    TRANSACTION_FAILED: 3003,
    MIGRATION_FAILED: 3004,
    RECORD_NOT_FOUND: 3005,
    DUPLICATE_ENTRY: 3006,
    DEADLOCK: 3007,
    TIMEOUT: 3008,
    POOL_EXHAUSTED: 3009,
} as const
export type DbErrorCode = typeof DbErrorCode[keyof typeof DbErrorCode]

// =============================================================================
// 配置类型
// =============================================================================

/**
 * 数据库类型
 */
export const DatabaseTypeSchema = z.enum(['sqlite', 'postgresql', 'mysql'])
export type DatabaseType = z.infer<typeof DatabaseTypeSchema>

/**
 * SQLite 配置
 */
export const SqliteConfigSchema = z.object({
    /** 数据库类型 */
    type: z.literal('sqlite'),
    /** 数据库文件路径 */
    filename: z.string().default('./data/app.db'),
    /** 是否启用 WAL 模式 */
    walMode: z.boolean().default(true),
})
export type SqliteConfig = z.infer<typeof SqliteConfigSchema>

/**
 * PostgreSQL 配置
 */
export const PostgresConfigSchema = z.object({
    /** 数据库类型 */
    type: z.literal('postgresql'),
    /** 主机 */
    host: z.string().default('localhost'),
    /** 端口 */
    port: z.number().int().min(1).max(65535).default(5432),
    /** 数据库名 */
    database: z.string(),
    /** 用户名 */
    user: z.string(),
    /** 密码 */
    password: z.string(),
    /** 是否启用 SSL */
    ssl: z.boolean().default(false),
    /** SSL 证书路径 */
    sslCertPath: z.string().optional(),
    /** 连接池最小连接数 */
    poolMin: z.number().int().min(0).default(2),
    /** 连接池最大连接数 */
    poolMax: z.number().int().min(1).default(10),
    /** 连接池空闲超时（毫秒） */
    poolIdleTimeout: z.number().int().min(0).default(30000),
    /** Schema 名称 */
    schema: z.string().default('public'),
})
export type PostgresConfig = z.infer<typeof PostgresConfigSchema>

/**
 * MySQL 配置
 */
export const MysqlConfigSchema = z.object({
    /** 数据库类型 */
    type: z.literal('mysql'),
    /** 主机 */
    host: z.string().default('localhost'),
    /** 端口 */
    port: z.number().int().min(1).max(65535).default(3306),
    /** 数据库名 */
    database: z.string(),
    /** 用户名 */
    user: z.string(),
    /** 密码 */
    password: z.string(),
    /** 是否启用 SSL */
    ssl: z.boolean().default(false),
    /** 连接池大小 */
    connectionLimit: z.number().int().min(1).default(10),
    /** 字符集 */
    charset: z.string().default('utf8mb4'),
    /** 时区 */
    timezone: z.string().default('+08:00'),
})
export type MysqlConfig = z.infer<typeof MysqlConfigSchema>

/**
 * 数据库配置（联合类型）
 */
export const DatabaseConfigSchema = z.discriminatedUnion('type', [
    SqliteConfigSchema,
    PostgresConfigSchema,
    MysqlConfigSchema,
])
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>

/**
 * Redis 配置
 */
export const RedisConfigSchema = z.object({
    /** 是否启用 */
    enabled: z.boolean().default(false),
    /** 主机 */
    host: z.string().default('localhost'),
    /** 端口 */
    port: z.number().int().min(1).max(65535).default(6379),
    /** 密码 */
    password: z.string().optional(),
    /** 数据库编号 */
    db: z.number().int().min(0).max(15).default(0),
    /** 键前缀 */
    keyPrefix: z.string().default('hai:'),
    /** 连接超时（毫秒） */
    connectTimeout: z.number().int().min(0).default(10000),
    /** 命令超时（毫秒） */
    commandTimeout: z.number().int().min(0).default(5000),
    /** TLS 配置 */
    tls: z.boolean().default(false),
})
export type RedisConfig = z.infer<typeof RedisConfigSchema>

/**
 * 完整的数据层配置
 */
export const DbConfigSchema = z.object({
    /** 数据库配置 */
    database: DatabaseConfigSchema,
    /** Redis 配置 */
    redis: RedisConfigSchema.optional(),
    /** 是否启用查询日志 */
    queryLogging: z.boolean().default(false),
    /** 慢查询阈值（毫秒） */
    slowQueryThreshold: z.number().int().min(0).default(1000),
})
export type DbConfig = z.infer<typeof DbConfigSchema>
