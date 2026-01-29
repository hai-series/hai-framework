/**
 * =============================================================================
 * @hai/db - 数据库配置 Schema
 * =============================================================================
 *
 * 本文件定义数据库模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（3000-3999 范围）
 * - 数据库类型枚举
 * - 连接池配置
 * - SSL 配置
 * - 统一的 DbConfig 配置结构
 *
 * @example
 * ```ts
 * import { DbConfigSchema, DbErrorCode } from '@hai/db'
 *
 * // 校验配置
 * const config = DbConfigSchema.parse({
 *     type: 'sqlite',
 *     database: ':memory:'
 * })
 *
 * // 使用错误码
 * if (error.code === DbErrorCode.NOT_INITIALIZED) {
 *     // 处理错误：请先调用 db.init()
 * }
 * ```
 *
 * @module db-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 数据库错误码（数值范围 3000-3999）
 *
 * 用于标识数据库操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { DbErrorCode } from '@hai/db'
 *
 * if (result.error?.code === DbErrorCode.CONNECTION_FAILED) {
 *     // 处理错误：数据库连接失败
 * }
 * ```
 */
export const DbErrorCode = {
    /** 连接失败 */
    CONNECTION_FAILED: 3000,
    /** 查询失败 */
    QUERY_FAILED: 3001,
    /** 约束违反（如外键、唯一约束等） */
    CONSTRAINT_VIOLATION: 3002,
    /** 事务失败 */
    TRANSACTION_FAILED: 3003,
    /** 迁移失败 */
    MIGRATION_FAILED: 3004,
    /** 记录不存在 */
    RECORD_NOT_FOUND: 3005,
    /** 重复条目 */
    DUPLICATE_ENTRY: 3006,
    /** 死锁 */
    DEADLOCK: 3007,
    /** 超时 */
    TIMEOUT: 3008,
    /** 连接池耗尽 */
    POOL_EXHAUSTED: 3009,
    /** 数据库未初始化 */
    NOT_INITIALIZED: 3010,
    /** DDL 操作失败 */
    DDL_FAILED: 3011,
    /** 不支持的数据库类型 */
    UNSUPPORTED_TYPE: 3012,
    /** 配置错误 */
    CONFIG_ERROR: 3013,
} as const

/** 数据库错误码类型 */
export type DbErrorCodeType = typeof DbErrorCode[keyof typeof DbErrorCode]

// =============================================================================
// 数据库配置 Schema
// =============================================================================

/**
 * 数据库类型枚举
 *
 * 支持的数据库类型：
 * - `sqlite` - SQLite 嵌入式数据库（使用 better-sqlite3）
 * - `postgresql` - PostgreSQL 数据库（使用 pg）
 * - `mysql` - MySQL 数据库（使用 mysql2）
 */
export const DbTypeSchema = z.enum(['sqlite', 'postgresql', 'mysql'])

/** 数据库类型 */
export type DbType = z.infer<typeof DbTypeSchema>

/**
 * 连接池配置 Schema
 *
 * 用于 PostgreSQL 和 MySQL 的连接池管理。
 * SQLite 为嵌入式数据库，不使用连接池。
 *
 * @example
 * ```ts
 * const poolConfig = {
 *     min: 2,
 *     max: 20,
 *     idleTimeout: 30000,
 *     acquireTimeout: 10000
 * }
 * ```
 */
export const PoolConfigSchema = z.object({
    /** 最小连接数（默认 1） */
    min: z.number().int().min(0).default(1),
    /** 最大连接数（默认 10） */
    max: z.number().int().min(1).default(10),
    /** 空闲连接超时时间，单位毫秒（默认 30000） */
    idleTimeout: z.number().int().min(0).default(30000),
    /** 获取连接超时时间，单位毫秒（默认 10000） */
    acquireTimeout: z.number().int().min(0).default(10000),
})

/** 连接池配置类型 */
export type PoolConfig = z.infer<typeof PoolConfigSchema>

/**
 * SSL 配置 Schema
 *
 * 支持多种配置方式：
 * - `true/false` - 简单开关
 * - `'require'/'prefer'/'allow'/'disable'` - SSL 模式
 * - 自定义对象 - 详细 SSL 配置
 *
 * @example
 * ```ts
 * // 简单开关
 * ssl: true
 *
 * // SSL 模式
 * ssl: 'require'
 *
 * // 自定义配置
 * ssl: { rejectUnauthorized: false }
 * ```
 */
export const SslConfigSchema = z.union([
    z.boolean(),
    z.enum(['require', 'prefer', 'allow', 'disable']),
    z.record(z.string(), z.unknown()),
])

