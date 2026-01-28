/**
 * =============================================================================
 * @hai/config - 应用配置 Schema
 * =============================================================================
 * 定义应用基础配置的 Zod schema
 * 
 * 对应配置文件: _app.yml, app.yml
 * =============================================================================
 */

import { z } from 'zod'

/**
 * 环境类型
 */
export const EnvSchema = z.enum(['development', 'production', 'test', 'staging'])
export type Env = z.infer<typeof EnvSchema>

/**
 * 服务器配置
 */
export const ServerConfigSchema = z.object({
    /** 监听端口 */
    port: z.number().int().min(1).max(65535).default(3000),
    /** 监听地址 */
    host: z.string().default('0.0.0.0'),
    /** 是否启用 HTTPS */
    https: z.boolean().default(false),
    /** HTTPS 证书路径 */
    certPath: z.string().optional(),
    /** HTTPS 私钥路径 */
    keyPath: z.string().optional(),
    /** 信任代理 */
    trustProxy: z.boolean().default(true),
})
export type ServerConfig = z.infer<typeof ServerConfigSchema>

/**
 * 日志配置
 */
export const LogConfigSchema = z.object({
    /** 日志级别 */
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    /** 是否美化输出 */
    pretty: z.boolean().default(false),
    /** 要脱敏的字段 */
    redact: z.array(z.string()).default([]),
})
export type LogConfig = z.infer<typeof LogConfigSchema>

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
    /** 服务器配置 */
    server: ServerConfigSchema.default({}),
    /** 日志配置 */
    log: LogConfigSchema.default({}),
    /** 功能开关 */
    features: FeaturesConfigSchema.default({}),
    /** 时区 */
    timezone: z.string().default('Asia/Shanghai'),
    /** 默认语言 */
    defaultLocale: z.string().default('zh-CN'),
    /** 支持的语言 */
    supportedLocales: z.array(z.string()).default(['zh-CN', 'en-US']),
})
export type AppConfig = z.infer<typeof AppConfigSchema>
