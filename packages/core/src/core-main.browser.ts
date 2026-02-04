/**
 * =============================================================================
 * @hai/core - Core 服务聚合（浏览器）
 * =============================================================================
 * 提供浏览器环境的 core 对象，聚合常用功能。
 * 所有功能统一通过 core 对象访问（不含 config 能力）。
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 *
 * // 初始化（可选）
 * core.init({ logging: { level: 'debug' } })
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
 * 创建 Browser 版本的 core 对象。
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 * core.logger.info('ready')
 * ```
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
 * Core 服务对象 - 聚合常用功能（浏览器）。
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 * core.logger.info('browser ready')
 * ```
 */
export const core = createBrowserCore()

/**
 * 初始化 Core（内部实现，通过 core.init() 调用）。
 * 注意：浏览器环境不支持 config 和 watchConfig 选项。
 *
 * @param options - 初始化选项
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 * core.init({ logging: { level: 'debug' } })
 * ```
 */
function initCore(options: CoreOptions = {}): void {
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
