/**
 * =============================================================================
 * @h-ai/audit - i18n
 * =============================================================================
 *
 * 本文件提供审计模块的 i18n 文案访问入口。
 *
 * @example
 * ```ts
 * import { auditM } from './audit-i18n.js'
 *
 * const message = auditM('audit_notInitialized')
 * const withParam = auditM('audit_logFailed', { params: { error: 'timeout' } })
 * ```
 * =============================================================================
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 审计模块文案 Key 类型
 */
type AuditMessageKey = keyof typeof messagesZhCN

/**
 * 获取审计模块文案。
 *
 * @param key - 文案 Key（以 `audit_` 为前缀）
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @remarks 具体参数结构与 core.i18n.createMessageGetter 保持一致。
 *
 * @example
 * ```ts
 * const text = auditM('audit_notInitialized')
 * const withError = auditM('audit_logFailed', { params: { error: 'DB connection lost' } })
 * ```
 */
export const auditM = core.i18n.createMessageGetter<AuditMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
