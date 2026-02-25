/**
 * =============================================================================
 * @h-ai/core - Logger（浏览器版本，基于 loglevel）
 * =============================================================================
 * 提供统一的日志接口，浏览器环境使用 loglevel 实现。
 *
 * @example
 * ```ts
 * import { logger } from './core-function-logger.browser.js'
 *
 * const appLogger = logger.createLogger({ name: 'my-app' })
 * appLogger.info('Hello', { userId: 123 })
 * ```
 * =============================================================================
 */

import type { LoggingConfig, LogLevel } from '../core-config.js'
import type { LogContext, Logger, LoggerFunctions, LoggerOptions } from '../core-types.js'
import log from 'loglevel'

// =============================================================================
// 全局配置
// =============================================================================

/** 全局日志级别（默认 'info'） */
let globalLevel: LogLevel = 'info'

/** 全局默认上下文（每条日志自动附带） */
let globalContext: Record<string, unknown> = {}

/**
 * LogLevel 到 loglevel 库级别的映射。
 *
 * loglevel 不支持 fatal，映射为 error。
 */
const LEVEL_MAP: Record<LogLevel, log.LogLevelDesc> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error', // loglevel 没有 fatal
}

/**
 * 配置全局 Logger 选项。
 *
 * @param config - 日志配置
 *
 * @example
 * ```ts
 * logger.configureLogger({ level: 'debug' })
 * ```
 */
function configureLogger(config: Partial<LoggingConfig>): void {
  if (config.level) {
    globalLevel = config.level
    log.setLevel(LEVEL_MAP[config.level])
  }
  if (config.context) {
    globalContext = { ...globalContext, ...config.context }
  }
}

/**
 * 设置全局日志级别。
 *
 * @param level - 日志级别
 *
 * @example
 * ```ts
 * logger.setLogLevel('warn')
 * ```
 */
function setLogLevel(level: LogLevel): void {
  globalLevel = level
  log.setLevel(LEVEL_MAP[level])
}

/**
 * 获取当前全局日志级别。
 *
 * @example
 * ```ts
 * const level = logger.getLogLevel()
 * ```
 */
function getLogLevel(): LogLevel {
  return globalLevel
}

// =============================================================================
// Logger 实现
// =============================================================================

/**
 * 格式化日志消息。
 *
 * 将消息文本与上下文拼接为单行输出（上下文序列化为 JSON）。
 *
 * @param message - 日志文本
 * @param context - 日志上下文（空对象时不输出）
 * @returns 格式化后的字符串
 */
function formatMessage(message: string, context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) {
    return message
  }
  return `${message} ${JSON.stringify(context)}`
}

/**
 * 创建 Logger 包装。
 *
 * 将 loglevel 实例包装为统一 Logger 接口，自动合并基础上下文。
 *
 * @param loggerInstance - loglevel 实例
 * @param baseContext - 基础上下文（会与每次调用时的 ctx 合并）
 * @returns 统一 Logger 实例
 */
function wrapLoglevel(loggerInstance: log.Logger, baseContext: Record<string, unknown>): Logger {
  return {
    trace(message: string, ctx?: LogContext) {
      loggerInstance.trace(formatMessage(message, { ...baseContext, ...ctx }))
    },
    debug(message: string, ctx?: LogContext) {
      loggerInstance.debug(formatMessage(message, { ...baseContext, ...ctx }))
    },
    info(message: string, ctx?: LogContext) {
      loggerInstance.info(formatMessage(message, { ...baseContext, ...ctx }))
    },
    warn(message: string, ctx?: LogContext) {
      loggerInstance.warn(formatMessage(message, { ...baseContext, ...ctx }))
    },
    error(message: string, ctx?: LogContext) {
      loggerInstance.error(formatMessage(message, { ...baseContext, ...ctx }))
    },
    fatal(message: string, ctx?: LogContext) {
      loggerInstance.error(`[FATAL] ${formatMessage(message, { ...baseContext, ...ctx })}`)
    },
    child(childContext: Record<string, unknown>): Logger {
      return wrapLoglevel(loggerInstance, { ...baseContext, ...childContext })
    },
  }
}

/**
 * 创建 Logger 实例。
 *
 * @param options - Logger 选项
 * @returns Logger 实例
 *
 * @example
 * ```ts
 * const appLogger = logger.createLogger({ name: 'web' })
 * appLogger.info('ready')
 * ```
 */
function createLogger(options: LoggerOptions = {}): Logger {
  const { name, level, context } = options

  // 创建或获取 logger 实例
  const loggerInstance = name ? log.getLogger(name) : log

  // 设置级别
  const effectiveLevel = level ?? globalLevel
  loggerInstance.setLevel(LEVEL_MAP[effectiveLevel])

  return wrapLoglevel(loggerInstance, { ...globalContext, ...context })
}

// =============================================================================
// 默认 Logger 实例
// =============================================================================

let defaultLogger: Logger | null = null

/**
 * 获取默认 Logger 实例（单例）。
 *
 * @example
 * ```ts
 * const defaultLogger = logger.getLogger()
 * ```
 */
function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger()
  }
  return defaultLogger
}

// =============================================================================
// 对外出口
// =============================================================================

/**
 * 浏览器 Logger 函数集合。
 *
 * @example
 * ```ts
 * logger.createLogger({ name: 'ui' }).info('boot')
 * ```
 */
export const logger: LoggerFunctions = {
  configureLogger,
  setLogLevel,
  getLogLevel,
  createLogger,
  getLogger,
}
