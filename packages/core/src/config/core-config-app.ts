/**
 * =============================================================================
 * @hai/core - 应用配置 Schema
 * =============================================================================
 * 定义应用基础配置的 Zod schema
 * 
 * 对应配置文件: _app.yml
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码（通用 + 配置）
// =============================================================================

/**
 * 通用错误码 (1000-1099)
 */
export const CommonErrorCode = {
    UNKNOWN: 1000,
    VALIDATION: 1001,
    NOT_FOUND: 1002,
    UNAUTHORIZED: 1003,
    FORBIDDEN: 1004,
    CONFLICT: 1005,
    INTERNAL: 1006,
    TIMEOUT: 1007,
    NETWORK: 1008,
} as const
export type CommonErrorCode = typeof CommonErrorCode[keyof typeof CommonErrorCode]

/**
 * 配置错误码 (1100-1199)
 */
export const ConfigErrorCode = {
    FILE_NOT_FOUND: 1100,
    PARSE_ERROR: 1101,
    VALIDATION_ERROR: 1102,
    ENV_VAR_MISSING: 1103,
    NOT_LOADED: 1104,
} as const
export type ConfigErrorCode = typeof ConfigErrorCode[keyof typeof ConfigErrorCode]

// =============================================================================
// 环境与基础配置
// =============================================================================

/**
 * 环境类型
 */
export const EnvSchema = z.enum(['development', 'production', 'test', 'staging'])
export type Env = z.infer<typeof EnvSchema>

/**
 * 日志级别
 */
export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
export type LogLevel = z.infer<typeof LogLevelSchema>

/**
 * 日志格式
 */
export const LogFormatSchema = z.enum(['json', 'pretty'])
export type LogFormat = z.infer<typeof LogFormatSchema>


// =============================================================================
// 日志配置
// =============================================================================

/**
 * 日志配置
 */
export const LoggingConfigSchema = z.object({
    /** 日志级别 */
    level: LogLevelSchema.default('info'),
    /** 日志格式 */
    format: LogFormatSchema.default('json'),
    /** 默认上下文 */
    context: z.record(z.string(), z.unknown()).optional(),
    /** 要脱敏的字段 */
    redact: z.array(z.string()).default([]),
})
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>

// =============================================================================
// ID 生成器配置
// =============================================================================

/**
 * ID 生成器配置
 */
export const IdConfigSchema = z.object({
    /** ID 前缀 */
    prefix: z.string().optional(),
    /** ID 长度 */
    length: z.number().int().min(6).max(64).default(21),
})
export type IdConfig = z.infer<typeof IdConfigSchema>

// =============================================================================
// 功能开关配置
// =============================================================================

/**
 * 功能开关配置
 */
export const FeaturesConfigSchema = z.object({
    /** 是否启用注册 */
    registration: z.boolean().default(true),
    /** 是否启用 API 访问 */
    apiAccess: z.boolean().default(true),
    /** 是否启用 AI 功能 */
    aiEnabled: z.boolean().default(true),
    /** 是否启用 MCP 功能 */
    mcpEnabled: z.boolean().default(false),
    /** 是否启用文件上传 */
    fileUpload: z.boolean().default(true),
})
export type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>

// =============================================================================
// 应用配置
// =============================================================================

/**
 * 应用配置
 */
export const AppConfigSchema = z.object({
    /** 应用名称 */
    name: z.string().default('hai Admin'),
    /** 应用版本 */
    version: z.string().default('0.1.0'),
    /** 运行环境 */
    env: EnvSchema.default('development'),
    /** 是否调试模式 */
    debug: z.boolean().default(false),
    /** 日志配置 */
    logging: LoggingConfigSchema.optional(),
    /** ID生成器配置 */
    id: IdConfigSchema.optional(),
    /** 功能开关 */
    features: FeaturesConfigSchema.optional(),
    /** 时区 */
    timezone: z.string().default('Asia/Shanghai'),
    /** 默认语言 */
    defaultLocale: z.string().default('zh-CN'),
    /** 支持的语言 */
    supportedLocales: z.array(z.string()).default(['zh-CN', 'en-US']),
})
export type AppConfig = z.infer<typeof AppConfigSchema>
