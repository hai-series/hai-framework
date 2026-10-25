import type { HaiError } from '@h-ai/core'
/** 按公开 IAM 错误码展示当前 UI 语言；应用自定义错误保留原文。 */
import type { UIMessageKey } from '../../../messages.js'
import { core } from '@h-ai/core'
import { uiM } from '../../../messages.js'

const messages: Partial<Record<string, UIMessageKey>> = {
  'hai:iam:001': 'auth_error_credentials',
  'hai:iam:002': 'auth_error_credentials',
  'hai:iam:003': 'auth_error_credentials',
  'hai:iam:004': 'auth_error_disabled',
  'hai:iam:005': 'auth_error_locked',
  'hai:iam:006': 'auth_error_duplicate',
  'hai:iam:007': 'auth_error_password_expired',
  'hai:iam:008': 'auth_error_password_policy',
  'hai:iam:009': 'auth_error_otp',
  'hai:iam:010': 'auth_error_service',
  'hai:iam:011': 'auth_error_otp_wait',
  'hai:iam:012': 'auth_unavailable',
  'hai:iam:013': 'auth_unavailable',
  'hai:iam:014': 'auth_unavailable',
  'hai:iam:019': 'auth_error_reset_token',
  'hai:iam:020': 'auth_error_reset_token',
  'hai:iam:021': 'auth_error_reset_token',
  'hai:iam:022': 'auth_error_otp',
  'hai:iam:023': 'auth_error_busy',
  'hai:iam:024': 'auth_unavailable',
  'hai:iam:301': 'auth_error_service',
  'hai:iam:302': 'auth_error_credentials',
  'hai:iam:303': 'auth_error_service',
  'hai:iam:401': 'auth_error_service',
  'hai:iam:901': 'auth_error_service',
  'hai:iam:999': 'auth_error_service',
}

/**
 * 将已知 IAM 错误码映射为当前语言的认证提示，未知错误保留原消息。
 * @param error - 待显示的安全错误对象或消息。
 * @returns 当前语言的已知认证错误提示；未知错误保留服务端消息。
 *
 * @example 模块内部上下文
 * ```ts
 * const message = authErrorMessage({ code: 'hai:iam:020', message: '登录失败' })
 * ```
 */
export function authErrorMessage(error: Pick<HaiError, 'code' | 'message' | 'traceId'>): string {
  const key = messages[error.code]
  return core.error.formatMessage({ message: key ? uiM(key) : error.message, traceId: error.traceId })
}
