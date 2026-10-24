// 同时识别普通引号和一层 JSON 字符串内的转义引号，不尝试解码任意载荷。
const CREDENTIAL_TEXT = /\b(?:Bearer|Basic)\s+[\w.~+/-]+=*|\b(?:[\w-]*[_-])?(?:password|passwd|passcode|secret|token|session(?:[_-]?id)?|authorization|cookie|csrf|credential|api[_-]?key|private[_-]?key|(?:access|refresh|id|csrf)token)(?:\\?["'])?\s*[:=]\s*(?:(?:Bearer|Basic)\s+)?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\"(?:[^\\]|\\\\\\\\|\\\\\\"|\\\\[^"\\])*\\"|[^\s,;&}\]]+)/gi

/**
 * Node 与 Browser 共用的自由文本凭据脱敏；URL 与结构化字段仍复用 core。
 * @example 模块内部上下文
 * ```ts
 * const safeText = redactFeedbackText('{"password":"example-only"}')
 * void safeText
 * ```
 */
export function redactFeedbackText(text: string): string {
  return text.replace(CREDENTIAL_TEXT, '[REDACTED]')
}
