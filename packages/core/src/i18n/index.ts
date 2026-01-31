/**
 * =============================================================================
 * @hai/core - i18n 模块导出
 * =============================================================================
 * 国际化工具模块
 *
 * 设计原则：
 * - 显式传 locale：库包不维护全局 locale 状态
 * - Paraglide 优先：翻译由各包的 Paraglide 编译生成
 * - 此模块提供辅助工具函数
 *
 * 注意：createMessageGetter 不直接导出，请通过 core.i18n.createMessageGetter 使用
 * =============================================================================
 */

export {
  DEFAULT_LOCALE,
  DEFAULT_LOCALES,
  detectBrowserLocale,
  interpolate,
  isLocaleSupported,
  resolveLocale,
} from './i18n-utils.js'

// 内部导出，供 core.i18n 使用
export { createMessageGetter } from './i18n-utils.js'

export type {
  InterpolationParams,
  Locale,
  LocaleInfo,
  LocaleMessages,
  MessageDictionary,
} from './i18n-utils.js'
