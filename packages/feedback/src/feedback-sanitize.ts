import { core } from '@h-ai/core'
import { redactFeedbackText } from './feedback-sanitize-text.js'

export { redactFeedbackText } from './feedback-sanitize-text.js'

/**
 * JSON 安全拷贝，避免原对象被异步采集修改；各字符串同样执行凭证脱敏。
 * @example 模块内部上下文
 * ```ts
 * const evidence = sanitizeFeedbackValue({ message: 'failure', password: 'discard-me' })
 * void evidence
 * ```
 */
export function sanitizeFeedbackValue(value: unknown): unknown {
  const sanitized = core.sanitize.sanitizeSensitiveFields(value)
  return JSON.parse(JSON.stringify(sanitized, (_key, item: unknown) => {
    if (typeof item === 'bigint')
      return item.toString()
    if (typeof item === 'string') {
      if (/^https?:\/\//i.test(item))
        return core.sanitize.sanitizeUrl(item)
      return redactFeedbackText(item)
    }
    return item
  }))
}

/**
 * 稳定提交摘要：相同内容的字段顺序不影响幂等性。
 * @example 模块内部上下文
 * ```ts
 * const first = canonicalFeedbackJson({ b: 2, a: 1 })
 * const same = first === canonicalFeedbackJson({ a: 1, b: 2 })
 * void same
 * ```
 */
export function canonicalFeedbackJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalFeedbackJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalFeedbackJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
