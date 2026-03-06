/**
 * @h-ai/api-client — 错误码 + 配置常量
 *
 * 定义 API Client 模块的错误码常量与配置默认值。
 * @module api-client-config
 */

// ─── 错误码 ───

/**
 * Api Client 错误码（数值范围 6000-6099）
 */
export const ApiClientErrorCode = {
  /** 网络请求失败 */
  NETWORK_ERROR: 6000,
  /** 请求超时 */
  TIMEOUT: 6001,
  /** 服务器错误（5xx） */
  SERVER_ERROR: 6002,
  /** 未授权（401） */
  UNAUTHORIZED: 6003,
  /** 无权限（403） */
  FORBIDDEN: 6004,
  /** 资源不存在（404） */
  NOT_FOUND: 6005,
  /** 请求参数校验失败（400） */
  VALIDATION_FAILED: 6006,
  /** Token 刷新失败 */
  TOKEN_REFRESH_FAILED: 6007,
  /** 未知错误 */
  UNKNOWN: 6099,
} as const

/** 错误码类型 */
export type ApiClientErrorCodeType = (typeof ApiClientErrorCode)[keyof typeof ApiClientErrorCode]

/**
 * Api Client 错误
 */
export interface ApiClientError {
  /** 错误码 */
  code: ApiClientErrorCodeType
  /** 错误消息 */
  message: string
  /** HTTP 状态码（如有） */
  status?: number
  /** 原始异常 */
  cause?: unknown
  /** 服务端返回的业务错误详情 */
  details?: unknown
}
