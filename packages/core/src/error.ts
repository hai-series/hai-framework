/**
 * =============================================================================
 * @hai/core - 错误处理模块
 * =============================================================================
 * 定义框架统一的错误类型和错误码
 * 
 * @description
 * AppError 是框架的统一错误类型，所有业务错误都应该使用 AppError。
 * ErrorCode 枚举定义了框架支持的所有错误码。
 * 
 * @example
 * ```typescript
 * import { AppError, ErrorCode } from '@hai/core/error'
 * 
 * // 创建错误
 * const error = new AppError(ErrorCode.NOT_FOUND, '用户不存在', { userId: 123 })
 * 
 * // 转换为 JSON
 * console.log(error.toJSON())
 * ```
 * =============================================================================
 */

/**
 * 错误码枚举
 * @description 使用 HTTP 状态码风格的错误码
 */
export enum ErrorCode {
    // ==========================================================================
    // 通用错误 (1xxx)
    // ==========================================================================
    /** 未知错误 */
    UNKNOWN = 1000,
    /** 内部错误 */
    INTERNAL = 1001,
    /** 配置错误 */
    CONFIGURATION = 1002,
    /** 初始化错误 */
    INITIALIZATION = 1003,
    /** 操作超时 */
    TIMEOUT = 1004,
    /** 资源不可用 */
    UNAVAILABLE = 1005,

    // ==========================================================================
    // 验证错误 (2xxx)
    // ==========================================================================
    /** 验证失败 */
    VALIDATION = 2000,
    /** 参数无效 */
    INVALID_ARGUMENT = 2001,
    /** 缺少必需参数 */
    MISSING_REQUIRED = 2002,
    /** 格式错误 */
    INVALID_FORMAT = 2003,
    /** 值超出范围 */
    OUT_OF_RANGE = 2004,

    // ==========================================================================
    // 认证错误 (3xxx)
    // ==========================================================================
    /** 未认证 */
    UNAUTHENTICATED = 3000,
    /** 认证失败 */
    AUTHENTICATION_FAILED = 3001,
    /** 令牌无效 */
    INVALID_TOKEN = 3002,
    /** 令牌过期 */
    TOKEN_EXPIRED = 3003,
    /** 会话无效 */
    INVALID_SESSION = 3004,
    /** 密码错误 */
    WRONG_PASSWORD = 3005,

    // ==========================================================================
    // 授权错误 (4xxx)
    // ==========================================================================
    /** 未授权 */
    UNAUTHORIZED = 4000,
    /** 权限不足 */
    PERMISSION_DENIED = 4001,
    /** 角色不匹配 */
    ROLE_MISMATCH = 4002,
    /** 资源访问被拒绝 */
    ACCESS_DENIED = 4003,

    // ==========================================================================
    // 资源错误 (5xxx)
    // ==========================================================================
    /** 资源未找到 */
    NOT_FOUND = 5000,
    /** 资源已存在 */
    ALREADY_EXISTS = 5001,
    /** 资源冲突 */
    CONFLICT = 5002,
    /** 资源被锁定 */
    LOCKED = 5003,
    /** 资源已删除 */
    DELETED = 5004,

    // ==========================================================================
    // 数据库错误 (6xxx)
    // ==========================================================================
    /** 数据库错误 */
    DATABASE = 6000,
    /** 连接失败 */
    DATABASE_CONNECTION = 6001,
    /** 查询失败 */
    DATABASE_QUERY = 6002,
    /** 事务失败 */
    DATABASE_TRANSACTION = 6003,
    /** 约束冲突 */
    DATABASE_CONSTRAINT = 6004,

    // ==========================================================================
    // 外部服务错误 (7xxx)
    // ==========================================================================
    /** 外部服务错误 */
    EXTERNAL_SERVICE = 7000,
    /** 网络错误 */
    NETWORK = 7001,
    /** API 调用失败 */
    API_CALL_FAILED = 7002,
    /** 第三方服务不可用 */
    SERVICE_UNAVAILABLE = 7003,
    /** 速率限制 */
    RATE_LIMITED = 7004,

