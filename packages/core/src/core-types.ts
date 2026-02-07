/**
 * =============================================================================
 * @hai/core - 类型定义
 * =============================================================================
 * 核心模块的公共类型（完全自包含，无外部依赖，前后端通用）
 *
 * 组织结构：
 * 1. 基础类型 - Result / Option
 * 2. 日志类型 - Logger / LogLevel
 * 3. Provider 接口 - Logger / IdGenerator
 * 4. Core 服务类型 - CoreService / CoreUtils
 * =============================================================================
 */

// =============================================================================
// 4. Core 初始化类型
// =============================================================================

import type { LogFormat, LoggingConfig, LogLevel } from './config/index.js'

// =============================================================================
// 1. 基础类型 - Result / Option
// =============================================================================

/**
 * Result 类型 - 函数返回值的标准封装
 * 用于显式处理成功/失败两种情况，避免异常驱动的控制流
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number, string> {
 *     if (b === 0) return err('Division by zero')
 *     return ok(a / b)
 * }
 * ```
 */
export type Result<T, E = Error>
  = | { success: true, data: T }
    | { success: false, error: E }

/**
 * 创建成功结果。
 *
 * @example
 * ```ts
 * const result = ok({ id: 1 })
 * if (result.success) {
 *   // 使用 result.data.id
 * }
 * ```
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data }
}

/**
 * 创建失败结果。
 *
 * @example
 * ```ts
 * const result = err('bad request')
 * if (!result.success) {
 *   // 处理错误：result.error
 * }
 * ```
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error }
}

/**
 * Result Match 处理器。
 *
 * @example
 * ```ts
 * const handlers: MatchHandlers<number, string, number, number> = {
 *   ok: n => n + 1,
 *   err: () => 0,
 * }
 * ```
 */
export interface MatchHandlers<T, E, R1, R2> {
  ok: (data: T) => R1
  err: (error: E) => R2
}

// =============================================================================
// 2 分页类型
// =============================================================================

/**
 * 分页参数输入
 */
export interface PaginationOptionsInput {
  /** 页码（从 1 开始） */
  page?: number
  /** 每页数量 */
  pageSize?: number
}

/**
 * 分页参数
 */
export interface PaginationOptions {
  /** 页码（从 1 开始） */
  page: number
  /** 每页数量 */
  pageSize: number
}

/**
 * 分页结果
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

// =============================================================================
// 3. 日志类型
// =============================================================================

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
 * Logger 函数组合（平台实现依赖）。
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
  createLogger: (options?: LoggerOptions) => Logger
  getLogger: (name?: string) => Logger
  configureLogger: (config: Partial<LoggingConfig>) => void
  setLogLevel: (level: LogLevel) => void
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
   * - `_core.yml` → 使用 CoreConfigSchema
   * - `_db.yml` → 使用 DbConfigSchema
   * - `_cache.yml` → 使用 CacheConfigSchema
   * - `_iam.yml` → 使用 IamConfigSchema
   * - `app.yml` → key 为 'app'（需提供 schemas）
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
