/**
 * @h-ai/core — 类型定义
 *
 * 核心模块的公共类型（前后端通用）
 * @module core-types
 */

import type { LogFormat, LoggingConfig, LogLevel } from './core-config.js'
import { error } from './functions/core-function-error.js'

// ─── 1. 基础类型 - Result / Option ───

export type HaiResult<T>
  = | { success: true, data: T }
    | { success: false, error: HaiError }

export function ok<T>(data: T): HaiResult<T> {
  return { success: true, data }
}

export function err(
  errorOrDef: HaiErrorDef | HaiError,
  message?: string,
  cause?: unknown,
  suggestion?: string,
): HaiResult<never> {
  if (typeof errorOrDef === 'object' && 'message' in errorOrDef) {
    return {
      success: false,
      error: errorOrDef,
    }
  }
  return {
    success: false,
    error: error.buildHaiErrorInst(errorOrDef as HaiErrorDef, message || '', cause, suggestion),
  }
}

/**
 * HaiResult 模式匹配处理器。
 *
 * 提供对 HaiResult 的模式匹配能力，分别处理成功和失败两种情况。
 *
 * @template T - 成功数据类型
 * @template R1 - ok 分支返回类型
 * @template R2 - err 分支返回类型
 *
 * @example
 * ```ts
 * const handlers: MatchHandlers<number, number, number> = {
 *   ok: n => n + 1,
 *   err: () => 0,
 * }
 * ```
 */
export interface MatchHandlers<T, R1, R2> {
  /** 成功分支处理器 */
  ok: (data: T) => R1
  /** 失败分支处理器 */
  err: (error: HaiError) => R2
}

// ─── 1.5 标准错误类型 ───

/** 错误信息值格式：`错误码数字段:HTTP状态码`，例如 `001:500`。 */
export type ErrorInfoValue = `${string}:${string}`

/** 模块错误信息映射。 */
export type ErrorInfo = Record<string, ErrorInfoValue>

export interface HaiErrorDef {
  code: string
  httpStatus: number
  system: string
  module: string
}

export interface HaiError {
  code: string | number
  message: string
  httpStatus?: number
  system?: string
  module?: string
  cause?: unknown
  suggestion?: string
  ext?: Record<string, unknown>
}

// ─── 标准错误码常量 ───
const CommonErrorInfo = {
  // 001-099: 初始化和配置
  NOT_INITIALIZED: '001:500',
  INIT_FAILED: '002:500',
  INIT_IN_PROGRESS: '004:500',

  // 100-199: 认证 & 授权
  UNAUTHORIZED: '100:401',
  FORBIDDEN: '101:403',
  TOKEN_EXPIRED: '102:401',
  TOKEN_INVALID: '103:401',

  // 200-299: 校验 & 参数
  VALIDATION_ERROR: '200:400',
  INVALID_REQUEST: '201:400',
  PARAMETER_MISSING: '202:400',

  // 300-399: 资源操作
  NOT_FOUND: '300:404',
  ALREADY_EXISTS: '301:409',
  CONFLICT: '302:409',

  // 400-499: 外部依赖
  API_ERROR: '400:502',
  NETWORK_ERROR: '401:502',
  TIMEOUT: '402:504',
  SERVICE_UNAVAILABLE: '403:503',

  // 500-599: 内部错误
  INTERNAL_ERROR: '500:500',
  DATABASE_ERROR: '501:500',
  UNKNOWN_ERROR: '599:500',
} as const satisfies ErrorInfo
export const HaiCommonError = error.buildHaiErrorsDef('common', CommonErrorInfo)

const ConfigErrorInfo = {
  CONFIG_FILE_NOT_FOUND: '010:500',
  CONFIG_PARSE_ERROR: '011:500',
  CONFIG_VALIDATION_ERROR: '012:500',
  CONFIG_ENV_VAR_MISSING: '013:500',
  CONFIG_NOT_LOADED: '014:500',
} as const satisfies ErrorInfo

export const HaiConfigError = error.buildHaiErrorsDef('core', ConfigErrorInfo)

// ─── 2 分页类型 ───

/**
 * 分页参数输入（可选字段，未提供时使用默认值）。
 *
 * @example
 * ```ts
 * const input: PaginationOptionsInput = { page: 2, pageSize: 20 }
 * ```
 */
export interface PaginationOptionsInput {
  /** 页码（从 1 开始，默认 1） */
  page?: number
  /** 每页数量（默认由业务层决定） */
  pageSize?: number
}

/**
 * 分页参数（必填，已确定具体值）。
 *
 * @example
 * ```ts
 * const options: PaginationOptions = { page: 1, pageSize: 20 }
 * ```
 */
export interface PaginationOptions {
  /** 页码（从 1 开始） */
  page: number
  /** 每页数量 */
  pageSize: number
}

/**
 * 分页结果。
 *
 * @template T - 数据项类型
 *
 * @example
 * ```ts
 * const result: PaginatedResult<User> = {
 *   items: [{ id: 1, name: 'Alice' }],
 *   total: 100,
 *   page: 1,
 *   pageSize: 20,
 * }
 * ```
 */
export interface PaginatedResult<T> {
  /** 当前页数据 */
  items: T[]
  /** 总数量 */
  total: number
  /** 页码（从 1 开始） */
  page: number
  /** 每页数量 */
  pageSize: number
}

// ─── 3. 日志类型 ───

/**
 * 日志上下文。
 *
 * @example
 * ```ts
 * const context: LogContext = { requestId: 'req-1' }
 * ```
 */
export interface LogContext {
  timestamp?: Date
  level?: LogLevel
  message?: string
  [key: string]: unknown
}

