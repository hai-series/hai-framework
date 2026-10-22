/**
 * @h-ai/reldb — 数据库配置 Schema
 *
 * 本文件定义数据库模块的配置结构，使用 Zod 进行运行时校验。
 * @module reldb-config
 */

import { z } from 'zod'
// ─── 数据库配置 Schema ───

/**
 * 数据库类型枚举
 *
 * 支持的数据库类型：
 * - `sqlite` - SQLite 嵌入式数据库（使用 better-sqlite3）
 * - `postgresql` - PostgreSQL 数据库（使用 pg）
 * - `mysql` - MySQL 数据库（使用 mysql2）
 * @example
 * ```ts
 * import { ReldbTypeSchema } from '@h-ai/reldb'
 *
 * const value = ReldbTypeSchema.parse('postgresql')
 * void value
 * ```
 */
export const ReldbTypeSchema = z.enum(['sqlite', 'postgresql', 'mysql'])

/**
 * 数据库类型
 * @example
 * ```ts
 * import type { DbType } from '@h-ai/reldb'
 *
 * const value: DbType = 'postgresql'
 * void value
 * ```
 */
export type DbType = z.infer<typeof ReldbTypeSchema>

/**
 * ReldbOperationLogConfigSchema 的数据约束与操作契约。
 * @example
 * ```ts
 * import { ReldbOperationLogConfigSchema } from '@h-ai/reldb'
 *
 * const value = ReldbOperationLogConfigSchema.parse({ read: false, write: true, maxLength: 100, level: 'debug' })
 * void value
 * ```
 */
export const ReldbOperationLogConfigSchema = z.object({
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  /** 安全数量摘要的最大字符数；0 表示省略摘要，永不记录 SQL 原文或参数值。 */
  maxLength: z.number().int().min(0).default(1000),
  level: z.enum(['info', 'debug', 'trace']).default('debug'),
})

/**
 * ReldbOperationLogConfig 的数据约束与操作契约。
 * @example
 * ```ts
 * import { ReldbOperationLogConfigSchema, type ReldbOperationLogConfig } from '@h-ai/reldb'
 *
 * const value: ReldbOperationLogConfig = ReldbOperationLogConfigSchema.parse({ read: false, write: true, maxLength: 100, level: 'debug' })
 * void value
 * ```
 */
export type ReldbOperationLogConfig = z.infer<typeof ReldbOperationLogConfigSchema>

const OperationLogConfigFieldSchema = {
  operationLog: ReldbOperationLogConfigSchema.optional(),
}

/**
 * PostgreSQL 连接池配置 Schema
 *
 * min 是已建立连接的保留下限，不主动预建连接。
 * MySQL 使用独立的 MysqlPoolConfigSchema；SQLite 不使用连接池。
 * @example
 * ```ts
 * import { PoolConfigSchema } from '@h-ai/reldb'
 *
 * const value = PoolConfigSchema.parse({ max: 10, acquireTimeout: 5000 })
 * void value
 * ```
 */
export const PoolConfigSchema = z.object({
  /** PostgreSQL 已建立连接的最小保留数（默认 1，不主动预建） */
  min: z.number().int().min(0).default(1),
  /** 最大连接数（默认 10） */
  max: z.number().int().min(1).default(10),
  /** PostgreSQL 空闲连接超时，毫秒（默认 30000；0 禁用） */
  idleTimeout: z.number().int().min(0).default(30000),
  /** 获取连接超时，毫秒（默认10000）；PostgreSQL >=0，0禁用；MySQL排队+建连总期限为1–2147483647 */
  acquireTimeout: z.number().int().min(0).default(10000),
})

/**
 * PostgreSQL 连接池配置类型。
 * @example
 * ```ts
 * import { PoolConfigSchema, type PoolConfig } from '@h-ai/reldb'
 *
 * const value: PoolConfig = PoolConfigSchema.parse({ max: 10, acquireTimeout: 5000 })
 * void value
 * ```
 */
export type PoolConfig = z.infer<typeof PoolConfigSchema>

