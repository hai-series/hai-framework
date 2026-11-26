/**
 * @h-ai/serv — i18n 工具
 *
 * Serv 模块的国际化消息工具，从 @h-ai/core 调用 i18n API。
 * 与 kit-i18n 结构对齐，便于跨包统一维护。
 * @module serv-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * Serv 本地化消息的真实 key 联合。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const key: ServMessageKey = 'serv_errorForbidden'
 * const message = servM(key, { locale: 'en-US' })
 * ```
 */
type ServMessageKey = keyof typeof messagesZhCN

/**
 * Serv 的默认请求语言，供请求解析与本地化校验复用。
 * @example 模块内部上下文
 * ```ts
 * const fallback = normalizeServLocale(undefined) === DEFAULT_SERV_LOCALE
 * ```
 */
export const DEFAULT_SERV_LOCALE = 'zh-CN'
const supportedLanguages = new Map([
  ['zh', DEFAULT_SERV_LOCALE],
  ['en', 'en-US'],
  ['ja', 'ja-JP'],
])

/**
 * 规范化 serv 请求 locale。
 *
 * 支持：
 * - 完整 locale：`zh-CN` / `en-US` / `ja-JP`
 * - 简写：`zh` / `en` / `ja`
 * - `Accept-Language` 风格值：`en-US,en;q=0.9`
 *
 * 未识别时回退到默认 `zh-CN`。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const english = normalizeServLocale('en-US,en;q=0.9')
 * const fallback = normalizeServLocale(undefined)
 * ```
 */
export function normalizeServLocale(locale: string | undefined): string {
  for (const entry of locale?.split(',') ?? []) {
    const [tag = '', quality = ''] = entry.split(';', 2)
    if (/^q\s*=\s*0(?:\.0*)?$/i.test(quality.trim()))
      continue
    const language = tag.trim().split('-', 1)[0]?.toLowerCase() ?? ''
    const supported = supportedLanguages.get(language)
    if (supported)
      return supported
  }
  return DEFAULT_SERV_LOCALE
}

/**
 * 获取 Serv 模块的 i18n 消息。
 *
 * 单次调用可通过 `options.locale` 指定该次调用使用的语言，
 * 用于在请求处理过程中根据 `Accept-Language` 头本地化错误消息，
 * 而不污染全局 locale（多并发请求安全）。
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 *
 * const message = serv.m('serv_validationStringMin', { locale: 'en-US', params: { min: 3 } })
 * // 单次 locale 不修改并发请求的全局语言。
 * ```
 */
export const servM = core.i18n.createMessageGetter<ServMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})

export type { ServMessageKey }
