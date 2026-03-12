/**
 * @h-ai/cache — 错误码 + 配置 Schema
 *
 * 定义缓存模块的错误码常量、Zod Schema 和配置类型。
 * @module cache-config
 */

import { z } from 'zod'

// ─── 错误码 ───

/**
 * 缓存错误码（数值范围 4000-4999）
 *
 * @example
 * ```ts
 * if (result.error?.code === CacheErrorCode.CONNECTION_FAILED) {
 *     // 处理连接失败
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

/** 缓存错误码 → HTTP 状态码映射 */
export const CacheErrorHttpStatus: Record<number, number> = {
  [CacheErrorCode.CONNECTION_FAILED]: 500,
  [CacheErrorCode.OPERATION_FAILED]: 500,
  [CacheErrorCode.SERIALIZATION_FAILED]: 500,
  [CacheErrorCode.DESERIALIZATION_FAILED]: 500,
  [CacheErrorCode.KEY_NOT_FOUND]: 404,
  [CacheErrorCode.TIMEOUT]: 504,
  [CacheErrorCode.NOT_INITIALIZED]: 500,
  [CacheErrorCode.UNSUPPORTED_TYPE]: 400,
  [CacheErrorCode.CONFIG_ERROR]: 500,
}

// ─── 配置 Schema ───

/** Redis 集群节点配置 */
export const RedisClusterNodeSchema = z.object({
  /** 节点主机地址 */
  host: z.string(),
  /** 节点端口号（1~65535） */
  port: z.number().int().min(1).max(65535),
})

/** Redis 集群节点类型 */
export type RedisClusterNode = z.infer<typeof RedisClusterNodeSchema>

/** Redis 哨兵模式配置 */
export const RedisSentinelConfigSchema = z.object({
  /** 哨兵节点列表（至少 1 个） */
  sentinels: z.array(RedisClusterNodeSchema).min(1),
  /** 哨兵监控的主节点名称 */
  name: z.string(),
})

/** Redis 哨兵模式配置类型 */
export type RedisSentinelConfig = z.infer<typeof RedisSentinelConfigSchema>

/** 内存缓存配置（仅用于开发/测试，不支持跨进程共享） */
export const MemoryConfigSchema = z.object({
  type: z.literal('memory'),
})

/**
 * Redis 缓存配置
 *
 * 连接优先级：url > cluster > sentinel > host
 */
export const RedisConfigSchema = z.object({
  type: z.literal('redis'),

  // 连接（优先级：url > cluster > sentinel > host）
  /** Redis 连接 URL（如 redis://user:pass@host:6379/0），优先级最高 */
  url: z.string().optional(),
  /** 主机地址；默认 'localhost' */
  host: z.string().default('localhost'),
  /** 端口号；默认 6379 */
  port: z.number().int().min(1).max(65535).default(6379),
  /** 认证密码 */
  password: z.string().optional(),
  /** 数据库编号（0~15）；默认 0 */
  db: z.number().int().min(0).max(15).default(0),
  /** 集群节点列表；配置后以集群模式连接 */
  cluster: z.array(RedisClusterNodeSchema).optional(),
  /** 哨兵配置；配置后以哨兵模式连接 */
  sentinel: RedisSentinelConfigSchema.optional(),

  // 通用选项
  /** 连接超时时间（毫秒）；默认 10000 */
  connectTimeout: z.number().int().min(0).default(10000),
  /** 命令执行超时（毫秒）；默认 5000 */
  commandTimeout: z.number().int().min(0).default(5000),
  /** 键前缀（自动加在所有键前） */
  keyPrefix: z.string().optional(),
  /** 是否开启 TLS；默认 false */
  tls: z.boolean().default(false),
  /** 最大重试次数；默认 3 */
  maxRetries: z.number().int().min(0).default(3),
  /** 重试间隔基数（毫秒）；实际间隔 = retryDelay × 重试次数；默认 50 */
  retryDelay: z.number().int().min(0).default(50),
  /** 是否只读模式；默认 false */
  readOnly: z.boolean().default(false),
})

/** 缓存配置 Schema；通过 type 字段区分 memory / redis */
export const CacheConfigSchema = z.discriminatedUnion('type', [
  MemoryConfigSchema,
  RedisConfigSchema,
])

/** 缓存配置类型（Zod parse 后的完整类型，所有默认值已填充） */
export type CacheConfig = z.infer<typeof CacheConfigSchema>

/** 缓存配置输入类型（Zod parse 前，允许省略带默认值的字段） */
export type CacheConfigInput = z.input<typeof CacheConfigSchema>
