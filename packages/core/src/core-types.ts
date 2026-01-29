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

import type { ZodSchema } from 'zod'

// =============================================================================
// 4. Core 初始化类型
// =============================================================================

import type { LogFormat, LoggingConfig, LogLevel } from './core-config.js'

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
// 2. 错误类型
// =============================================================================

/**
 * 统一错误码类型
 */
export type ErrorCodeType = number

/** 错误详情 */
export interface ErrorDetails {
  code: ErrorCodeType
  message: string
  details?: Record<string, unknown>
  cause?: Error
}

/** 序列化错误（用于 API 响应） */
export interface SerializedError {
  code: ErrorCodeType
  message: string
  details?: Record<string, unknown>
  stack?: string
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
  schema: ZodSchema<T>
  /** 变更回调（可选） */
  onChange?: (config: T) => void
}

/** Core 配置选项 */
export interface CoreOptions {
  /** 日志配置 */
  logging?: Partial<LoggingConfig>
  /** 配置文件加载列表（Node.js 专用） */
  configs?: ConfigLoadItem[]
  /** 是否启用配置文件监听（Node.js 专用，默认 false） */
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
