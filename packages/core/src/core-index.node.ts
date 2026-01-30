/**
 * =============================================================================
 * @hai/core - Node.js 入口
 * =============================================================================
 * Node.js 环境的完整功能入口
 *
 * 所有功能统一通过 core 对象访问：
 * - core.init() - 初始化
 * - core.logger - 日志
 * - core.id - ID 生成
 * - core.config - 配置管理
 * - core.type - 类型检查
 * - core.object - 对象操作
 * - core.string - 字符串操作
 * - core.array - 数组操作
 * - core.async - 异步工具
 * - core.time - 时间工具
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 * import type { Result, Logger } from '@hai/core'
 * import { CoreConfigSchema, CommonErrorCode } from '@hai/core'
 *
 * // 初始化
 * core.init({ silent: false })
 *
 * // 日志
 * core.logger.info('Hello')
 *
 * // ID 生成
 * const myId = core.id.generate()
 *
 * // 工具函数
 * core.type.isDefined(value)
 * core.object.deepMerge(a, b)
 * ```
 * =============================================================================
 */

// Schema（包含错误码）- 这些仍然直接导出
export * from './config/index.js'

// Core 聚合服务（包含 logger, id, type, object, string, array, async, time）
export * from './core-main.node.js'

// 类型定义（Result, Logger 等）
export * from './core-types.js'

// i18n 国际化
export * from './i18n/index.js'
