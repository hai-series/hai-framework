/**
 * =============================================================================
 * @hai/core - 统一入口
 * =============================================================================
 * 根据运行环境自动选择实现：
 * - Node.js：使用 pino 日志，支持配置文件加载
 * - 浏览器：使用 loglevel 日志
 *
 * 通过 package.json exports 条件自动选择：
 * - "browser" -> ./dist/browser.js
 * - "default" -> ./dist/node.js
 *
 * 所有功能统一通过 core 对象访问：
 * - core.init() - 初始化（Node.js）
 * - core.logger - 日志
 * - core.id - ID 生成
 * - core.config - 配置管理（仅 Node.js）
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
 * // 初始化（可选，Node.js）
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

// 重导出 Node.js 版本作为默认
// 浏览器环境通过 package.json exports 条件选择 browser.ts
export * from './core-index.node.js'