/**
 * MySQL 连接池配置：有界 FIFO 等待，拒绝没有可靠驱动语义的 min/idleTimeout。
 *
 * acquireTimeout 覆盖排队和建立连接，不是 SQL 执行时限。驱动建连也使用此值作为 connectTimeout。
 * 空闲连接由 mysql2/服务端管理；本模块不承诺最小保留数或可配置的空闲回收期限。
 * @example
 * ```ts
 * import { MysqlPoolConfigSchema } from '@h-ai/reldb'
 *
 * const value = MysqlPoolConfigSchema.parse({ max: 10, acquireTimeout: 5000, queueLimit: 100 })
 * void value
 * ```
 */
export const MysqlPoolConfigSchema = z.object({
  /** 最大连接数（默认 10） */
  max: z.number().int().min(1).default(10),
  /** 获取连接超时，毫秒（默认10000）；PostgreSQL >=0，0禁用；MySQL排队+建连总期限为1–2147483647 */
  acquireTimeout: z.number().int().min(1).max(2147483647).default(10000),
  /** MySQL 等待队列最大请求数（默认 1000；正整数，不支持无限队列） */
  queueLimit: z.number().int().min(1).default(1000),
}).strict()

/**
 * MySQL 解析后的连接池配置。
 * @example
 * ```ts
 * import { MysqlPoolConfigSchema, type MysqlPoolConfig } from '@h-ai/reldb'
 *
 * const value: MysqlPoolConfig = MysqlPoolConfigSchema.parse({ max: 10, acquireTimeout: 5000, queueLimit: 100 })
 * void value
 * ```
 */
export type MysqlPoolConfig = z.infer<typeof MysqlPoolConfigSchema>

/**
 * PostgreSQL SSL 配置 Schema
 *
 * 支持多种配置方式：
 * - `true/false` - 简单开关
 * - `'require'/'prefer'/'allow'/'disable'` - SSL 模式
 * - 自定义对象 - 详细 SSL 配置
 * @example
 * ```ts
 * import { SslConfigSchema } from '@h-ai/reldb'
 *
 * const value = SslConfigSchema.parse({ rejectUnauthorized: true })
 * void value
 * ```
 */
export const SslConfigSchema = z.union([
  z.boolean(),
  z.enum(['require', 'prefer', 'allow', 'disable']),
  z.record(z.string(), z.unknown()),
])

/**
 * PostgreSQL SSL 配置类型
 * @example
 * ```ts
 * import { SslConfigSchema, type SslConfig } from '@h-ai/reldb'
 *
 * const value: SslConfig = SslConfigSchema.parse({ rejectUnauthorized: true })
 * void value
 * ```
 */
export type SslConfig = z.infer<typeof SslConfigSchema>

/**
 * MySQL TLS 配置；空对象默认校验证书链和 DNS 主机身份，只接收明确支持的 PEM 字段。
 *
 * cert/key 必须成对。verifyIdentity 在当前驱动仅支持 DNS 主机，不能宣称验证 IP 身份。
 * 显式关闭验证会记录风险日志；本模块不提供任意 TLS 参数或回调透传。
 * @example
 * ```ts
 * import { MysqlSslConfigSchema } from '@h-ai/reldb'
 *
 * const value = MysqlSslConfigSchema.parse({ rejectUnauthorized: true, verifyIdentity: true })
 * void value
 * ```
 */
export const MysqlSslConfigSchema = z.union([
  z.literal(false),
  z.object({
    /** MySQL 是否校验证书链（默认 true）；false 明确放弃服务端认证 */
    rejectUnauthorized: z.boolean().default(true),
    /** MySQL 是否验证 DNS 主机身份（默认 true）；仅证书链验证开启时有效 */
    verifyIdentity: z.boolean().default(true),
    /** MySQL 信任的 CA，PEM 内容；省略时使用 Node 信任库 */
    ca: z.string().min(1).optional(),
    /** MySQL 客户端证书，PEM 内容；必须同时提供 key */
    cert: z.string().min(1).optional(),
    /** MySQL 客户端私钥，PEM 内容；必须同时提供 cert */
    key: z.string().min(1).optional(),
  }).strict().refine(ssl => Boolean(ssl.cert) === Boolean(ssl.key), { path: ['key'] }),
])