/**
 * 日志选项。
 *
 * @example
 * ```ts
 * const options: LoggerOptions = { name: 'api', level: 'debug' }
 * ```
 */
export interface LoggerOptions {
  name?: string
  level?: LogLevel
  format?: LogFormat
  context?: Record<string, unknown>
}

/**
 * Logger 接口。
 * 统一的日志记录接口，具体实现由 Provider 提供。
 *
 * @example
 * ```ts
 * core.logger.info('ready', { requestId: 'req-1' })
 * ```
 */
export interface Logger {
  trace: (message: string, context?: LogContext) => void
  debug: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, context?: LogContext) => void
  fatal: (message: string, context?: LogContext) => void
  child: (context: Record<string, unknown>) => Logger
}

/**
 * Core 公共 Logger — Logger 实例 + 管理方法。
 *
 * @example
 * ```ts
 * core.logger.info('ready')
 * core.logger.configure({ level: 'debug' })
 * core.logger.setLevel('warn')
 * const level = core.logger.getLevel()
 * const db = core.logger.create({ name: 'db' })
 * ```
 */
export interface CoreLogger extends Logger {
  /** 创建新的 Logger 实例 */
  create: (options?: LoggerOptions) => Logger
  /** 配置全局 Logger 选项（级别、格式、上下文等） */
  configure: (config: Partial<LoggingConfig>) => void
  /** 设置全局日志级别 */
  setLevel: (level: LogLevel) => void
  /** 获取当前全局日志级别 */
  getLevel: () => LogLevel
}

/**
 * Logger 函数组合（平台实现依赖）。
 *
 * 由各平台（Node.js / Browser）提供具体实现，通过 `createCore()` 注入。
 *
 * @example
 * ```ts
 * const fns: LoggerFunctions = {
 *   createLogger,
 *   getLogger,
 *   configureLogger,
 *   setLogLevel,
 *   getLogLevel,
 * }
 * ```
 */
export interface LoggerFunctions {
  /** 创建新的 Logger 实例 */
  createLogger: (options?: LoggerOptions) => Logger
  /** 获取默认或命名 Logger 实例（单例） */
  getLogger: (name?: string) => Logger
  /** 配置全局 Logger 选项（级别、格式、上下文等） */
  configureLogger: (config: Partial<LoggingConfig>) => void
  /** 设置全局日志级别 */
  setLogLevel: (level: LogLevel) => void
  /** 获取当前全局日志级别 */
  getLogLevel: () => LogLevel
}

/**
 * Core 配置选项。
 *
 * @example
 * ```ts
 * const options: CoreOptions = { configDir: './config', watchConfig: true }
 * ```
 */
export interface CoreOptions {
  /** 日志配置 */
  logging?: Partial<LoggingConfig>
  /**
   * 配置目录（约定优于配置模式）
   *
   * 指定后会自动扫描目录中的 yml/yaml 文件：
   * - `_core.yml` → 自动使用 CoreConfigSchema 校验
   * - `_xx.yml` → 加载为 'xx'（各模块自行调用 `config.validate` 校验）
   * - `app.yml` → 加载为 'app'（需使用方自行校验）
   *
   * @example
   * ```ts
   * core.init({ configDir: './config' })
   * ```
   */
  configDir?: string
  /** 是否启用配置文件监听（默认 false） */
  watchConfig?: boolean
}

// ─── 5. i18n 公共类型 ───

/**
 * 语言代码（ISO 639-1 + 地区代码）。
 *
 * @example 'zh-CN', 'en-US', 'ja-JP'
 */
export type Locale = string

/**
 * 语言信息。
 *
 * @example
 * ```ts
 * const locale: LocaleInfo = { code: 'zh-CN', label: '简体中文' }
 * ```
 */
export interface LocaleInfo {
  /** 语言代码（如 'zh-CN'、'en-US'） */
  code: Locale
  /** 显示名称（如 '简体中文'、'English'） */
  label: string
  /** 是否为从右到左书写的语言（如阿拉伯语），默认 false */
  rtl?: boolean
}

/**
 * 插值参数类型。
 *
 * 用于 i18n 消息模板中的 `{key}` 占位符替换。
 *
 * @example
 * ```ts
 * const params: InterpolationParams = { name: 'Alice', count: 3 }
 * // 模板 'Hello, {name}! You have {count} items.'
 * ```
 */
export type InterpolationParams = Record<string, string | number | boolean>

/**
 * 消息字典类型（单语言的 key-value 映射）。
 *
 * @example
 * ```ts
 * const dict: MessageDictionary = { hello: '你好', bye: '再见' }
 * ```
 */
export type MessageDictionary = Record<string, string>

/**
 * 多语言消息集合。
 *
 * 以 locale 为键，每个 locale 下包含该语言的所有消息 key-value。
 *
 * @template K - 消息 key 的联合类型
 *
 * @example
 * ```ts
 * const messages: LocaleMessages<'hello' | 'bye'> = {
 *   'zh-CN': { hello: '你好', bye: '再见' },
 *   'en-US': { hello: 'Hello', bye: 'Bye' },
 * }
 * ```
 */
export type LocaleMessages<K extends string = string> = Record<Locale, Record<K, string>>

/**
 * 消息获取选项。
 *
 * @example
 * ```ts
 * getMessage('hello', { locale: 'en-US', params: { name: 'World' } })
 * ```
 */
export interface MessageOptions {
  /** 指定 locale（不传则使用全局 locale） */
  locale?: Locale
  /** 插值参数 */
  params?: InterpolationParams
}
