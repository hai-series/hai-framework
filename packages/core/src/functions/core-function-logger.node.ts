/**
 * =============================================================================
 * @hai/core - Logger（Node.js 版本，基于 pino）
 * =============================================================================
 * 提供统一的日志接口，Node.js 环境使用 pino 实现
 *
 * @example
 * ```ts
 * import { createLogger, setLogLevel } from '@hai/core'
 *
 * const logger = createLogger({ name: 'my-service' })
 * logger.info('Hello', { userId: 123 })
 *
 * // 动态调整级别
 * setLogLevel('debug')
 * ```
 * =============================================================================
 */

import type { LogFormat, LoggingConfig, LogLevel } from '../core-config.js'
import type { LogContext, Logger, LoggerOptions } from '../core-types.js'
import { execSync } from 'node:child_process'
import process from 'node:process'
import pino from 'pino'

// Windows 控制台 UTF-8 编码修复
// 解决 Pino 日志中文乱码问题（pino/sonic-boom 在 Windows 上需要显式设置 UTF-8）
if (process.platform === 'win32' && process.stdout.isTTY) {
  try {
    // 强制切换控制台代码页为 UTF-8（避免 GBK/GB2312 导致的乱码）
    execSync('chcp 65001 > nul', { stdio: 'ignore' })

    // 设置 stdout/stderr 编码为 UTF-8
    if (process.stdout.setDefaultEncoding) {
      process.stdout.setDefaultEncoding('utf8')
    }
    if (process.stderr.setDefaultEncoding) {
      process.stderr.setDefaultEncoding('utf8')
    }

    // 通过环境变量强制 Node.js 使用 UTF-8
    process.env.LANG = 'zh_CN.UTF-8'
    process.env.LC_ALL = 'zh_CN.UTF-8'
    process.env.PYTHONIOENCODING = 'utf-8'
  }
  // eslint-disable-next-line unused-imports/no-unused-vars
  catch (_e) {
    // 忽略错误，某些环境可能不支持
  }
}

// =============================================================================
// 全局配置
// =============================================================================

let globalLevel: LogLevel = 'info'
let globalFormat: LogFormat = 'pretty'
let globalContext: Record<string, unknown> = {}
let globalRedact: string[] = []

/**
 * 配置全局 Logger 选项
 */
export function configureLogger(config: Partial<LoggingConfig>): void {
  if (config.level)
    globalLevel = config.level
  if (config.format)
    globalFormat = config.format
  if (config.context)
    globalContext = { ...globalContext, ...config.context }
  if (config.redact)
    globalRedact = config.redact
}

/**
 * 设置全局日志级别
 */
export function setLogLevel(level: LogLevel): void {
  globalLevel = level
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

/** 包装 pino 实例为统一 Logger 接口 */
function wrapPino(pinoLogger: pino.Logger, context: Record<string, unknown>): Logger {
  return {
    trace(message: string, ctx?: LogContext) {
      pinoLogger.trace({ ...context, ...ctx }, message)
    },
    debug(message: string, ctx?: LogContext) {
      pinoLogger.debug({ ...context, ...ctx }, message)
    },
    info(message: string, ctx?: LogContext) {
      pinoLogger.info({ ...context, ...ctx }, message)
    },
    warn(message: string, ctx?: LogContext) {
      pinoLogger.warn({ ...context, ...ctx }, message)
    },
    error(message: string, ctx?: LogContext) {
      pinoLogger.error({ ...context, ...ctx }, message)
    },
    fatal(message: string, ctx?: LogContext) {
      pinoLogger.fatal({ ...context, ...ctx }, message)
    },
    child(childContext: Record<string, unknown>): Logger {
      return wrapPino(pinoLogger.child(childContext), { ...context, ...childContext })
    },
  }
}

/**
 * 创建 Logger 实例
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? globalLevel
  const format = options.format ?? globalFormat
  const context = { ...globalContext, ...options.context }

  const pinoOptions: pino.LoggerOptions = {
    level,
    name: options.name,
    formatters: {
      level: label => ({ level: label }),
    },
  }

  // redact 支持
  if (globalRedact.length > 0) {
    pinoOptions.redact = {
      paths: globalRedact,
      censor: '[REDACTED]',
    }
  }

  let pinoInstance: pino.Logger

  if (format === 'pretty') {
    pinoInstance = pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    })
  }
  else {
    pinoInstance = pino(pinoOptions)
  }

  return wrapPino(pinoInstance, context)
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
