/**
 * =============================================================================
 * @hai/core - 类型定义
 * =============================================================================
 * 核心模块的公共类型（完全自包含，无外部依赖，前后端通用）
 *
 * 组织结构：
 * 1. 基础类型 - Result / Option
 * 2. 错误类型 - ErrorCode / ErrorDetails
 * 3. 日志类型 - Logger / LogLevel
 * 4. Provider 接口 - Logger / IdGenerator
 * 5. Core 服务类型 - CoreService / CoreUtils
 * =============================================================================
 */

import type { ZodType } from 'zod'

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

/** 创建成功结果 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data }
}

/** 创建失败结果 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error }
}

/** Result Match 处理器 */
export interface MatchHandlers<T, E, R1, R2> {
  ok: (data: T) => R1
  err: (error: E) => R2
}

// =============================================================================
// 3. 日志类型
// =============================================================================

/** 日志上下文 */
export interface LogContext {
  timestamp?: Date
  level?: LogLevel
  message?: string
  [key: string]: unknown
}

/** 日志选项 */
export interface LoggerOptions {
  name?: string
  level?: LogLevel
  format?: LogFormat
  context?: Record<string, unknown>
}

/**
 * Logger 接口
 * 统一的日志记录接口，具体实现由 Provider 提供
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

/** 配置加载项 */
export interface ConfigLoadItem<T = unknown> {
  /** 配置名称 */
  name: string
  /** 配置文件路径 */
  filePath: string
  /** Zod Schema */
  schema: ZodType<T>
  /** 监听回调（可选） */
  watch?: ConfigWatchCallback<T>
}

/** 配置监听回调 */
export type ConfigWatchCallback<T = unknown> = (config: T | null, error?: unknown) => void

/**
 * 内置模块名称与配置文件前缀的映射
 *
 * 约定：
 * - 内置模块配置文件以 `_` 开头，如 `_db.yml`
 * - 业务配置文件不带前缀，如 `app.yml`
 */
export type BuiltinConfigModule = 'core' | 'db' | 'cache' | 'iam' | 'storage' | 'ai' | 'crypto'

/** Core 配置选项 */
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
  /**
   * 业务配置的 Schema 映射
   *
   * 用于验证非内置模块的配置文件。
   * key 为文件名（不含扩展名），value 为 Zod Schema。
   *
   * @example
   * ```ts
   * core.init({
   *   configDir: './config',
   *   schemas: { myApp: MyAppConfigSchema }
   * })
   * ```
   */
  schemas?: Record<string, ZodType>
  /** 配置文件加载列表（显式模式，与 configDir 互斥） */
  configs?: ConfigLoadItem[]
  /** 是否启用配置文件监听（默认 false） */
  watchConfig?: boolean
  /** 是否打印启动日志（默认 false） */
  silent?: boolean
}

/** Logger 函数类型（内部使用） */
export interface LoggerFunctions {
  createLogger: (options?: LoggerOptions) => Logger
  getLogger: (name?: string) => Logger
  configureLogger: (config: Partial<LoggingConfig>) => void
  setLogLevel: (level: LogLevel) => void
  getLogLevel: () => LogLevel
}
