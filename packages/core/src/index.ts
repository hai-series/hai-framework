/**
 * =============================================================================
 * @hai/core - 主入口
 * =============================================================================
 * hai Admin Framework 核心模块
 * 
 * @packageDocumentation
 * @module @hai/core
 * =============================================================================
 */

// Result 类型
export {
    type Result,
    Ok,
    Err,
    ok,
    err,
    isOk,
    isErr,
    fromPromise,
    fromThrowable,
    all,
    any,
    type MatchHandlers,
} from './result.js'

// 错误处理
export {
    AppError,
    ErrorCode,
    type ErrorDetails,
    type SerializedError,
    validationError,
    notFoundError,
    unauthenticatedError,
    unauthorizedError,
    internalError,
} from './error.js'

// 依赖注入
export {
    Container,
    type Lifetime,
    type ServiceToken,
    type ServiceMap,
    getContainer,
    setContainer,
    resetContainer,
    createToken,
    CONFIG_TOKEN,
    LOGGER_TOKEN,
    DATABASE_TOKEN,
    CACHE_TOKEN,
    AUTH_TOKEN,
    AI_TOKEN,
    STORAGE_TOKEN,
} from './di.js'

// 日志
export {
    type Logger,
    type LogLevel,
    type LoggerOptions,
    type LogContext,
    createLogger,
    getLogger,
    setLogger,
    createModuleLogger,
    createRequestLogger,
    serializeError,
} from './logger.js'

// 工具函数
export {
    // ID 生成
    generateId,
    generateShortId,
    generateTraceId,
    generateRequestId,
    // 类型工具
    isDefined,
    isObject,
    isFunction,
    isPromise,
    // 对象工具
    deepClone,
    deepMerge,
    pick,
    omit,
    // 字符串工具
    capitalize,
    kebabCase,
    camelCase,
    truncate,
    // 数组工具
    unique,
    groupBy,
    chunk,
    // 异步工具
    delay,
    withTimeout,
    retry,
    // 时间工具
    formatDate,
    timeAgo,
} from './utils.js'