/**
 * SQLite 特定选项 Schema
 * @example
 * ```ts
 * import { SqliteOptionsSchema } from '@h-ai/reldb'
 *
 * const value = SqliteOptionsSchema.parse({ walMode: true, executor: 'worker' })
 * void value
 * ```
 */
export const SqliteOptionsSchema = z.object({
  /** 是否启用 WAL 模式（默认 true），可提高并发读写性能 */
  walMode: z.boolean().default(true),
  /** 是否只读模式（默认 false） */
  readonly: z.boolean().default(false),
  /**
   * 执行方式（默认 sync）。
   *
   * - `sync`：主线程直接执行 better-sqlite3（同步阻塞主线程事件循环）。
   * - `worker`：在专用 worker 线程持有唯一连接执行，把阻塞移出主线程。
   *   注意 WAL 只改善数据库锁并发，无法避免 better-sqlite3 同步调用占用调用线程。
   */
  executor: z.enum(['sync', 'worker']).default('sync'),
  /** worker 执行方式下等待连接打开的超时（毫秒，默认 10000） */
  workerConnectTimeoutMs: z.number().int().positive().default(10_000),
})

/**
 * MySQL 特定选项 Schema
 * @example
 * ```ts
 * import { MysqlOptionsSchema } from '@h-ai/reldb'
 *
 * const value = MysqlOptionsSchema.parse({ charset: 'utf8mb4' })
 * void value
 * ```
 */
export const MysqlOptionsSchema = z.object({
  /** 字符集（默认 utf8mb4），推荐使用 utf8mb4 支持完整 Unicode */
  charset: z.string().default('utf8mb4'),
}).strict()

// ─── 网络数据库共享字段 ───

const NetworkConfigSchema = z.object({
  /**
   * 连接字符串（可选）
   * 如果提供 url，将优先使用，忽略 host/port 等字段
   */
  url: z.string().optional(),

  /** 数据库主机地址（默认 localhost） */
  host: z.string().default('localhost'),

  /**
   * 数据库端口
   * - PostgreSQL 默认 5432
   * - MySQL 默认 3306
   */
  port: z.number().int().min(1).max(65535).optional(),

  /** 数据库名称 */
  database: z.string(),

  /** 数据库用户名 */
  user: z.string().optional(),

  /** 数据库密码 */
  password: z.string().optional(),

  /** SSL/TLS 连接配置 */
  ssl: SslConfigSchema.optional(),

  /** 连接池配置 */
  pool: PoolConfigSchema.optional(),
})

// ─── 各数据库类型配置 Schema ───

/**
 * SQLite 配置 Schema
 * @example
 * ```ts
 * import { SqliteConfigSchema } from '@h-ai/reldb'
 *
 * const value = SqliteConfigSchema.parse({ type: 'sqlite', database: './data/app.db' })
 * void value
 * ```
 */
export const SqliteConfigSchema = z.object({
  type: z.literal('sqlite'),
  /** 数据库文件路径（如 './data.db'）或 ':memory:'（内存数据库） */
  database: z.string(),
  /** SQLite 特定选项 */
  sqlite: SqliteOptionsSchema.optional(),
  ...OperationLogConfigFieldSchema,
})

/**
 * PostgreSQL 配置 Schema
 * @example
 * ```ts
 * import { PostgresqlConfigSchema } from '@h-ai/reldb'
 *
 * const value = PostgresqlConfigSchema.parse({ type: 'postgresql', database: 'app', host: 'db', pool: { max: 10 } })
 * void value
 * ```
 */
export const PostgresqlConfigSchema = NetworkConfigSchema.extend({
  type: z.literal('postgresql'),
  ...OperationLogConfigFieldSchema,
})

/**
 * MySQL 配置 Schema
 * @example
 * ```ts
 * import { MysqlConfigSchema } from '@h-ai/reldb'
 *
 * const value = MysqlConfigSchema.parse({ type: 'mysql', database: 'app', host: 'db', pool: { max: 10, queueLimit: 100 } })
 * void value
 * ```
 */
