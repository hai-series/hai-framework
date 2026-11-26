import { createHash } from 'node:crypto'

/**
 * 按业务范围和反馈分组，供附件、导出以及到期清理使用同一对象前缀。
 * @example 模块内部上下文
 * ```ts
 * const prefix = feedbackObjectPrefix('team-1', 'feedback-42')
 * void prefix
 * ```
 */
export function feedbackObjectPrefix(scopeId: string, reportId: string): string {
  const scope = createHash('sha256').update(scopeId).digest('hex').slice(0, 16)
  return `feedback/${scope}/${reportId}/`
}
