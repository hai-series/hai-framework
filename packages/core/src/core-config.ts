/**
 * @h-ai/core — 核心配置 Schema
 *
 * 核心模块的配置 Schema 定义（使用 Zod 校验）
 * @module core-config
 */

import { z } from 'zod'

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
