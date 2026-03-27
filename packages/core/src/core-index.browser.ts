/**
 * @h-ai/core — 浏览器入口
 *
 * 浏览器环境的完整功能入口。
 * @module core-index.browser
 */

// 配置 Schema 与错误码（CoreErrorCode, CoreConfigSchema 等）
export * from './core-config.js'

// Core 聚合服务（包含 logger, error, id, i18n, module, typeUtils, object, string, array, async, time）
export * from './core-main.browser.js'

// 类型定义（Result, Logger, i18n 公共类型等）
export * from './core-types.js'
