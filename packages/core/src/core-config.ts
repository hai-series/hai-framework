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
 * @example
 * ```ts
 * import { EnvSchema } from '@h-ai/core'
 * const config = EnvSchema.parse('production')
 * ```
 */
export const EnvSchema = z.enum(['development', 'production', 'test', 'staging'])

/**
 * 日志级别 Schema。
 * @example
 * ```ts
 * import { LogLevelSchema } from '@h-ai/core'
 * const config = LogLevelSchema.parse('info')
 * ```
 */
export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])

/**
 * 日志格式 Schema。
 * @example
 * ```ts
 * import { LogFormatSchema } from '@h-ai/core'
 * const config = LogFormatSchema.parse('json')
 * ```
 */
export const LogFormatSchema = z.enum(['json', 'pretty'])

// ─── 日志配置 Schema ───

/**
 * 日志配置 Schema。
 * @example
 * ```ts
 * import { LoggingConfigSchema } from '@h-ai/core'
 * const config = LoggingConfigSchema.parse({ level: 'warn', format: 'json', redact: ['password'] })
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

// ─── Core 配置 Schema ───

/**
 * Core 配置 Schema。
 *
 * 描述应用的基础元数据和日志配置，通常通过 `_core.yml` 加载。
 * 未声明的字段拒绝加载；业务配置放独立 app.yml 并使用应用 Schema 校验。
 * ID 长度/前缀由每次 core.id 调用参数决定，不存在全局 ID 配置。
 * @example
 * ```ts
 * import { CoreConfigSchema } from '@h-ai/core'
 * const config = CoreConfigSchema.parse({ name: 'orders', env: 'production', logging: { level: 'info' } })
 * ```
 */
export const CoreConfigSchema = z.strictObject({
  /** 应用名称（默认 'hai Admin'） */
  name: z.string().default('hai Admin'),
  /** 应用版本（默认 '0.1.0'） */
  version: z.string().default('0.1.0'),
  /** 运行环境（默认 'development'） */
  env: EnvSchema.default('development'),
  /** 日志配置（可选） */
  logging: LoggingConfigSchema.optional(),
  /** 默认语言（默认 'zh-CN'） */
  defaultLocale: z.string().default('zh-CN'),
})

export { AccessConditionSchema, RequestAccessConfigSchema, RequestAccessPolicySchema, TrustedProxiesSchema } from './core-access-config.js'
