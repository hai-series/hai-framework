/**
 * =============================================================================
 * @h-ai/core - i18n 国际化工具
 * =============================================================================
 * 国际化核心实现，为 JSON 消息字典提供通用类型支持。
 *
 * 设计原则：
 * - 集中式 locale 管理：模块级单例管理全局 locale
 * - 集中式读取：各模块的 createMessageGetter 读取全局 locale
 * - 轻量实现：通过 JSON + createMessageGetter 完成消息获取
 * - 类型安全：完整的 TypeScript 类型支持
 * =============================================================================
 */
import type { InterpolationParams, Locale, LocaleInfo, LocaleMessages, MessageOptions } from '../core-types.js'
/**
 * 执行字符串插值。
 *
 * 将模板中的 `{key}` 占位符替换为 params 中对应的值，缺失的参数保留占位符。
 *
 * @param template - 模板字符串，如 'Hello, {name}!'
 * @param params - 插值参数
 * @returns 插值后的字符串
 *
 * @example
 * ```ts
 * interpolate('Hello, {name}!', { name: 'World' })
 * // => 'Hello, World!'
 * ```
 */
declare function interpolate(template: string, params: InterpolationParams): string
/**
 * 检查语言是否在支持列表中。
 *
 * @param locale - 要检查的语言代码
 * @param supportedLocales - 支持的语言列表
 * @returns 是否支持
 *
 * @example
 * ```ts
 * isLocaleSupported('zh-CN') // true
 * isLocaleSupported('fr-FR') // false
 * ```
 */
declare function isLocaleSupported(locale: Locale, supportedLocales?: LocaleInfo[]): boolean
/**
 * 获取有效的语言代码（不支持时回退到默认语言）。
 *
 * @param locale - 请求的语言代码
 * @param supportedLocales - 支持的语言列表
 * @param fallback - 回退语言
 * @returns 有效的语言代码
 *
 * @example
 * ```ts
 * resolveLocale('fr-FR') // 'zh-CN'（回退）
 * resolveLocale('en-US') // 'en-US'
 * ```
 */
declare function resolveLocale(locale: Locale | undefined, supportedLocales?: LocaleInfo[], fallback?: Locale): Locale
/**
 * 检测浏览器首选语言。
 *
 * 依次尝试精确匹配和语言代码前缀匹配。仅在浏览器环境可用。
 *
 * @param supportedLocales - 支持的语言列表
 * @returns 检测到的语言代码；不支持或非浏览器环境时返回 undefined
 *
 * @example
 * ```ts
 * detectBrowserLocale() // 'zh-CN' 或 'en-US' 或 undefined
 * ```
 */
declare function detectBrowserLocale(supportedLocales?: LocaleInfo[]): Locale | undefined
/**
 * 获取当前全局 locale。
 *
 * @returns 当前生效的 locale 代码
 */
declare function getGlobalLocale(): Locale
/**
 * 设置全局 locale。
 *
 * 会自动规范化简写（如 'en' → 'en-US'），然后通知所有订阅者。
 * 若值未变化则不触发通知。
 *
 * @param locale - 目标 locale 代码
 */
declare function setGlobalLocale(locale: Locale): void
/**
 * 创建消息获取函数。
 *
 * 各模块通过此函数创建自己的消息获取器，自动读取全局 locale。
 *
 * @param messages - 多语言消息对象
 * @returns 消息获取函数
 *
 * @example
 * ```ts
 * const getMessage = createMessageGetter({
 *   'zh-CN': { hello: '你好' },
 *   'en-US': { hello: 'Hello' },
 * })
 * getMessage('hello')
 * getMessage('hello', { locale: 'en-US' })
 * getMessage('hello', { params: { name: 'World' } })
 * ```
 */
declare function createMessageGetter<K extends string>(messages: LocaleMessages<K>): (key: K, options?: MessageOptions) => string
/**
 * i18n 工具集合。
 *
 * @example
 * ```ts
 * i18n.setGlobalLocale('en-US')
 * i18n.coreM('core_errorTimeout')
 *
 * const getMessage = i18n.createMessageGetter({
 *   'zh-CN': { ok: '好' },
 *   'en-US': { ok: 'OK' },
 * })
 * getMessage('ok')
 * ```
 */
export declare const i18n: {
  /** 默认支持的语言列表 */
  DEFAULT_LOCALES: LocaleInfo[]
  /** 默认语言 */
  DEFAULT_LOCALE: string
  /** 字符串插值（将 `{key}` 替换为 params 中的值） */
  interpolate: typeof interpolate
  /** 检测浏览器首选语言 */
  detectBrowserLocale: typeof detectBrowserLocale
  /** 检查语言是否在支持列表中 */
  isLocaleSupported: typeof isLocaleSupported
  /** 获取有效的语言代码（不支持时回退到默认语言） */
  resolveLocale: typeof resolveLocale
  /** 设置全局 locale（所有 createMessageGetter 创建的函数自动响应） */
  setGlobalLocale: typeof setGlobalLocale
  /** 获取当前全局 locale */
  getGlobalLocale: typeof getGlobalLocale
  /** 创建消息获取函数（读取全局 locale） */
  createMessageGetter: typeof createMessageGetter
  /** Core 内置消息获取器 */
  coreM: (key: '$schema' | 'core_errorUnknown' | 'core_errorNetwork' | 'core_errorTimeout' | 'core_errorNotFound' | 'core_errorUnauthorized' | 'core_errorForbidden' | 'core_errorValidation' | 'core_errorInternal' | 'core_actionConfirm' | 'core_actionCancel' | 'core_actionSave' | 'core_actionDelete' | 'core_actionEdit' | 'core_actionCreate' | 'core_actionUpdate' | 'core_actionSearch' | 'core_actionReset' | 'core_actionSubmit' | 'core_actionLoading' | 'core_actionRetry' | 'core_statusSuccess' | 'core_statusFailed' | 'core_statusPending' | 'core_statusProcessing' | 'core_statusCompleted' | 'core_statusCancelled' | 'core_validationRequired' | 'core_validationMinLength' | 'core_validationMaxLength' | 'core_validationEmail' | 'core_validationUrl' | 'core_validationNumber' | 'core_validationInteger' | 'core_validationPositive' | 'core_validationPattern' | 'core_timeJustNow' | 'core_timeSecondsAgo' | 'core_timeMinutesAgo' | 'core_timeHoursAgo' | 'core_timeDaysAgo' | 'core_timeWeeksAgo' | 'core_timeMonthsAgo' | 'core_timeYearsAgo' | 'core_browserFeatureUnsupported' | 'core_configEnvVarMissing' | 'core_configFileNotExist' | 'core_configParseFailed' | 'core_configValidationFailed' | 'core_configNotLoaded', options?: MessageOptions) => string
}
export {}
// # sourceMappingURL=core-i18n-utils.d.ts.map
