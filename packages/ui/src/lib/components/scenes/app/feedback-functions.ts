/** 反馈展示辅助；不执行网络、存储或图像修改。 */
import type { UIMessageKey } from '../../../messages.js'
import type { FeedbackReportView } from './feedback-types.js'
import { getUILocale, uiM } from '../../../messages.js'

const collectionKeys: Record<FeedbackReportView['collectionStatus'], UIMessageKey> = {
  collecting: 'feedback_collecting',
  complete: 'feedback_complete',
  partial: 'feedback_partial',
  failed: 'feedback_failed',
}
const notificationKeys: Record<FeedbackReportView['notificationStatus'], UIMessageKey> = {
  pending: 'feedback_notification_pending',
  sending: 'feedback_notification_sending',
  sent: 'feedback_notification_sent',
  deferred: 'feedback_notification_deferred',
  failed: 'feedback_notification_failed',
}

/**
 * 解析材料状态，不把受理或邮件服务受理误作最终完成。
 * @example 模块内部上下文
 * ```ts
 * const label = collectionLabel('collecting')
 * ```
 */
export function collectionLabel(status: FeedbackReportView['collectionStatus']): string {
  return uiM(collectionKeys[status])
}

/**
 * 解析通知状态。
 * @example 模块内部上下文
 * ```ts
 * const label = notificationLabel('pending')
 * ```
 */
export function notificationLabel(status: FeedbackReportView['notificationStatus']): string {
  return uiM(notificationKeys[status])
}

/**
 * 按当前语言显示时间，不改变原始时间戳。
 * @example 模块内部上下文
 * ```ts
 * const time = feedbackTime(1_730_000_000_000)
 * ```
 */
export function feedbackTime(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(getUILocale()) : '—'
}

/**
 * 以文本显示 JSON，不将诊断材料解释为 HTML。
 * @example 模块内部上下文
 * ```ts
 * const text = evidenceText({ kind: 'log', message: '<script>' })
 * ```
 */
export function evidenceText(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return uiM('feedback_missing')
  }
}

/**
 * 预览只允许图片 URL 使用的安全协议；宿主仍负责取得授权。
 * @example 模块内部上下文
 * ```ts
 * const preview = imagePreviewUrl('/api/feedback/reports/f1/attachments/a1')
 * ```
 */
export function imagePreviewUrl(url?: string): string | undefined {
  if (!url)
    return undefined
  if (url.startsWith('/') && !url.startsWith('//'))
    return url
  if (/^(?:blob:|https?:\/\/)/i.test(url))
    return url
  return undefined
}
