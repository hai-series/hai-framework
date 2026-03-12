/**
 * @h-ai/core — 核心配置 Schema
 *
 * 核心模块的配置 Schema 定义（使用 Zod 校验）
 * @module core-config
 */

import { z } from 'zod'

// ─── 错误码（通用 + 配置） ───

/**
 * 通用错误码 (1000-1099)。
 *
 * 适用于所有模块的通用错误场景。
 *
 * @example
 * ```ts
 * CommonErrorCode.UNKNOWN     // 1000 - 未知错误
 * CommonErrorCode.VALIDATION   // 1001 - 校验失败
 * CommonErrorCode.NOT_FOUND    // 1002 - 资源不存在
 * ```
 */
export const CommonErrorCode = {
  /** 未知错误 */
  UNKNOWN: 1000,
  /** 校验失败（参数、格式等） */
  VALIDATION: 1001,
  /** 资源不存在 */
  NOT_FOUND: 1002,
  /** 未认证（缺少凭据） */
  UNAUTHORIZED: 1003,
  /** 无权限（凭据不足） */
  FORBIDDEN: 1004,
  /** 冲突（资源已存在或版本不一致） */
  CONFLICT: 1005,
  /** 内部错误 */
  INTERNAL: 1006,
  /** 超时 */
  TIMEOUT: 1007,
  /** 网络错误 */
  NETWORK: 1008,
} as const
export type CommonErrorCodeType = typeof CommonErrorCode[keyof typeof CommonErrorCode]

/** 通用错误码 → HTTP 状态码映射 */
export const CommonErrorHttpStatus: Record<number, number> = {
  [CommonErrorCode.UNKNOWN]: 500,
  [CommonErrorCode.VALIDATION]: 400,
  [CommonErrorCode.NOT_FOUND]: 404,
  [CommonErrorCode.UNAUTHORIZED]: 401,
  [CommonErrorCode.FORBIDDEN]: 403,
  [CommonErrorCode.CONFLICT]: 409,
  [CommonErrorCode.INTERNAL]: 500,
  [CommonErrorCode.TIMEOUT]: 504,
  [CommonErrorCode.NETWORK]: 502,
}

/**
 * 配置错误码 (1100-1199)。
 *
 * 适用于配置文件加载、解析、校验等场景。
 *
 * @example
 * ```ts
 * ConfigErrorCode.FILE_NOT_FOUND    // 1100 - 文件不存在
 * ConfigErrorCode.PARSE_ERROR       // 1101 - YAML 解析失败
 * ConfigErrorCode.VALIDATION_ERROR  // 1102 - Schema 校验失败
 * ConfigErrorCode.ENV_VAR_MISSING   // 1103 - 环境变量缺失
 * ConfigErrorCode.NOT_LOADED        // 1104 - 配置未加载
 * ```
 */
export const ConfigErrorCode = {
  /** 配置文件不存在 */
  FILE_NOT_FOUND: 1100,
  /** YAML 解析失败（语法错误） */
  PARSE_ERROR: 1101,
  /** 配置值不符合 Schema 校验 */
  VALIDATION_ERROR: 1102,
  /** 环境变量缺失且未提供默认值 */
  ENV_VAR_MISSING: 1103,
  /** 配置未加载（尝试在加载前访问） */
  NOT_LOADED: 1104,
} as const
export type ConfigErrorCodeType = typeof ConfigErrorCode[keyof typeof ConfigErrorCode]

/** 配置错误码 → HTTP 状态码映射 */
export const ConfigErrorHttpStatus: Record<number, number> = {
  [ConfigErrorCode.FILE_NOT_FOUND]: 500,
  [ConfigErrorCode.PARSE_ERROR]: 500,
  [ConfigErrorCode.VALIDATION_ERROR]: 500,
  [ConfigErrorCode.ENV_VAR_MISSING]: 500,
  [ConfigErrorCode.NOT_LOADED]: 500,
}

// ─── 环境与基础配置 Schema ───

/**
 * 环境类型 Schema。
 *
 * @example
 * ```ts
 * EnvSchema.parse('development')
 * ```
 */
export const EnvSchema = z.enum(['development', 'production', 'test', 'staging'])
export type Env = z.infer<typeof EnvSchema>

