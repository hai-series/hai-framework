/**
 * =============================================================================
 * @h-ai/core - 核心配置 Schema
 * =============================================================================
 * 核心模块的配置 Schema 定义（使用 Zod 校验）
 *
 * 包含：
 * - 错误码定义
 * - 日志配置
 * - ID 生成器配置
 * - 环境配置
 * - 应用配置
 * =============================================================================
 */
import type { z } from 'zod'
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
export declare const CommonErrorCode: {
  /** 未知错误 */
  readonly UNKNOWN: 1000
  /** 校验失败（参数、格式等） */
  readonly VALIDATION: 1001
  /** 资源不存在 */
  readonly NOT_FOUND: 1002
  /** 未认证（缺少凭据） */
  readonly UNAUTHORIZED: 1003
  /** 无权限（凭据不足） */
  readonly FORBIDDEN: 1004
  /** 冲突（资源已存在或版本不一致） */
  readonly CONFLICT: 1005
  /** 内部错误 */
  readonly INTERNAL: 1006
  /** 超时 */
  readonly TIMEOUT: 1007
  /** 网络错误 */
  readonly NETWORK: 1008
}
export type CommonErrorCodeType = typeof CommonErrorCode[keyof typeof CommonErrorCode]
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
export declare const ConfigErrorCode: {
  /** 配置文件不存在 */
  readonly FILE_NOT_FOUND: 1100
  /** YAML 解析失败（语法错误） */
  readonly PARSE_ERROR: 1101
  /** 配置值不符合 Schema 校验 */
  readonly VALIDATION_ERROR: 1102
  /** 环境变量缺失且未提供默认值 */
  readonly ENV_VAR_MISSING: 1103
  /** 配置未加载（尝试在加载前访问） */
  readonly NOT_LOADED: 1104
}
export type ConfigErrorCodeType = typeof ConfigErrorCode[keyof typeof ConfigErrorCode]
/**
 * 环境类型 Schema。
 *
 * @example
 * ```ts
 * EnvSchema.parse('development')
 * ```
 */
export declare const EnvSchema: z.ZodEnum<{
  development: 'development'
  production: 'production'
  test: 'test'
  staging: 'staging'
}>
export type Env = z.infer<typeof EnvSchema>
/**
 * 日志级别 Schema。
 *
 * @example
 * ```ts
 * LogLevelSchema.parse('info')
 * ```
 */
export declare const LogLevelSchema: z.ZodEnum<{
  trace: 'trace'
  debug: 'debug'
  info: 'info'
  warn: 'warn'
  error: 'error'
  fatal: 'fatal'
}>
export type LogLevel = z.infer<typeof LogLevelSchema>
/**
 * 日志格式 Schema。
 *
 * @example
 * ```ts
 * LogFormatSchema.parse('json')
 * ```
 */
export declare const LogFormatSchema: z.ZodEnum<{
  json: 'json'
  pretty: 'pretty'
}>
export type LogFormat = z.infer<typeof LogFormatSchema>
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
export declare const LoggingConfigSchema: z.ZodObject<{
  level: z.ZodDefault<z.ZodEnum<{
    trace: 'trace'
    debug: 'debug'
    info: 'info'
    warn: 'warn'
    error: 'error'
    fatal: 'fatal'
  }>>
  format: z.ZodDefault<z.ZodEnum<{
    json: 'json'
    pretty: 'pretty'
  }>>
  context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>
  redact: z.ZodDefault<z.ZodArray<z.ZodString>>
}, z.core.$strip>
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>
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
export declare const IdConfigSchema: z.ZodObject<{
  prefix: z.ZodOptional<z.ZodString>
  length: z.ZodDefault<z.ZodNumber>
}, z.core.$strip>
export type IdConfig = z.infer<typeof IdConfigSchema>
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
export declare const CoreConfigSchema: z.ZodObject<{
  name: z.ZodDefault<z.ZodString>
  version: z.ZodDefault<z.ZodString>
  env: z.ZodDefault<z.ZodEnum<{
    development: 'development'
    production: 'production'
    test: 'test'
    staging: 'staging'
  }>>
  debug: z.ZodDefault<z.ZodBoolean>
  logging: z.ZodOptional<z.ZodObject<{
    level: z.ZodDefault<z.ZodEnum<{
      trace: 'trace'
      debug: 'debug'
      info: 'info'
      warn: 'warn'
      error: 'error'
      fatal: 'fatal'
    }>>
    format: z.ZodDefault<z.ZodEnum<{
      json: 'json'
      pretty: 'pretty'
    }>>
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>
    redact: z.ZodDefault<z.ZodArray<z.ZodString>>
  }, z.core.$strip>>
  id: z.ZodOptional<z.ZodObject<{
    prefix: z.ZodOptional<z.ZodString>
    length: z.ZodDefault<z.ZodNumber>
  }, z.core.$strip>>
  defaultLocale: z.ZodDefault<z.ZodString>
}, z.core.$strip>
export type CoreConfig = z.infer<typeof CoreConfigSchema>
// # sourceMappingURL=core-config.d.ts.map
