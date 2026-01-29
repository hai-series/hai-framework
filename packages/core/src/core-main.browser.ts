/**
 * =============================================================================
 * @hai/core - Core 服务聚合（浏览器）
 * =============================================================================
 * 提供统一的 core 对象，聚合常用功能
 * 所有功能统一通过 core 对象访问
 *
 * @example
 * ```ts
 * import { core, initCore } from '@hai/core'
 *
 * // 初始化（可选）
 * initCore({ logging: { level: 'debug' } })
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
 * core.string.capitalize('hello')
 * ```
 * =============================================================================
 */

import type { CoreOptions } from './core-types.js'
import { createCore } from './core-main.js'
import { configureLogger, createLogger, getLogger, getLogLevel, setLogLevel } from './functions/core-function-logger.browser.js'

// =============================================================================
// Core 实例
// =============================================================================

/**
 * Core 服务对象 - 聚合常用功能
 */
export const core = createCore({
  createLogger,
  getLogger,
  configureLogger,
  setLogLevel,
  getLogLevel,
})

/**
 * 初始化 Core（浏览器版本）
 * 注意：浏览器环境不支持 configs 和 watchConfig 选项
 */
export function initCore(options: CoreOptions = {}): void {
  const silent = options.silent ?? false
  const logger = core.logger

  // 配置日志
  if (options.logging) {
    core.configureLogger(options.logging)
  }

  // 警告不支持的选项
  if (options.configs) {
    logger.warn('[core] Browser does not support configs option, use server-side config loading')
  }
  if (options.watchConfig) {
    logger.warn('[core] Browser does not support watchConfig option')
  }

  if (!silent) {
    logger.info('[core] Initialized (browser mode)')
  }
}

// 重导出类型
export type { CoreOptions } from './core-types.js'