/**
 * 日志级别 Schema。
 *
 * @example
 * ```ts
 * LogLevelSchema.parse('info')
 * ```
 */
export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
export type LogLevel = z.infer<typeof LogLevelSchema>

/**
 * 日志格式 Schema。
 *
 * @example
 * ```ts
 * LogFormatSchema.parse('json')
 * ```
 */
export const LogFormatSchema = z.enum(['json', 'pretty'])
export type LogFormat = z.infer<typeof LogFormatSchema>

// ─── 日志配置 Schema ───

/**
 * 日志配置 Schema。
 *
 * @example 最小配置（全部使用默认值）
 * ```ts
 * LoggingConfigSchema.parse({})
 * // => { level: 'info', format: 'json', redact: [] }
 * ```
 *
 * @example 开发环境（pretty 格式 + debug 级别）
 * ```ts
 * LoggingConfigSchema.parse({ level: 'debug', format: 'pretty' })
 * // => { level: 'debug', format: 'pretty', redact: [] }
 * ```
 *
 * @example 带上下文与脱敏
 * ```ts
 * LoggingConfigSchema.parse({
 *   level: 'warn',
 *   format: 'json',
 *   context: { service: 'api-gateway', region: 'us-east-1' },
 *   redact: ['password', 'token', 'headers.authorization'],
 * })
 * // => { level: 'warn', format: 'json', context: { service: 'api-gateway', region: 'us-east-1' }, redact: ['password', 'token', 'headers.authorization'] }
 * ```
 *
 * @example 在 _core.yml 中配置
 * ```yaml
 * logging:
 *   level: info
 *   format: json
 *   context:
 *     service: my-app
 *   redact:
 *     - password
 *     - token
 * ```
 */
export const LoggingConfigSchema = z.object({
  /** 日志级别（默认 'info'） */
  level: LogLevelSchema.default('info'),
  /** 日志格式：'json' 用于生产环境，'pretty' 用于开发环境（默认 'json'） */
  format: LogFormatSchema.default('json'),
  /** 默认上下文，会自动添加到每条日志 */
  context: z.record(z.string(), z.unknown()).optional(),
  /** 要脱敏的字段路径列表（如 ['password', 'token']，默认 []） */
  redact: z.array(z.string()).default([]),
})
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>

// ─── ID 生成器配置 Schema ───

/**
 * ID 生成器配置 Schema。
 *
 * @example
 * ```ts
 * IdConfigSchema.parse({ length: 12 })
 * // => { length: 12 }
 *
 * IdConfigSchema.parse({ prefix: 'usr_', length: 16 })
 * // => { prefix: 'usr_', length: 16 }
 * ```
 */
export const IdConfigSchema = z.object({
  /** ID 前缀（可选，生成时自动拼接） */
  prefix: z.string().optional(),
  /** ID 长度（范围 6-64，默认 21） */
  length: z.number().int().min(6).max(64).default(21),
})
export type IdConfig = z.infer<typeof IdConfigSchema>

// ─── Core 配置 Schema ───

/**
 * Core 配置 Schema。
 *
 * 描述应用的基础配置，通常通过 `_core.yml` 加载。
 *
 * @example
 * ```ts
 * CoreConfigSchema.parse({ name: 'demo', env: 'production' })
 * // => { name: 'demo', version: '0.1.0', env: 'production', debug: false, defaultLocale: 'zh-CN' }
 * ```
 */
export const CoreConfigSchema = z.object({
  /** 应用名称（默认 'hai Admin'） */
  name: z.string().default('hai Admin'),
  /** 应用版本（默认 '0.1.0'） */
  version: z.string().default('0.1.0'),
  /** 运行环境（默认 'development'） */
  env: EnvSchema.default('development'),
  /** 是否调试模式（默认 false） */
  debug: z.boolean().default(false),
  /** 日志配置（可选） */
  logging: LoggingConfigSchema.optional(),
  /** ID 生成器配置（可选） */
  id: IdConfigSchema.optional(),
  /** 默认语言（默认 'zh-CN'） */
  defaultLocale: z.string().default('zh-CN'),
})
export type CoreConfig = z.infer<typeof CoreConfigSchema>
