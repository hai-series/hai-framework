/**
 * =============================================================================
 * @h-ai/core - Core 服务聚合（Node.js）
 * =============================================================================
 * 提供 Node.js 环境的 core 对象，聚合常用功能。
 * 所有功能统一通过 core 对象访问，并提供配置加载能力。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * // 约定优于配置模式（推荐）
 * core.init({ configDir: './config' })
 *
 * // 配置文件命名约定：
 * // - _core.yml   → 自动使用 CoreConfigSchema 校验
 * // - _db.yml     → 加载为 'db'（模块自行调用 config.validate 校验）
 * // - _cache.yml  → 加载为 'cache'（模块自行调用 config.validate 校验）
 * // - app.yml     → 加载为 'app'（模块自行调用 config.validate 校验）
 *
 * // 日志
 * core.logger.info('Hello')
 *
 * // ID 生成
 * const myId = core.id.generate()
 *
 * // 配置管理
 * const dbConfig = core.config.get('db')
 * ```
 * =============================================================================
 */
import type { CoreOptions } from './core-types.js'
/**
 * Core 服务对象 - 聚合常用功能（Node.js）。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * core.init({ configDir: './config' })
 * ```
 */
export declare const core: {
  /** 配置管理 */
  config: {
    load: <T>(name: string, filePath: string, schema?: import('zod').ZodType<T>) => import('./core-types.js').Result<T, import('./functions/core-function-config.js').ConfigError>
    validate: <T>(name: string, schema: import('zod').ZodType<T>) => import('./core-types.js').Result<T, import('./functions/core-function-config.js').ConfigError>
    get: <T>(name: string) => T | undefined
    getOrThrow: <T>(name: string) => T
    reload: (name: string) => import('./core-types.js').Result<unknown, import('./functions/core-function-config.js').ConfigError>
    has: (name: string) => boolean
    clear: (name?: string) => void
    keys: () => string[]
    watch: <T = unknown>(name: string, callback: import('./functions/core-function-config.js').WatchCallback<T>) => () => void
    unwatch: (name?: string) => void
    isWatching: (name: string) => boolean
  }
  /** 初始化 Core */
  init: typeof initCore
  logger: import('./core-types.js').Logger
  createLogger: (options?: import('./core-types.js').LoggerOptions) => import('./core-types.js').Logger
  configureLogger: (config: Partial<import('./core-config.js').LoggingConfig>) => void
  setLogLevel: (level: import('./core-config.js').LogLevel) => void
  getLogLevel: () => import('./core-config.js').LogLevel
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
  module: {
    createNotInitializedKit: typeof import('./utils/core-util-module.js').createNotInitializedKit
  }
}
/**
 * 初始化 Core（内部实现，通过 `core.init()` 调用）。
 *
 * 执行流程：
 * 1. 配置日志（若提供 `options.logging`）
 * 2. 扫描并加载配置目录中的所有 YAML 文件
 * 3. 启用配置文件监听（若 `options.watchConfig` 为 true）
 *
 * @param options - 初始化选项
 *
 * @example
 * ```ts
 * core.init({ configDir: './config', watchConfig: true })
 * ```
 */
declare function initCore(options?: CoreOptions): void
export {}
// # sourceMappingURL=core-main.node.d.ts.map