/** SSL 配置类型 */
export type SslConfig = z.infer<typeof SslConfigSchema>

/**
 * SQLite 特定选项 Schema
 *
 * @example
 * ```ts
 * sqlite: {
 *     walMode: true,   // 启用 WAL 模式，提高并发性能
 *     readonly: false  // 只读模式
 * }
 * ```
 */
export const SqliteOptionsSchema = z.object({
    /** 是否启用 WAL 模式（默认 true），可提高并发读写性能 */
    walMode: z.boolean().default(true),
    /** 是否只读模式（默认 false） */
    readonly: z.boolean().default(false),
}).optional()

/**
 * MySQL 特定选项 Schema
 *
 * @example
 * ```ts
 * mysql: {
 *     charset: 'utf8mb4',
 *     timezone: '+08:00'
 * }
 * ```
 */
export const MysqlOptionsSchema = z.object({
    /** 字符集（默认 utf8mb4），推荐使用 utf8mb4 支持完整 Unicode */
    charset: z.string().default('utf8mb4'),
    /** 时区设置，如 '+08:00' */
    timezone: z.string().optional(),
}).optional()

/**
 * 统一数据库配置 Schema
 *
 * 所有数据库类型使用统一的配置结构，根据 `type` 字段区分。
 *
 * 连接方式：
 * 1. 使用 `url` 连接字符串（推荐用于生产环境）
 * 2. 使用分开的 `host`、`port`、`database` 等字段
 *
 * @example
 * ```ts
 * // SQLite - 文件数据库
 * { type: 'sqlite', database: './data.db' }
 *
 * // SQLite - 内存数据库（用于测试）
 * { type: 'sqlite', database: ':memory:' }
 *
 * // PostgreSQL - 使用连接字符串
 * { type: 'postgresql', url: 'postgres://user:pass@localhost:5432/mydb' }
 *
 * // PostgreSQL - 使用分开的字段
 * {
 *     type: 'postgresql',
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     user: 'admin',
 *     password: 'secret',
 *     pool: { max: 20 }
 * }
 *
 * // MySQL - 使用连接字符串
 * { type: 'mysql', url: 'mysql://user:pass@localhost:3306/mydb' }
 *
 * // MySQL - 使用分开的字段
 * {
 *     type: 'mysql',
 *     host: 'localhost',
 *     port: 3306,
 *     database: 'mydb',
 *     user: 'admin',
 *     password: 'secret',
 *     mysql: { charset: 'utf8mb4' }
 * }
 * ```
 */
export const DbConfigSchema = z.object({
    /** 数据库类型：sqlite / postgresql / mysql */
    type: DbTypeSchema,

    // =========================================================================
    // 通用连接配置
    // =========================================================================

    /**
     * 连接字符串（可选，PostgreSQL/MySQL）
     * 如果提供 url，将优先使用，忽略 host/port 等字段
     */
    url: z.string().optional(),

    /** 数据库主机地址（默认 localhost） */
    host: z.string().default('localhost'),

    /**
     * 数据库端口
     * - PostgreSQL 默认 5432
     * - MySQL 默认 3306
     * - SQLite 不使用此字段
     */
    port: z.number().int().min(1).max(65535).optional(),

    /**
     * 数据库名称或文件路径
     * - SQLite：文件路径（如 './data.db'）或 ':memory:'（内存数据库）
     * - PostgreSQL/MySQL：数据库名称
     */
    database: z.string(),

    /** 数据库用户名（PostgreSQL/MySQL） */
    user: z.string().optional(),

    /** 数据库密码（PostgreSQL/MySQL） */
    password: z.string().optional(),

    // =========================================================================
    // 安全配置
    // =========================================================================

    /** SSL/TLS 连接配置 */
    ssl: SslConfigSchema.optional(),

    // =========================================================================
    // 连接池配置
    // =========================================================================

    /** 连接池配置（PostgreSQL/MySQL） */
    pool: PoolConfigSchema.optional(),

    // =========================================================================
    // 数据库特定选项
    // =========================================================================

    /** SQLite 特定选项 */
    sqlite: SqliteOptionsSchema,

    /** MySQL 特定选项 */
    mysql: MysqlOptionsSchema,

    // =========================================================================
    // 运行时选项
    // =========================================================================

    /** 静默模式，不输出连接日志（默认 false） */
    silent: z.boolean().default(false),
})

/** 数据库配置类型 */
export type DbConfig = z.infer<typeof DbConfigSchema>

/**
 * 数据库配置输入类型（用于 init 等入口）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 * 因此对外 API（如 db.init）更适合接收 DbConfigInput。
 */
export type DbConfigInput = z.input<typeof DbConfigSchema>
