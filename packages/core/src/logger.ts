/**
 * =============================================================================
 * @hai/core - 日志模块
 * =============================================================================
 * 基于 Pino 的结构化日志实现
 * 
 * @description
 * 提供统一的日志接口，支持：
 * - JSON 格式输出
 * - 日志级别控制
 * - 追踪 ID 注入
 * - 敏感数据脱敏
 * - 子日志器创建
 * 
 * @example
 * ```typescript
 * import { createLogger, getLogger } from '@hai/core/logger'
 * 
 * // 创建日志器
 * const logger = createLogger({
 *   name: 'my-service',
 *   level: 'info',
 * })
 * 
 * // 记录日志
 * logger.info({ userId: 123 }, 'User logged in')
 * logger.error({ err }, 'Failed to process request')
 * ```
 * =============================================================================
 */

import pino from 'pino'
import type { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions } from 'pino'

/**
 * 日志级别
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'

/**
 * 日志器配置
 */
export interface LoggerOptions {
    /** 日志器名称（模块名） */
    name?: string
    /** 日志级别 */
    level?: LogLevel
    /** 是否启用美化输出（开发环境） */
    pretty?: boolean
    /** 要脱敏的字段路径 */
    redact?: string[]
    /** 基础上下文 */
    base?: Record<string, unknown>
}

/**
 * 日志上下文
 */
export interface LogContext {
    /** 追踪 ID */
    traceId?: string
    /** 用户 ID */
    userId?: string | number
    /** 请求 ID */
    requestId?: string
    /** 其他上下文 */
    [key: string]: unknown
}

/**
 * 日志器接口
 */
export interface Logger {
    /** 追踪级别日志 */
    trace: (obj: object | string, msg?: string) => void
    /** 调试级别日志 */
    debug: (obj: object | string, msg?: string) => void
    /** 信息级别日志 */
    info: (obj: object | string, msg?: string) => void
    /** 警告级别日志 */
    warn: (obj: object | string, msg?: string) => void
    /** 错误级别日志 */
    error: (obj: object | string, msg?: string) => void
    /** 致命级别日志 */
    fatal: (obj: object | string, msg?: string) => void
    /** 创建子日志器 */
    child: (bindings: LogContext) => Logger
    /** 设置日志级别 */
    setLevel: (level: LogLevel) => void
    /** 获取当前日志级别 */
    getLevel: () => LogLevel
}

/**
 * 默认脱敏字段
 */
const DEFAULT_REDACT_PATHS = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'creditCard',
    'ssn',
    '*.password',
    '*.token',
    '*.secret',
    '*.apiKey',
    '*.api_key',
    'req.headers.authorization',
    'req.headers.cookie',
]

/**
 * 创建日志器
 * @param options - 日志器配置
 * @returns Logger 实例
 */
export function createLogger(options: LoggerOptions = {}): Logger {
    const {
        name,
        level = 'info',
        pretty = process.env.NODE_ENV === 'development',
        redact = [],
        base = {},
    } = options

    // 构建 Pino 配置
    const pinoOptions: PinoLoggerOptions = {
        level,
        base: {
            ...base,
            ...(name && { module: name }),
        },
        redact: {
            paths: [...DEFAULT_REDACT_PATHS, ...redact],
            censor: '[REDACTED]',
        },
        formatters: {
            level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    }

    // 美化输出（开发环境）
    let transport: PinoLoggerOptions['transport']
    if (pretty) {
        transport = {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
    }

    // 创建 Pino 实例
    const pinoLogger: PinoLogger = transport
        ? pino({ ...pinoOptions, transport })
        : pino(pinoOptions)

    // 包装为统一接口
    return wrapPinoLogger(pinoLogger)
}

/**
 * 包装 Pino 日志器为统一接口
 */
function wrapPinoLogger(pinoLogger: PinoLogger): Logger {
    const log = (method: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal') => {
        return (obj: object | string, msg?: string) => {
            if (typeof obj === 'string') {
                pinoLogger[method](obj)
            }
            else {
                pinoLogger[method](obj, msg)
            }
        }
    }

    return {
        trace: log('trace'),
        debug: log('debug'),
        info: log('info'),
        warn: log('warn'),
        error: log('error'),
        fatal: log('fatal'),

        child: (bindings: LogContext) => {
            return wrapPinoLogger(pinoLogger.child(bindings))
        },

        setLevel: (level: LogLevel) => {
            pinoLogger.level = level
        },

        getLevel: () => {
            return pinoLogger.level as LogLevel
        },
    }
}

// =============================================================================
// 全局日志器
// =============================================================================

/** 全局日志器实例 */
let globalLogger: Logger | null = null

/**
 * 获取全局日志器
 */
export function getLogger(): Logger {
    if (!globalLogger) {
        globalLogger = createLogger({ name: 'app' })
    }
    return globalLogger
}

/**
 * 设置全局日志器
 */
export function setLogger(logger: Logger): void {
    globalLogger = logger
}

/**
 * 创建模块日志器
 * @param moduleName - 模块名称
 */
export function createModuleLogger(moduleName: string): Logger {
    return getLogger().child({ module: moduleName })
}

// =============================================================================
// 日志工具函数
// =============================================================================

/**
 * 安全序列化错误
 */
export function serializeError(error: unknown): object {
    if (error instanceof Error) {
        const result: Record<string, unknown> = {
            name: error.name,
            message: error.message,
            stack: error.stack,
        }
        if (error.cause) {
            result.cause = serializeError(error.cause)
        }
        return result
    }
    return { message: String(error) }
}

/**
 * 创建请求日志器
 * @param logger - 基础日志器
 * @param requestId - 请求 ID
 * @param traceId - 追踪 ID
 */
export function createRequestLogger(
    logger: Logger,
    requestId: string,
    traceId?: string,
): Logger {
    return logger.child({
        requestId,
        ...(traceId && { traceId }),
    })
}
