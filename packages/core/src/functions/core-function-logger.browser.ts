/**
 * @h-ai/core — Logger（浏览器版本，基于 loglevel）
 *
 * 提供统一的日志接口，浏览器环境使用 loglevel 实现。
 * @module core-function-logger.browser
 */

import type { LogContext, LogFormat, Logger, LoggerFunctions, LoggerOptions, LoggingConfig, LogLevel } from '../core-types.js'

import log from 'loglevel'
import { sanitize as sanitizeUtils } from '../utils/core-util-sanitize.js'
import { requestContext } from './core-function-context.js'
import { emitLogRecord, sanitizeLogFields } from './core-function-log-observer.js'

// ─── 全局配置 ───

/** 全局日志级别（默认 'info'） */
let globalLevel: LogLevel = 'info'

/** 浏览器默认可读输出；可配置 JSON 格式用于采集。 */
let globalFormat: LogFormat = 'pretty'

/** 附加脱敏路径，与默认凭据脱敏同时生效。 */
let globalRedact: string[] = []

/** 全局默认上下文（每条日志自动附带） */
let globalContext: Record<string, unknown> = {}

/** 默认 Logger 单例缓存 */
let defaultLogger: Logger | null = null

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

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
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
    globalContext = {
      ...globalContext,
      ...config.context,
    }
  }
  if (config.format)
    globalFormat = config.format
  if (config.redact)
    globalRedact = [...config.redact]
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

function sanitizeLogContext(ctx?: LogContext): LogContext | undefined {
  if (!ctx || Object.keys(ctx).length === 0) {
    return ctx
  }

  return sanitizeLogFields(ctx, globalRedact)
}

// ─── Logger 实现 ───

/**
 * 序列化已脱敏的日志。bigint 保留为十进制字符串，循环引用使用固定标记。
 * @param message - 已脱敏的日志文本
 * @param context - 已脱敏的上下文，pretty 格式省略空对象
 * @param format - JSON 或可读文本
 * @param level - 本条记录的级别
 * @returns 交给浏览器控制台的字符串
 */
function formatMessage(message: string, context: LogContext, format: LogFormat, level: LogLevel): string {
  if (format === 'pretty' && Object.keys(context).length === 0)
    return message

  const record = format === 'json'
    ? { ...context, level, msg: message }
    : context
  const ancestors: object[] = []
  // 只替换指回祖先的引用；同一对象出现在不同字段下时可分别输出。
  const json = JSON.stringify(record, function (this: object, _key, value: unknown) {
    if (typeof value === 'bigint')
      return value.toString()
    if (value === null || typeof value !== 'object')
      return value
    while (ancestors.length > 0 && ancestors.at(-1) !== this)
      ancestors.pop()
    if (ancestors.includes(value))
      return '[Circular]'
    ancestors.push(value)
    return value
  })
  return format === 'json'
    ? json
    : `${message} ${json}`
}

/**
 * 创建 Logger 包装。
 *
 * 将 loglevel 实例包装为统一 Logger 接口，自动合并基础上下文。
 *
 * @param resolveLogger - 通过当前阈值时返回 loglevel 实例
 * @param resolveContext - 当前基础上下文（会与每次调用时的 ctx 合并）
 * @param resolveFormat - 当前输出格式
 * @returns 统一 Logger 实例
 */
function wrapLoglevel(resolveLogger: (level: LogLevel) => log.Logger | undefined, resolveContext: () => Record<string, unknown>, resolveFormat: () => LogFormat): Logger {
  const write = (level: LogLevel, message: string, ctx?: LogContext): void => {
    const output = resolveLogger(level)
    if (!output)
      return
    const context = sanitizeLogContext({
      ...resolveContext(),
      ...ctx,
      ...requestContext.get(),
    }) ?? {}
    message = sanitizeUtils.sanitizeText(message)
    const format = resolveFormat()
    const text = formatMessage(message, context, format, level)
    if (level === 'fatal') {
      output.error(format === 'json'
        ? text
        : `[FATAL] ${text}`)
    }
    else {
      output[level](text)
    }
    if (!requestContext.get().suppressLogObservers) {
      emitLogRecord({
        timestamp: Date.now(),
        level,
        message,
        context,
      })
    }
  }
  return {
    trace(message: string, ctx?: LogContext) {
      write('trace', message, ctx)
    },
    debug(message: string, ctx?: LogContext) {
      write('debug', message, ctx)
    },
    info(message: string, ctx?: LogContext) {
      write('info', message, ctx)
    },
    warn(message: string, ctx?: LogContext) {
      write('warn', message, ctx)
    },
    error(message: string, ctx?: LogContext) {
      write('error', message, ctx)
    },
    fatal(message: string, ctx?: LogContext) {
      write('fatal', message, ctx)
    },
    child(childContext: Record<string, unknown>): Logger {
      return wrapLoglevel(resolveLogger, () => ({
        ...resolveContext(),
        ...childContext,
      }), resolveFormat)
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
  const { name, level, format } = options
  const context = { ...options.context }

  // 创建或获取 logger 实例
  const loggerInstance = name
    ? log.getLogger(name)
    : log

  const resolveLogger = (messageLevel: LogLevel): log.Logger | undefined => {
    // loglevel 共用 error 通道输出 fatal，由 Core 先执行六级阈值判断。
    const minimum = level ?? globalLevel
    if (LEVEL_PRIORITY[messageLevel] < LEVEL_PRIORITY[minimum])
      return undefined
    const effectiveLevel = LEVEL_MAP[minimum]
    if (loggerInstance.getLevel() !== log.levels[String(effectiveLevel).toUpperCase() as keyof typeof log.levels])
      loggerInstance.setLevel(effectiveLevel)
    return loggerInstance
  }
  return wrapLoglevel(resolveLogger, () => ({
    ...globalContext,
    ...context,
  }), () => format ?? globalFormat)
}

// ─── 默认 Logger 实例 ───

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

// ─── 对外出口 ───

/**
 * 浏览器 Logger 函数集合。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const logger = core.logger.create({ name: 'orders' })
 * logger.info('Order created', { orderId: 'order-1' })
 * ```
 */
export const logger: LoggerFunctions = {
  configureLogger,
  setLogLevel,
  getLogLevel,
  createLogger,
  getLogger,
}
