/**
 * =============================================================================
 * @hai/core - Logger（浏览器版本，基于 loglevel）
 * =============================================================================
 * 提供统一的日志接口，浏览器环境使用 loglevel 实现
 *
 * @example
 * ```ts
 * import { createLogger, setLogLevel } from '@hai/core'
 *
 * const logger = createLogger({ name: 'my-app' })
 * logger.info('Hello', { userId: 123 })
 * ```
 * =============================================================================
 */

import type { LoggingConfig, LogLevel } from '../core-config.js'
import type { LogContext, Logger, LoggerOptions } from '../core-types.js'
import log from 'loglevel'

// =============================================================================
// 全局配置
// =============================================================================

let globalLevel: LogLevel = 'info'
let globalContext: Record<string, unknown> = {}

/** LogLevel 到 loglevel 级别映射 */
const LEVEL_MAP: Record<LogLevel, log.LogLevelDesc> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error', // loglevel 没有 fatal
}

/**
 * 配置全局 Logger 选项
 */
export function configureLogger(config: Partial<LoggingConfig>): void {
  if (config.level) {
    globalLevel = config.level
    log.setLevel(LEVEL_MAP[config.level])
  }
  if (config.context) {
    globalContext = { ...globalContext, ...config.context }
  }
}

/**
 * 设置全局日志级别
 */
export function setLogLevel(level: LogLevel): void {
  globalLevel = level
  log.setLevel(LEVEL_MAP[level])
}

/**
 * 获取当前全局日志级别
 */
export function getLogLevel(): LogLevel {
  return globalLevel
}

// =============================================================================
// Logger 实现
// =============================================================================

/** 格式化消息 */
function formatMessage(message: string, context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) {
    return message
  }
  return `${message} ${JSON.stringify(context)}`
}

/** 创建 Logger 包装 */
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
 * 创建 Logger 实例
 */
export function createLogger(options: LoggerOptions = {}): Logger {
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
 * 获取默认 Logger 实例（单例）
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger()
  }
  return defaultLogger
}

/**
 * 重置默认 Logger（用于测试或重新配置后）
 */
export function resetLogger(): void {
  defaultLogger = null
}
