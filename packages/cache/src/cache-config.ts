/**
 * =============================================================================
 * @hai/cache - 缓存配置 Schema
 * =============================================================================
 *
 * 本文件定义缓存模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（4000-4999 范围）
 * - 缓存类型枚举
 * - Redis 连接配置
 * - 统一的 CacheConfig 配置结构
 *
 * @example
 * ```ts
 * import { CacheConfigSchema, CacheErrorCode } from '@hai/cache'
 *
 * // 校验配置
 * const config = CacheConfigSchema.parse({
 *     type: 'redis',
 *     host: 'localhost',
 *     port: 6379
 * })
 *
 * // 使用错误码
 * if (error.code === CacheErrorCode.NOT_INITIALIZED) {
 *     // 处理错误：请先调用 cache.init()
 * }
 * ```
 *
 * @module cache-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 缓存错误码（数值范围 4000-4999）
 *
 * 用于标识缓存操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { CacheErrorCode } from '@hai/cache'
 *
 * if (result.error?.code === CacheErrorCode.CONNECTION_FAILED) {
 *     // 处理错误：缓存连接失败
 * }
 * ```
 */
export const CacheErrorCode = {
  /** 连接失败 */
  CONNECTION_FAILED: 4000,
  /** 操作失败 */
  OPERATION_FAILED: 4001,
  /** 序列化失败 */
  SERIALIZATION_FAILED: 4002,
  /** 反序列化失败 */
  DESERIALIZATION_FAILED: 4003,
  /** 键不存在 */
  KEY_NOT_FOUND: 4004,
  /** 超时 */
  TIMEOUT: 4005,
  /** 缓存未初始化 */
  NOT_INITIALIZED: 4010,
  /** 不支持的缓存类型 */
  UNSUPPORTED_TYPE: 4011,
  /** 配置错误 */
  CONFIG_ERROR: 4012,
} as const

/** 缓存错误码类型 */
export type CacheErrorCodeType = (typeof CacheErrorCode)[keyof typeof CacheErrorCode]

// =============================================================================
// 缓存配置 Schema
// =============================================================================

/**
 * 缓存类型枚举
 *
 * 支持的缓存类型：
 * - `memory` - 内存缓存（仅单进程，适合开发/测试）
 * - `redis` - Redis 缓存（使用 ioredis）
 */
export const CacheTypeSchema = z.enum(['memory', 'redis'])

/** 缓存类型 */
export type CacheType = z.infer<typeof CacheTypeSchema>

/**
 * Redis 集群节点配置
 */
export const RedisClusterNodeSchema = z.object({
  /** 节点主机 */
  host: z.string(),
  /** 节点端口 */
  port: z.number().int().min(1).max(65535),
})

/** Redis 集群节点类型 */
export type RedisClusterNode = z.infer<typeof RedisClusterNodeSchema>

/**
 * Redis 哨兵配置
 */
export const RedisSentinelConfigSchema = z.object({
  /** 哨兵节点列表 */
  sentinels: z.array(RedisClusterNodeSchema).min(1),
  /** 主节点名称 */
  name: z.string(),
})

/** Redis 哨兵配置类型 */
export type RedisSentinelConfig = z.infer<typeof RedisSentinelConfigSchema>

/**
 * 缓存配置 Schema
 *
 * 支持多种连接方式：
 * - 单机模式（host + port）
 * - URL 模式
 * - 集群模式
 * - 哨兵模式
 *
 * @example
 * ```ts
 * // 单机模式
 * const config = {
 *     type: 'redis',
 *     host: 'localhost',
 *     port: 6379,
 *     password: 'secret',
 *     db: 0
 * }
 *
 * // URL 模式
 * const config = {
 *     type: 'redis',
 *     url: 'redis://:password@localhost:6379/0'
 * }
 *
 * // 集群模式
 * const config = {
 *     type: 'redis',
 *     cluster: [
 *         { host: 'node1', port: 6379 },
 *         { host: 'node2', port: 6379 },
 *         { host: 'node3', port: 6379 }
 *     ]
 * }
 * ```
 */
export const CacheConfigSchema = z.object({
  /** 缓存类型 */
  type: CacheTypeSchema,

  // -------------------------------------------------------------------------
  // 连接配置（多种方式，优先级：url > cluster > sentinel > host）
  // -------------------------------------------------------------------------

  /** 连接 URL（例如：redis://:password@localhost:6379/0） */
  url: z.string().optional(),

  /** Redis 主机（默认 localhost） */
  host: z.string().default('localhost'),

  /** Redis 端口（默认 6379） */
  port: z.number().int().min(1).max(65535).default(6379),

  /** 密码 */
  password: z.string().optional(),

  /** 数据库索引（默认 0） */
  db: z.number().int().min(0).max(15).default(0),

  /** 集群节点配置 */
  cluster: z.array(RedisClusterNodeSchema).optional(),

  /** 哨兵配置 */
  sentinel: RedisSentinelConfigSchema.optional(),

  // -------------------------------------------------------------------------
  // 通用选项
  // -------------------------------------------------------------------------

  /** 连接超时时间（毫秒，默认 10000） */
  connectTimeout: z.number().int().min(0).default(10000),

  /** 命令超时时间（毫秒，默认 5000） */
  commandTimeout: z.number().int().min(0).default(5000),

  /** 键前缀（用于命名空间隔离） */
  keyPrefix: z.string().optional(),

  /** 是否启用 TLS */
  tls: z.boolean().default(false),

  /** 最大重试次数（默认 3） */
  maxRetries: z.number().int().min(0).default(3),

  /** 重试延迟（毫秒，默认 50） */
  retryDelay: z.number().int().min(0).default(50),

  /** 是否启用只读模式（用于从节点） */
  readOnly: z.boolean().default(false),
})

/**
 * 缓存配置类型（parse 后的完整配置）
 * @remarks 由 CacheConfigSchema 解析后的结果，所有默认值已补齐。
 */
export type CacheConfig = z.infer<typeof CacheConfigSchema>

/**
 * 缓存配置输入类型（parse 前，允许省略带默认值的字段）
 * @remarks 适合用于 init 入参或配置文件加载。
 */
export type CacheConfigInput = z.input<typeof CacheConfigSchema>
