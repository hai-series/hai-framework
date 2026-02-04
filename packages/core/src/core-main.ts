/**
 * =============================================================================
 * @hai/core - Core 服务聚合（通用部分）
 * =============================================================================
 * 提供 Node.js 与浏览器共用的 core 对象结构。
 * 所有功能统一通过 core 对象访问，确保 API 一致性。
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 *
 * // 日志
 * core.logger.info('Hello')
 *
 * // ID 生成
 * const myId = core.id.generate()
 *
 * // 国际化工具
 * core.i18n.detectBrowserLocale()
 * core.i18n.resolveLocale(userLocale)
 *
 * // 工具函数（命名空间方式）
 * core.typeUtils.isDefined(value)
 * core.object.deepMerge(a, b)
 * core.string.capitalize('hello')
 * core.array.unique([1, 1, 2])
 * core.async.delay(1000)
 * core.time.formatDate(new Date())
 * ```
 * =============================================================================
 */

import type { LoggingConfig } from './config/index.js'
import type { Logger, LoggerFunctions } from './core-types.js'
import { id } from './functions/core-function-id.js'
import { i18n } from './i18n/index.js'
import { array as arrayUtils } from './utils/core-util-array.js'
import { async as asyncUtils } from './utils/core-util-async.js'
import { object as objectUtils } from './utils/core-util-object.js'
import { string as stringUtils } from './utils/core-util-string.js'

import { time as timeUtils } from './utils/core-util-time.js'
import { typeUtils } from './utils/core-util-type.js'

// =============================================================================
// Core 对象工厂
// =============================================================================

/**
 * 创建 Core 对象（通用内核）。
 * @param loggerFns - 平台特定的 Logger 函数集合
 * @returns core 对象（不含平台扩展）
 *
 * @example
 * ```ts
 * import { createCore } from '@hai/core'
 * import { logger } from '@hai/core'
 *
 * const core = createCore({
 *   createLogger: logger.createLogger,
 *   getLogger: logger.getLogger,
 *   configureLogger: logger.configureLogger,
 *   setLogLevel: logger.setLogLevel,
 *   getLogLevel: logger.getLogLevel,
 * })
 *
 * core.logger.info('Hello')
 * ```
 */
export function createCore(loggerFns: LoggerFunctions) {
  let cachedLogger: Logger | null = null

  return {
    // =====================================================================
    // Logger
    // =====================================================================

    /**
     * 获取默认 Logger（懒加载单例）。
     *
     * @example
     * ```ts
     * core.logger.info('booting')
     * ```
     */
    get logger(): Logger {
      if (!cachedLogger) {
        cachedLogger = loggerFns.getLogger()
      }
      return cachedLogger
    },

    /**
     * 创建新的 Logger 实例。
     *
     * @example
     * ```ts
     * const logger = core.createLogger({ name: 'api' })
     * logger.info('ready')
     * ```
     */
    createLogger: loggerFns.createLogger,

    /**
     * 配置默认 Logger。
     *
     * @example
     * ```ts
     * core.configureLogger({ level: 'warn' })
     * ```
     */
    configureLogger: (config: Partial<LoggingConfig>) => {
      loggerFns.configureLogger(config)
      cachedLogger = null // 重置缓存
    },

    /**
     * 设置日志级别。
     *
     * @example
     * ```ts
     * core.setLogLevel('debug')
     * ```
     */
    setLogLevel: loggerFns.setLogLevel,

    /**
     * 获取当前日志级别。
     *
     * @example
     * ```ts
     * const level = core.getLogLevel()
     * ```
     */
    getLogLevel: loggerFns.getLogLevel,

    // =====================================================================
    // i18n 国际化工具
    // =====================================================================

    /**
     * 国际化工具集合。
     *
     * @example
     * ```ts
     * // 设置全局 locale（所有模块读取全局 locale）
     * core.i18n.setGlobalLocale('en-US')
     *
     * // 获取当前全局 locale
     * core.i18n.getGlobalLocale()
     *
     * // 创建消息获取器（读取全局 locale）
     * const getMessage = core.i18n.createMessageGetter(messages)
     * getMessage('hello')
     * ```
     */
    i18n,

    // =====================================================================
    // ID
    // =====================================================================

    /**
     * ID 生成工具。
     *
     * @example
     * ```ts
     * const id = core.id.generate()
     * const uuid = core.id.uuid()
     * ```
     */
    id,

    // =====================================================================
    // 工具函数（命名空间方式）
    // =====================================================================

    /**
     * 类型检查工具。
     *
     * @example
     * ```ts
     * core.typeUtils.isDefined(value)
     * ```
     */
    typeUtils,

    /**
     * 对象操作工具。
     *
     * @example
     * ```ts
     * core.object.deepMerge(a, b)
     * ```
     */
    object: objectUtils,

    /**
     * 字符串操作工具。
     *
     * @example
     * ```ts
     * core.string.capitalize('hello')
     * ```
     */
    string: stringUtils,

    /**
     * 数组操作工具。
     *
     * @example
     * ```ts
     * core.array.unique([1, 1, 2])
     * ```
     */
    array: arrayUtils,

    /**
     * 异步操作工具。
     *
     * @example
     * ```ts
     * await core.async.delay(100)
     * ```
     */
    async: asyncUtils,

    /**
     * 时间操作工具。
     *
     * @example
     * ```ts
     * core.time.formatDate(new Date())
     * ```
     */
    time: timeUtils,
  }
}

/**
 * Core 对象类型。
 *
 * @example
 * ```ts
 * import type { Core } from '@hai/core'
 * const coreRef: Core = core
 * ```
 */
export type Core = ReturnType<typeof createCore>
