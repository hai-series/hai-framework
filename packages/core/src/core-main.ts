/**
 * =============================================================================
 * @hai/core - Core 服务聚合（通用部分）
 * =============================================================================
 * 提供 Node.js 和浏览器共用的 core 对象结构
 * 所有功能统一通过 core 对象访问
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
 * // 国际化工具（显式传 locale）
 * core.i18n.detectBrowserLocale()
 * core.i18n.resolveLocale(userLocale)
 *
 * // 工具函数（命名空间方式）
 * core.type.isDefined(value)
 * core.object.deepMerge(a, b)
 * core.string.capitalize('hello')
 * core.array.unique([1, 1, 2])
 * core.async.delay(1000)
 * core.time.formatDate(new Date())
 * ```
 * =============================================================================
 */

import type { LoggingConfig } from './core-config.js'
import type { Logger, LoggerFunctions } from './core-types.js'
import { id, isValidNanoId, isValidUUID } from './functions/core-function-id.js'
import * as i18nUtils from './i18n/i18n-utils.js'
import * as arrayUtils from './utils/core-util-array.js'
import * as asyncUtils from './utils/core-util-async.js'
import * as objectUtils from './utils/core-util-object.js'
import * as stringUtils from './utils/core-util-string.js'

import * as timeUtils from './utils/core-util-time.js'
import * as typeUtils from './utils/core-util-type.js'

// =============================================================================
// Core 对象工厂
// =============================================================================

/**
 * 创建 Core 对象
 * @param loggerFns - 平台特定的 Logger 函数
 */
export function createCore(loggerFns: LoggerFunctions) {
  let cachedLogger: Logger | null = null

  return {
    // =====================================================================
    // Logger
    // =====================================================================

    /** 获取默认 Logger */
    get logger(): Logger {
      if (!cachedLogger) {
        cachedLogger = loggerFns.getLogger()
      }
      return cachedLogger
    },

    /** 创建新的 Logger 实例 */
    createLogger: loggerFns.createLogger,

    /** 配置 Logger */
    configureLogger: (config: Partial<LoggingConfig>) => {
      loggerFns.configureLogger(config)
      cachedLogger = null // 重置缓存
    },

    /** 设置日志级别 */
    setLogLevel: loggerFns.setLogLevel,

    /** 获取日志级别 */
    getLogLevel: loggerFns.getLogLevel,

    // =====================================================================
    // i18n 国际化工具
    // =====================================================================

    /**
     * 国际化工具
     *
     * @example
     * ```ts
     * // 设置全局 locale（所有订阅的模块自动同步）
     * core.i18n.setGlobalLocale('en-US')
     *
     * // 获取当前全局 locale
     * core.i18n.getGlobalLocale()
     *
     * // 创建消息获取器（自动订阅 locale 变化）
     * const { getMessage } = core.i18n.createMessageGetter(messages)
     * ```
     */
    i18n: i18nUtils,

    // =====================================================================
    // ID
    // =====================================================================

    /** ID 生成工具 */
    id,

    /** 验证 UUID */
    isValidUUID,

    /** 验证 NanoId */
    isValidNanoId,

    // =====================================================================
    // 工具函数（命名空间方式）
    // =====================================================================

    /** 类型检查工具 */
    type: typeUtils,

    /** 对象操作工具 */
    object: objectUtils,

    /** 字符串操作工具 */
    string: stringUtils,

    /** 数组操作工具 */
    array: arrayUtils,

    /** 异步操作工具 */
    async: asyncUtils,

    /** 时间操作工具 */
    time: timeUtils,
  }
}

/** Core 对象类型 */
export type Core = ReturnType<typeof createCore>
