/**
 * =============================================================================
 * @h-ai/core - Core 服务聚合（通用部分）
 * =============================================================================
 * 提供 Node.js 与浏览器共用的 core 对象结构。
 * 所有功能统一通过 core 对象访问，确保 API 一致性。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
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
import type { LoggingConfig } from './core-config.js'
import type { Logger, LoggerFunctions } from './core-types.js'
import type { createNotInitializedKit } from './utils/core-util-module.js'
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
export declare function createCore(loggerFns: LoggerFunctions): {
  /**
   * 获取默认 Logger（懒加载单例）。
   *
   * @example
   * ```ts
   * core.logger.info('booting')
   * ```
   */
  readonly logger: Logger
  /**
   * 创建新的 Logger 实例。
   *
   * @example
   * ```ts
   * const logger = core.createLogger({ name: 'api' })
   * logger.info('ready')
   * ```
   */
  createLogger: (options?: import('./core-types.js').LoggerOptions) => Logger
  /**
   * 配置默认 Logger。
   *
   * @example
   * ```ts
   * core.configureLogger({ level: 'warn' })
   * ```
   */
  configureLogger: (config: Partial<LoggingConfig>) => void
  /**
   * 设置日志级别。
   *
   * @example
   * ```ts
   * core.setLogLevel('debug')
   * ```
   */
  setLogLevel: (level: import('./core-config.js').LogLevel) => void
  /**
   * 获取当前日志级别。
   *
   * @example
   * ```ts
   * const level = core.getLogLevel()
   * ```
   */
  getLogLevel: () => import('./core-config.js').LogLevel
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
  i18n: {
    DEFAULT_LOCALES: import('@h-ai/ui').LocaleInfo[]
    DEFAULT_LOCALE: string
    interpolate: (template: string, params: import('@h-ai/ui').InterpolationParams) => string
    detectBrowserLocale: (supportedLocales?: import('@h-ai/ui').LocaleInfo[]) => import('@h-ai/ui').Locale | undefined
    isLocaleSupported: (locale: import('@h-ai/ui').Locale, supportedLocales?: import('@h-ai/ui').LocaleInfo[]) => boolean
    resolveLocale: (locale: import('@h-ai/ui').Locale | undefined, supportedLocales?: import('@h-ai/ui').LocaleInfo[], fallback?: import('@h-ai/ui').Locale) => import('@h-ai/ui').Locale
    setGlobalLocale: (locale: import('@h-ai/ui').Locale) => void
    getGlobalLocale: () => import('@h-ai/ui').Locale
    createMessageGetter: <K extends string>(messages: import('./core-types.js').LocaleMessages<K>) => (key: K, options?: import('./core-types.js').MessageOptions) => string
    coreM: (key: '$schema' | 'core_errorUnknown' | 'core_errorNetwork' | 'core_errorTimeout' | 'core_errorNotFound' | 'core_errorUnauthorized' | 'core_errorForbidden' | 'core_errorValidation' | 'core_errorInternal' | 'core_actionConfirm' | 'core_actionCancel' | 'core_actionSave' | 'core_actionDelete' | 'core_actionEdit' | 'core_actionCreate' | 'core_actionUpdate' | 'core_actionSearch' | 'core_actionReset' | 'core_actionSubmit' | 'core_actionLoading' | 'core_actionRetry' | 'core_statusSuccess' | 'core_statusFailed' | 'core_statusPending' | 'core_statusProcessing' | 'core_statusCompleted' | 'core_statusCancelled' | 'core_validationRequired' | 'core_validationMinLength' | 'core_validationMaxLength' | 'core_validationEmail' | 'core_validationUrl' | 'core_validationNumber' | 'core_validationInteger' | 'core_validationPositive' | 'core_validationPattern' | 'core_timeJustNow' | 'core_timeSecondsAgo' | 'core_timeMinutesAgo' | 'core_timeHoursAgo' | 'core_timeDaysAgo' | 'core_timeWeeksAgo' | 'core_timeMonthsAgo' | 'core_timeYearsAgo' | 'core_browserFeatureUnsupported' | 'core_configEnvVarMissing' | 'core_configFileNotExist' | 'core_configParseFailed' | 'core_configValidationFailed' | 'core_configNotLoaded', options?: import('./core-types.js').MessageOptions) => string
  }
  /**
   * ID 生成工具。
   *
   * @example
   * ```ts
   * const id = core.id.generate()
   * const uuid = core.id.uuid()
   * ```
   */
  id: {
    generate: (length?: number) => string
    short: () => string
    withPrefix: (prefix: string, length?: number) => string
    trace: () => string
    request: () => string
    uuid: () => string
    isValidUUID: (uuid: string) => boolean
    isValidNanoId: (str: string, length?: number) => boolean
  }
  /**
   * 类型检查工具。
   *
   * @example
   * ```ts
   * core.typeUtils.isDefined(value)
   * ```
   */
  typeUtils: {
    isDefined: <T>(value: T | undefined | null) => value is T
    isObject: (value: unknown) => value is Record<string, unknown>
    isFunction: (value: unknown) => value is (...args: unknown[]) => unknown
    isPromise: <T>(value: unknown) => value is Promise<T>
    isString: (value: unknown) => value is string
    isNumber: (value: unknown) => value is number
    isBoolean: (value: unknown) => value is boolean
    isArray: <T = unknown>(value: unknown) => value is T[]
  }
  /**
   * 对象操作工具。
   *
   * @example
   * ```ts
   * core.object.deepMerge(a, b)
   * ```
   */
  object: {
    deepClone: <T>(obj: T) => T
    deepMerge: <T extends Record<string, unknown>>(...objects: Partial<T>[]) => T
    pick: <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]) => Pick<T, K>
    omit: <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]) => Omit<T, K>
    keys: <T extends Record<string, unknown>>(obj: T) => (keyof T)[]
    values: <T extends Record<string, unknown>>(obj: T) => T[keyof T][]
    entries: <T extends Record<string, unknown>>(obj: T) => [keyof T, T[keyof T]][]
    fromEntries: <K extends string, V>(entries: [K, V][]) => Record<K, V>
  }
  /**
   * 字符串操作工具。
   *
   * @example
   * ```ts
   * core.string.capitalize('hello')
   * ```
   */
  string: {
    capitalize: (str: string) => string
    kebabCase: (str: string) => string
    camelCase: (str: string) => string
    truncate: (str: string, length: number, suffix?: string) => string
    snakeCase: (str: string) => string
    pascalCase: (str: string) => string
    trim: (str: string) => string
    isBlank: (str: string) => boolean
    isNotBlank: (str: string) => boolean
    padStart: (str: string, length: number, char?: string) => string
    padEnd: (str: string, length: number, char?: string) => string
  }
  /**
   * 数组操作工具。
   *
   * @example
   * ```ts
   * core.array.unique([1, 1, 2])
   * ```
   */
  array: {
    unique: <T>(arr: T[]) => T[]
    groupBy: <T, K extends string | number>(arr: T[], fn: (item: T) => K) => Record<K, T[]>
    chunk: <T>(arr: T[], size: number) => T[][]
    first: <T>(arr: T[]) => T | undefined
    last: <T>(arr: T[]) => T | undefined
    flatten: <T>(arr: T[][]) => T[]
    compact: <T>(arr: (T | null | undefined)[]) => T[]
    shuffle: <T>(arr: T[]) => T[]
    intersection: <T>(arr1: T[], arr2: T[]) => T[]
    difference: <T>(arr1: T[], arr2: T[]) => T[]
  }
  /**
   * 异步操作工具。
   *
   * @example
   * ```ts
   * await core.async.delay(100)
   * ```
   */
  async: {
    delay: (ms: number) => Promise<void>
    withTimeout: <T>(promise: Promise<T>, ms: number) => Promise<T>
    retry: <T>(fn: () => Promise<T>, options?: {
      maxRetries?: number
      delay?: number
    }) => Promise<T>
    parallel: <T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, concurrency?: number) => Promise<R[]>
    serial: <T, R>(items: T[], fn: (item: T, index: number) => Promise<R>) => Promise<R[]>
    debounce: <T extends (...args: unknown[]) => unknown>(fn: T, ms: number) => (...args: Parameters<T>) => void
    throttle: <T extends (...args: unknown[]) => unknown>(fn: T, ms: number) => (...args: Parameters<T>) => void
  }
  /**
   * 时间操作工具。
   *
   * @example
   * ```ts
   * core.time.formatDate(new Date())
   * ```
   */
  time: {
    formatDate: (date: Date, format?: string) => string
    timeAgo: (date: Date) => string
    now: () => number
    nowSeconds: () => number
    parseDate: (dateStr: string) => Date
    isValidDate: (date: Date) => boolean
    addDays: (date: Date, days: number) => Date
    addHours: (date: Date, hours: number) => Date
    startOfDay: (date: Date) => Date
    endOfDay: (date: Date) => Date
  }
  /**
   * 模块基础工具集。
   *
   * 提供各模块共用的未初始化错误处理等基础能力。
   *
   * @example
   * ```ts
   * const notInitialized = core.module.createNotInitializedKit<DbError>(
   *   DbErrorCode.NOT_INITIALIZED,
   *   () => dbM('db_notInitialized'),
   * )
   * ```
   */
  module: {
    createNotInitializedKit: typeof createNotInitializedKit
  }
}
/**
 * Core 对象类型。
 *
 * @example
 * ```ts
 * import type { Core } from '@h-ai/core'
 * const coreRef: Core = core
 * ```
 */
export type Core = ReturnType<typeof createCore>
// # sourceMappingURL=core-main.d.ts.map
