import type { HaiError } from '@h-ai/core'
/** 按公开 IAM 错误码展示安全提示，不直接显示认证服务的原始消息。 */
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
  'hai:iam:025': 'auth_error_password_initial',
  'hai:iam:026': 'auth_error_access',
  'hai:iam:027': 'auth_error_reauthentication',
  'hai:iam:030': 'auth_captcha_error',
  'hai:iam:031': 'auth_captcha_error',
  'hai:iam:032': 'auth_captcha_error',
  'hai:iam:033': 'auth_captcha_error',
  'hai:iam:034': 'auth_error_password_same',
  'hai:iam:101': 'auth_error_session',
  'hai:iam:102': 'auth_error_session',
  'hai:iam:103': 'auth_error_session',
  'hai:iam:104': 'auth_error_service',
  'hai:iam:105': 'auth_error_session',
  'hai:iam:106': 'auth_error_session',
  'hai:iam:107': 'auth_error_session',
  'hai:iam:108': 'auth_error_session_limit',
  'hai:iam:110': 'auth_error_reauthentication',
  'hai:iam:111': 'auth_error_reauthentication',
  'hai:iam:201': 'auth_error_access',
  'hai:iam:301': 'auth_error_service',
  'hai:iam:302': 'auth_error_credentials',
  'hai:iam:303': 'auth_error_service',
  'hai:iam:401': 'auth_error_service',
  'hai:iam:901': 'auth_error_service',
  'hai:iam:999': 'auth_error_service',
}

/**
 * 将 IAM 错误映射为当前语言的安全认证提示；未知错误和服务异常使用通用提示。
 * @param error - 待显示的安全错误对象或消息。
 * @returns 本地化提示及有效 traceId，不包含原始异常、账户字段原因或其他内部信息。
 *
 * @example
 * ```ts
 * import { authErrorMessage } from '@h-ai/ui/components/scenes/iam/index'
 * const message = authErrorMessage({ code: 'hai:iam:020', message: '登录失败' })
 * ```
 */
export function authErrorMessage(error: Pick<HaiError, 'code' | 'message' | 'traceId' | 'httpStatus'>): string {
  const key = (error.httpStatus ?? 400) >= 500 || !Object.hasOwn(messages, error.code) ? 'auth_error_service' : messages[error.code] ?? 'auth_error_service'
  return core.error.formatMessage({ message: uiM(key), traceId: error.traceId })
}
