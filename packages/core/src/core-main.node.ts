/**
 * =============================================================================
 * @hai/core - Core 服务聚合（Node.js）
 * =============================================================================
 * 提供统一的 core 对象，聚合常用功能
 * 所有功能统一通过 core 对象访问
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 * import { AppConfigSchema } from '@hai/core'
 *
 * // 初始化（加载配置文件）
 * core.init({
 *     logging: { level: 'debug' },
 *     configs: [
 *         { name: 'app', filePath: './config/app.yml', schema: AppConfigSchema }
 *     ],
 *     watchConfig: true,
 * })
 *
 * // 日志
 * core.logger.info('Hello')
 *
 * // ID 生成
 * const myId = core.id.generate()
 *
 * // 配置管理
 * const appConfig = core.config.get('app')
 *
 * // 工具函数
 * core.type.isDefined(value)
 * core.object.deepMerge(a, b)
 * ```
 * =============================================================================
 */

import type { ConfigLoadItem, CoreOptions } from './core-types.js'
import { createCore } from './core-main.js'
import { config, unwatchConfig, watchConfig } from './functions/core-function-config.js'
import { configureLogger, createLogger, getLogger, getLogLevel, setLogLevel } from './functions/core-function-logger.node.js'

// =============================================================================
// Core 实例
// =============================================================================

/**
 * 创建 Node.js 版本的 core 对象
 */
function createNodeCore() {
  const baseCore = createCore({
    createLogger,
    getLogger,
    configureLogger,
    setLogLevel,
    getLogLevel,
  })

  // 扩展 config 和 init 功能
  return {
    ...baseCore,
    /** 配置管理 */
    config,
    /** 初始化 Core */
    init: initCore,
  }
}

/**
 * Core 服务对象 - 聚合常用功能
 */
export const core = createNodeCore()

// =============================================================================
// Initialization
// =============================================================================

/**
 * 初始化 Core（内部实现，通过 core.init() 调用）
 */
function initCore(options: CoreOptions = {}): void {
  const startTime = Date.now()
  const silent = options.silent ?? false
  const logger = core.logger

  // 1. Configure logging
  if (options.logging) {
    core.configureLogger(options.logging)
  }

  if (!silent) {
    logger.info('[core] Initializing...')
  }

  // 2. Load config files
  if (options.configs && options.configs.length > 0) {
    for (const item of options.configs) {
      const result = config.load(item.name, item.filePath, item.schema)
      if (result.success) {
        if (!silent) {
          logger.info(`[core] Config loaded: ${item.name} <- ${item.filePath}`)
        }
        // Register change callback
        if (item.onChange) {
          config.onChange(item.name, item.onChange)
        }
      }
      else {
        logger.error(`[core] Config load failed: ${item.name}`, {
          error: result.error,
        })
      }
    }

    // 3. Enable config file watching
    if (options.watchConfig) {
      setupConfigWatch(options.configs, silent)
    }
  }

  if (!silent) {
    const duration = Date.now() - startTime
    logger.info(`[core] Initialized (${duration}ms)`)
  }
}

/**
 * Setup config file watching
 */
function setupConfigWatch(configs: ConfigLoadItem[], silent: boolean): void {
  const logger = core.logger

  for (const item of configs) {
    const success = watchConfig(item.name, (name, reloadSuccess, error) => {
      if (reloadSuccess) {
        if (!silent) {
          logger.info(`[core] Config reloaded: ${name}`)
        }
      }
      else {
        logger.error(`[core] Config reload failed: ${name}`, { error })
      }
    })

    if (success && !silent) {
      logger.debug(`[core] Config watch enabled: ${item.name}`)
    }
    else if (!success) {
      logger.warn(`[core] Cannot watch config: ${item.filePath}`)
    }
  }
}

/**
 * Stop config file watching
 */
export function stopConfigWatch(name?: string): void {
  unwatchConfig(name)
}

// Re-export types
export type { ConfigLoadItem, CoreOptions } from './core-types.js'
