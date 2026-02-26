/**
 * =============================================================================
 * @h-ai/core - 浏览器入口
 * =============================================================================
 * 浏览器环境的完整功能入口。
 *
 * 所有功能统一通过 core 对象访问：
 * - core.logger - 日志
 * - core.id - ID 生成
 * - core.i18n - 国际化
 * - core.module - 模块基础工具
 * - core.typeUtils - 类型检查
 * - core.object - 对象操作
 * - core.string - 字符串操作
 * - core.array - 数组操作
 * - core.async - 异步工具
 * - core.time - 时间工具
 *
 * 注意：浏览器环境不支持配置文件加载（core.config）
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * import type { Result, Logger } from '@h-ai/core'
 * import { CoreConfigSchema, CommonErrorCode } from '@h-ai/core'
 *
 * // 日志
 * core.logger.info('Hello')
 *
 * // ID 生成
 * const myId = core.id.generate()
 *
 * // 工具函数
 * core.typeUtils.isDefined(value)
 * core.object.deepMerge(a, b)
 * ```
 * =============================================================================
 */

// 配置类型与错误码（CommonErrorCode, ConfigErrorCode, CoreConfigSchema 等）
export * from './core-config.js'

// Core 聚合服务（包含 logger, id, i18n, module, typeUtils, object, string, array, async, time）
export * from './core-main.browser.js'

// 类型定义（Result, Logger, i18n 公共类型等）
export * from './core-types.js'