    // ==========================================================================
    // 加密错误 (8xxx)
    // ==========================================================================
    /** 加密错误 */
    CRYPTO = 8000,
    /** 加密失败 */
    ENCRYPTION_FAILED = 8001,
    /** 解密失败 */
    DECRYPTION_FAILED = 8002,
    /** 签名验证失败 */
    SIGNATURE_INVALID = 8003,
    /** 密钥无效 */
    INVALID_KEY = 8004,

    // ==========================================================================
    // AI 相关错误 (9xxx)
    // ==========================================================================
    /** AI 服务错误 */
    AI_SERVICE = 9000,
    /** 模型不可用 */
    MODEL_UNAVAILABLE = 9001,
    /** 上下文超限 */
    CONTEXT_OVERFLOW = 9002,
    /** 内容过滤 */
    CONTENT_FILTERED = 9003,
    /** 工具调用失败 */
    TOOL_CALL_FAILED = 9004,
}

/**
 * 错误码到 HTTP 状态码的映射
 */
const ERROR_CODE_TO_HTTP_STATUS: Record<number, number> = {
    // 通用错误 -> 500
    [ErrorCode.UNKNOWN]: 500,
    [ErrorCode.INTERNAL]: 500,
    [ErrorCode.CONFIGURATION]: 500,
    [ErrorCode.INITIALIZATION]: 500,
    [ErrorCode.TIMEOUT]: 504,
    [ErrorCode.UNAVAILABLE]: 503,

    // 验证错误 -> 400
    [ErrorCode.VALIDATION]: 400,
    [ErrorCode.INVALID_ARGUMENT]: 400,
    [ErrorCode.MISSING_REQUIRED]: 400,
    [ErrorCode.INVALID_FORMAT]: 400,
    [ErrorCode.OUT_OF_RANGE]: 400,

    // 认证错误 -> 401
    [ErrorCode.UNAUTHENTICATED]: 401,
    [ErrorCode.AUTHENTICATION_FAILED]: 401,
    [ErrorCode.INVALID_TOKEN]: 401,
    [ErrorCode.TOKEN_EXPIRED]: 401,
    [ErrorCode.INVALID_SESSION]: 401,
    [ErrorCode.WRONG_PASSWORD]: 401,

    // 授权错误 -> 403
    [ErrorCode.UNAUTHORIZED]: 403,
    [ErrorCode.PERMISSION_DENIED]: 403,
    [ErrorCode.ROLE_MISMATCH]: 403,
    [ErrorCode.ACCESS_DENIED]: 403,

    // 资源错误 -> 404/409
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.ALREADY_EXISTS]: 409,
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.LOCKED]: 423,
    [ErrorCode.DELETED]: 410,

    // 数据库错误 -> 500
    [ErrorCode.DATABASE]: 500,
    [ErrorCode.DATABASE_CONNECTION]: 503,
    [ErrorCode.DATABASE_QUERY]: 500,
    [ErrorCode.DATABASE_TRANSACTION]: 500,
    [ErrorCode.DATABASE_CONSTRAINT]: 409,

    // 外部服务错误 -> 502/503
    [ErrorCode.EXTERNAL_SERVICE]: 502,
    [ErrorCode.NETWORK]: 502,
    [ErrorCode.API_CALL_FAILED]: 502,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503,
    [ErrorCode.RATE_LIMITED]: 429,

    // 加密错误 -> 400/500
    [ErrorCode.CRYPTO]: 500,
    [ErrorCode.ENCRYPTION_FAILED]: 500,
    [ErrorCode.DECRYPTION_FAILED]: 400,
    [ErrorCode.SIGNATURE_INVALID]: 400,
    [ErrorCode.INVALID_KEY]: 400,

    // AI 错误 -> 500/503
    [ErrorCode.AI_SERVICE]: 500,
    [ErrorCode.MODEL_UNAVAILABLE]: 503,
    [ErrorCode.CONTEXT_OVERFLOW]: 413,
    [ErrorCode.CONTENT_FILTERED]: 422,
    [ErrorCode.TOOL_CALL_FAILED]: 500,
}

/**
 * 错误详情类型
 */
