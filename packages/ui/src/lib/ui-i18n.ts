import { authErrorMessage } from './components/scenes/iam/auth-error-message.js'
import { createLocaleStore, detectBrowserLocale, getGlobalLocale, interpolate, isLocaleSupported, resolveLocale } from './i18n.svelte.js'
import { changeUILocale as setGlobalLocale } from './internal/locale.js'

export { DEFAULT_LOCALE, DEFAULT_LOCALES } from './i18n.svelte.js'
export type { InterpolationParams, Locale, LocaleInfo } from './i18n.svelte.js'

/**
 * UI i18n 子路径的运行入口。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/i18n'
 *
 * // 按框架支持的语言解析传入的语言标识。
 * const locale = ui.resolveLocale('en-US')
 * void locale
 * ```
 */
export const ui = {
  createLocaleStore,
  authErrorMessage,
  detectBrowserLocale,
  interpolate,
  isLocaleSupported,
  resolveLocale,
  setGlobalLocale,
  getGlobalLocale,
}
