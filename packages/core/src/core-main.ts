/**
 * @h-ai/core — Core 服务聚合（通用部分）
 *
 * 提供 Node.js 与浏览器共用的 core 对象结构。 所有功能统一通过 core 对象访问，确保 API 一致性。
 * @module core-main
 */

import type { CoreFunctions, CoreLogger, LoggerFunctions } from './core-types.js'
import { error } from './functions/core-function-error.js'
import { id } from './functions/core-function-id.js'
import { i18n } from './i18n/core-i18n-utils.js'
import { array as arrayUtils } from './utils/core-util-array.js'
import { async as asyncUtils } from './utils/core-util-async.js'
import { createNotInitializedKit } from './utils/core-util-module.js'
import { object as objectUtils } from './utils/core-util-object.js'

import { string as stringUtils } from './utils/core-util-string.js'
import { time as timeUtils } from './utils/core-util-time.js'
import { typeUtils } from './utils/core-util-type.js'

// ─── Core 对象工厂 ───

/**
 * 创建 Core 对象（通用内核）。
 * @param loggerFns - 平台特定的 Logger 函数集合
 * @returns core 对象（不含平台扩展）
 *
 * @example
 * ```ts
 * import { createCore } from '@h-ai/core'
 * import { logger } from '@h-ai/core'
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
export function createCore(loggerFns: LoggerFunctions): CoreFunctions {
  let cachedCoreLogger: CoreLogger | null = null

  const buildCoreLogger = (): CoreLogger => {
    const base = loggerFns.getLogger()
    return {
      trace: (msg, ctx) => base.trace(msg, ctx),
      debug: (msg, ctx) => base.debug(msg, ctx),
      info: (msg, ctx) => base.info(msg, ctx),
      warn: (msg, ctx) => base.warn(msg, ctx),
      error: (msg, ctx) => base.error(msg, ctx),
      fatal: (msg, ctx) => base.fatal(msg, ctx),
      child: ctx => base.child(ctx),
      create: loggerFns.createLogger,
      configure: (config) => {
        loggerFns.configureLogger(config)
        cachedCoreLogger = null // 重置缓存
      },
      setLevel: loggerFns.setLogLevel,
      getLevel: loggerFns.getLogLevel,
    }
  }

  return {
    // ─── Logger ───

    /**
     * 默认 Logger（懒加载单例），同时提供 create / configure / setLevel / getLevel 管理方法。
     *
     * @example
     * ```ts
     * core.logger.info('booting')
     * core.logger.configure({ level: 'debug' })
     * core.logger.setLevel('warn')
     * const level = core.logger.getLevel()
     * const db = core.logger.create({ name: 'db' })
     * ```
     */
    get logger(): CoreLogger {
      if (!cachedCoreLogger) {
        cachedCoreLogger = buildCoreLogger()
      }
      return cachedCoreLogger
    },

    // ─── i18n 国际化工具 ───

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

    // ─── ID ───

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

    // ─── 工具函数（命名空间方式） ───

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

    // ─── 模块基础能力 ───

    /**
     * 错误工具（统一入口）。
     *
     * 提供错误定义生成与错误实例创建方法，支持跨模块统一的错误码和 HTTP 状态映射。
     *
     * @example
     * ```ts
     * // 为模块生成标准错误定义
     * const DbError = core.error.buildHaiErrorsDef('db', {
     *   CONNECTION_FAILED: '101:500',
     *   QUERY_TIMEOUT: '102:504',
     * })
     *
     * // 创建错误实例（带上下文信息）
     * const err = core.error.buildHaiErrorInst(
     *   DbError.CONNECTION_FAILED,
     *   'Unable to connect to PostgreSQL',
     *   originalError,
     *   'Please check database connection string'
     * )
     * ```
     */
    error,

    /**
     * 模块基础工具集。
     *
     * 提供各模块共用的未初始化错误处理等基础能力。
     *
     * @example
     * ```ts
     * const notInitialized = core.module.createNotInitializedKit(
     *   HaiDbError.NOT_INITIALIZED,
     *   () => dbM('db_notInitialized'),
     * )
     * ```
     */
    module: {
      createNotInitializedKit,
    },
  }
}