export const MysqlConfigSchema = NetworkConfigSchema.extend({
  type: z.literal('mysql'),
  /** 网络数据库URL；MySQL空串表示使用分字段，非空仅mysql://且拒绝query/fragment，优先于host/port/database/user/password */
  url: z.union([z.literal('').transform(() => undefined), z.url({ protocol: /^mysql$/ }).refine(value => !value.includes('?') && !value.includes('#'))]).optional(),
  /** 数据库：SQLite文件路径或:memory:；PostgreSQL必填名称；MySQL无URL时必填，URL模式从URL读取 */
  database: z.string().min(1).optional(),
  /** TLS：PostgreSQL使用其模式；MySQL仅false或严格对象，空对象默认校验证书链和DNS身份 */
  ssl: MysqlSslConfigSchema.optional(),
  /** 连接池配置：PostgreSQL支持min/idleTimeout；MySQL仅max/acquireTimeout/queueLimit，拒绝其他字段 */
  pool: MysqlPoolConfigSchema.optional(),
  /** MySQL 特定选项 */
  mysql: MysqlOptionsSchema.optional(),
  ...OperationLogConfigFieldSchema,
}).refine(config => Boolean(config.url) || Boolean(config.database), { path: ['database'] })

/**
 * 统一数据库配置 Schema（判别联合体）
 *
 * 根据 `type` 字段区分不同数据库类型的配置。
 * @example
 * ```ts
 * import { ReldbConfigSchema } from '@h-ai/reldb'
 *
 * const value = ReldbConfigSchema.parse({ type: 'postgresql', database: 'app', host: 'db' })
 * void value
 * ```
 */
export const ReldbConfigSchema = z.discriminatedUnion('type', [
  SqliteConfigSchema,
  PostgresqlConfigSchema,
  MysqlConfigSchema,
])

/**
 * 数据库配置类型（判别联合体）
 * @example
 * ```ts
 * import { ReldbConfigSchema, type ReldbConfig } from '@h-ai/reldb'
 *
 * const value: ReldbConfig = ReldbConfigSchema.parse({ type: 'postgresql', database: 'app', host: 'db' })
 * void value
 * ```
 */
export type ReldbConfig = z.infer<typeof ReldbConfigSchema>

/**
 * SQLite 配置类型
 * @example
 * ```ts
 * import { SqliteConfigSchema, type SqliteConfig } from '@h-ai/reldb'
 *
 * const value: SqliteConfig = SqliteConfigSchema.parse({ type: 'sqlite', database: './data/app.db' })
 * void value
 * ```
 */
export type SqliteConfig = z.infer<typeof SqliteConfigSchema>

/**
 * PostgreSQL 配置类型
 * @example
 * ```ts
 * import { PostgresqlConfigSchema, type PostgresqlConfig } from '@h-ai/reldb'
 *
 * const value: PostgresqlConfig = PostgresqlConfigSchema.parse({ type: 'postgresql', database: 'app', host: 'db', pool: { max: 10 } })
 * void value
 * ```
 */
export type PostgresqlConfig = z.infer<typeof PostgresqlConfigSchema>

/**
 * MySQL 配置类型
 * @example
 * ```ts
 * import { MysqlConfigSchema, type MysqlConfig } from '@h-ai/reldb'
 *
 * const value: MysqlConfig = MysqlConfigSchema.parse({ type: 'mysql', database: 'app', host: 'db', pool: { max: 10, queueLimit: 100 } })
 * void value
 * ```
 */
export type MysqlConfig = z.infer<typeof MysqlConfigSchema>

/**
 * 数据库配置输入类型（用于 init 等入口）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 * 因此对外 API（如 reldb.init）更适合接收 ReldbConfigInput。
 * @example
 * ```ts
 * import type { ReldbConfigInput } from '@h-ai/reldb'
 *
 * const value: ReldbConfigInput = { type: 'postgresql', host: 'db', database: 'app' }
 * void value
 * ```
 */
export type ReldbConfigInput = z.input<typeof ReldbConfigSchema>
