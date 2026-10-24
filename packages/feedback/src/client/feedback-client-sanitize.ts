import { core } from '@h-ai/core'
import { redactFeedbackText } from '../feedback-sanitize-text.js'

const CREDENTIAL_NAME = /authorization|password|passcode|secret|token|session|csrf|credential|api.?key|private.?key/i

/**
 * 浏览器自由文本全文脱敏；附件总字节数由调用方限制，结构化字段自行裁剪。
 * @example 模块内部上下文
 * ```ts
 * const safeText = sanitizeFeedbackText('Request failed token=example-only')
 * void safeText
 * ```
 */
export function sanitizeFeedbackText(value: string): string {
  return redactFeedbackText(value).replace(/\bhttps?:\/\/[^\s<>"']+/gi, url => core.sanitize.sanitizeUrl(url))
}

/**
 * 自由文本也在进入缓冲前脱敏；结构化字段规则复用 core。
 * @example 模块内部上下文
 * ```ts
 * const safe = sanitizeFeedbackData({ token: 'example-only', message: 'Request failed' })
 * ```
 */
export function sanitizeFeedbackData(value: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>()
  function visit(input: unknown, depth: number): unknown {
    if (depth > 8)
      return '[TRUNCATED]'
    if (typeof input === 'string')
      return sanitizeFeedbackText(input).slice(0, 8192)
    if (input instanceof Error)
      return visit({ name: input.name, message: input.message, stack: input.stack }, depth + 1)
    if (!input || typeof input !== 'object')
      return input === undefined || typeof input === 'function' || typeof input === 'symbol' ? null : typeof input === 'bigint' ? String(input) : input
    if (seen.has(input))
      return '[CIRCULAR]'
    seen.add(input)
    if (Array.isArray(input))
      return input.slice(0, 200).map(item => visit(item, depth + 1))
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(input).slice(0, 100)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        continue
      output[key] = CREDENTIAL_NAME.test(key) ? '[REDACTED]' : visit(item, depth + 1)
    }
    return output
  }
  const safe = core.sanitize.sanitizeSensitiveFields(visit(value, 0))
  return safe && typeof safe === 'object' && !Array.isArray(safe) ? safe as Record<string, unknown> : { value: safe }
}

/**
 * 保留 rrweb 的快照树结构；禁用脚本/导航及外部资源，避免离线查看访问生产网络。
 * @example 模块内部上下文
 * ```ts
 * const safe = sanitizeFeedbackReplay({ type: 2, data: { node: { tagName: 'div', attributes: {} } } })
 * ```
 */
export function sanitizeFeedbackReplay(value: unknown): Record<string, unknown> {
  function visit(input: unknown, depth: number): unknown {
    if (depth > 64)
      throw new Error('Replay snapshot exceeds depth limit')
    if (typeof input === 'string')
      return sanitizeFeedbackText(input)
    if (input === undefined)
      return null
    if (!input || typeof input !== 'object')
      return input
    if (Array.isArray(input))
      return input.map(item => visit(item, depth + 1))
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        continue
      if (key === 'attributes' && item && typeof item === 'object') {
        const attributes: Record<string, unknown> = {}
        for (const [attribute, content] of Object.entries(item)) {
          if (/^on|^(?:srcdoc|action|formaction|href|srcset)$/i.test(attribute) || CREDENTIAL_NAME.test(attribute))
            continue
          if (attribute === 'src' && typeof content === 'string' && !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(content)) {
            attributes['data-feedback-missing-resource'] = true
            continue
          }
          if (attribute === 'style' && typeof content === 'string' && /url\s*\(/i.test(content)) {
            attributes.style = sanitizeFeedbackText(content).replace(/url\s*\([^)]*\)/gi, '')
            attributes['data-feedback-missing-resource'] = true
          }
          else {
            attributes[attribute] = visit(content, depth + 1)
          }
        }
        output[key] = attributes
      }
      else if (key === 'textContent' && typeof item === 'string') {
        output[key] = sanitizeFeedbackText(item).replace(/(?:url|@import)\s*\([^)]*\)|@import\s+["'][^"']+["']/gi, '')
      }
      else {
        output[key] = CREDENTIAL_NAME.test(key) ? '[REDACTED]' : visit(item, depth + 1)
      }
    }
    return output
  }
  return visit(value, 0) as Record<string, unknown>
}

/**
 * 只保留显式白名单中的普通业务 Cookie，永远拒绝凭证类名称。
 * @example 模块内部上下文
 * ```ts
 * const cookies = collectFeedbackCookies('theme=dark; access_token=example-only', ['theme'])
 * ```
 */
export function collectFeedbackCookies(cookie: string, allowlist: readonly string[]): Record<string, string> {
  const allowed = new Set(allowlist.filter(name => !CREDENTIAL_NAME.test(name)))
  const output: Record<string, string> = {}
  for (const pair of cookie.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0)
      continue
    const name = pair.slice(0, separator).trim()
    if (!allowed.has(name))
      continue
    output[name] = redactFeedbackText(pair.slice(separator + 1).trim().slice(0, 256))
  }
  return output
}

/**
 * 默认 URL 不收集查询参数和 hash，避免未知业务隐私进入材料。
 * @example 模块内部上下文
 * ```ts
 * const page = feedbackPageUrl('https://example.test/orders?filter=mine')
 * ```
 */
export function feedbackPageUrl(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  }
  catch {
    return '[INVALID_URL]'
  }
}
