/**
 * =============================================================================
 * @hai/iam - 核心类型定义
 * =============================================================================
 *
 * 提供 IAM 内部通用类型。
 *
 * @module iam-core-types
 * =============================================================================
 */

import type { IamErrorCodeType } from './iam-config.js'

/**
 * IAM 错误接口
 *
 * 所有 IAM 操作返回的错误都遵循此接口。
 */
export interface IamError {
  /** 错误码（数值，参见 IamErrorCode） */
  code: IamErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}
