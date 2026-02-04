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
import { logger } from './functions/core-function-logger.browser.js'

// =============================================================================
// Core 实例
// =============================================================================

/**
 * 创建 Browser 版本的 core 对象
 */
function createBrowserCore() {
  const baseCore = createCore({
    createLogger: logger.createLogger,
    getLogger: logger.getLogger,
    configureLogger: logger.configureLogger,
    setLogLevel: logger.setLogLevel,
    getLogLevel: logger.getLogLevel,
  })

  // 扩展 config 和 init 功能
  return {
    ...baseCore,
    /** 初始化 Core */
    init: initCore,
  }
}

/**
 * Core 服务对象 - 聚合常用功能
 */
export const core = createBrowserCore()

/**
 * 初始化 Core（浏览器版本）
 * 注意：浏览器环境不支持 configs 和 watchConfig 选项
 */
export function initCore(options: CoreOptions = {}): void {
  const logger = core.logger

  // 配置日志
  if (options.logging) {
    core.configureLogger(options.logging)
  }

  if (options.watchConfig) {
    logger.warn('[core] Browser does not support watchConfig option')
  }

  logger.info('[core] Initialized (browser mode)')
}