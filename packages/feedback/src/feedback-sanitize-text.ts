import { core } from '@h-ai/core'

/**
 * Node 与 Browser 共用的自由文本凭据脱敏；URL 与结构化字段仍复用 core。
 * @example 模块内部上下文
 * ```ts
 * const safeText = redactFeedbackText('{"password":"example-only"}')
 * void safeText
 * ```
 */
export function redactFeedbackText(text: string): string {
  return core.sanitize.sanitizeText(text)
}
