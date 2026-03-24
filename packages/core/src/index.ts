/**
 * @h-ai/core — Node.js 入口
 *
 * Node.js 环境的完整功能入口。
 * @module index
 */

// 配置 Schema 与错误码（CoreErrorCode, CoreConfigSchema 等）
export * from './core-config.js'

// Core 聚合服务（包含 logger, config, error, id, i18n, module, typeUtils, object, string, array, async, time）
export * from './core-main.node.js'

// 类型定义（Result, Logger 等）
export * from './core-types.js'
