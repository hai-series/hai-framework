/**
 * =============================================================================
 * @hai/core - 浏览器入口
 * =============================================================================
 * 浏览器环境的完整功能入口。
 *
 * 所有功能统一通过 core 对象访问：
 * - core.logger - 日志
 * - core.id - ID 生成
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
 * import { core } from '@hai/core'
 * import type { Result, Logger } from '@hai/core'
 * import { CoreConfigSchema, CommonErrorCode } from '@hai/core'
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

// Core 聚合服务（包含 logger, id, type, object, string, array, async, time）
export * from './core-main.browser.js'

// 类型定义（Result, Logger 等）
export * from './core-types.js'

// i18n 类型导出
export type {
  InterpolationParams,
  Locale,
  LocaleInfo,
  LocaleMessages,
  MessageDictionary,
  MessageOptions,
} from './i18n/index.js'