export interface ErrorDetails {
    /** 字段名 */
    field?: string
    /** 期望值 */
    expected?: unknown
    /** 实际值 */
    actual?: unknown
    /** 其他详情 */
    [key: string]: unknown
}

/**
 * 序列化的错误格式
 */
export interface SerializedError {
    /** 错误码 */
    code: ErrorCode
    /** 错误消息 */
    message: string
    /** 详情 */
    details?: ErrorDetails
    /** 错误链（原始错误） */
    cause?: SerializedError | string
    /** 追踪 ID */
    traceId?: string
    /** 时间戳 */
    timestamp: string
}

/**
 * 应用错误类
 * @description 框架统一的错误类型
 */
export class AppError extends Error {
    /** 错误码 */
    readonly code: ErrorCode

    /** 错误详情 */
    readonly details?: ErrorDetails

    /** 追踪 ID */
    readonly traceId?: string

    /** 时间戳 */
    readonly timestamp: Date

    /** HTTP 状态码 */
    readonly httpStatus: number

    constructor(
        code: ErrorCode,
        message: string,
        details?: ErrorDetails,
        cause?: Error,
        traceId?: string,
    ) {
        super(message, { cause })

        this.name = 'AppError'
        this.code = code
        this.details = details
        this.traceId = traceId
        this.timestamp = new Date()
        this.httpStatus = ERROR_CODE_TO_HTTP_STATUS[code] ?? 500

        // 保留堆栈跟踪
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError)
        }
    }

    /**
     * 序列化为 JSON
     */
    toJSON(): SerializedError {
        const serialized: SerializedError = {
            code: this.code,
            message: this.message,
            timestamp: this.timestamp.toISOString(),
        }

        if (this.details) {
            serialized.details = this.details
        }

        if (this.traceId) {
            serialized.traceId = this.traceId
        }

        if (this.cause) {
            if (this.cause instanceof AppError) {
                serialized.cause = this.cause.toJSON()
            }
            else if (this.cause instanceof Error) {
                serialized.cause = this.cause.message
            }
        }

        return serialized
    }

    /**
     * 从 JSON 反序列化
     */
    static fromJSON(json: SerializedError): AppError {
        return new AppError(
            json.code,
            json.message,
            json.details,
            undefined,
            json.traceId,
        )
    }

    /**
     * 包装其他错误为 AppError
     */
    static wrap(
        error: unknown,
        code: ErrorCode = ErrorCode.UNKNOWN,
        message?: string,
        details?: ErrorDetails,
        traceId?: string,
    ): AppError {
        // 已经是 AppError
        if (error instanceof AppError) {
            if (traceId && !error.traceId) {
                return new AppError(
                    error.code,
                    error.message,
                    error.details,
                    error.cause as Error | undefined,
                    traceId,
                )
            }
            return error
        }

        // 标准 Error
        if (error instanceof Error) {
            return new AppError(
                code,
                message ?? error.message,
                details,
                error,
                traceId,
            )
        }

        // 未知类型
        return new AppError(
            code,
            message ?? String(error),
            details,
            undefined,
            traceId,
        )
    }
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建验证错误
 */
export function validationError(
    message: string,
    field?: string,
    details?: ErrorDetails,
): AppError {
    return new AppError(
        ErrorCode.VALIDATION,
        message,
        { field, ...details },
    )
}

/**
 * 创建未找到错误
 */
export function notFoundError(
    resource: string,
    id?: string | number,
): AppError {
    const message = id
        ? `${resource} with id '${id}' not found`
        : `${resource} not found`
    return new AppError(ErrorCode.NOT_FOUND, message, { resource, id })
}

/**
 * 创建未认证错误
 */
export function unauthenticatedError(message = 'Authentication required'): AppError {
    return new AppError(ErrorCode.UNAUTHENTICATED, message)
}

/**
 * 创建未授权错误
 */
export function unauthorizedError(message = 'Permission denied'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message)
}

/**
 * 创建内部错误
 */
export function internalError(
    message: string,
    cause?: Error,
    traceId?: string,
): AppError {
    return new AppError(ErrorCode.INTERNAL, message, undefined, cause, traceId)
}
