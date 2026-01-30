/**
 * =============================================================================
 * @hai/core - i18n 核心实现
 * =============================================================================
 * 国际化核心功能实现
 *
 * 设计原则：
 * - 模块化：每个模块可注册自己的翻译（带命名空间）
 * - 全局单例：通过 core.i18n 访问
 * - 响应式：支持语言变更回调
 *
 * 使用方式：
 * ```ts
 * import { core } from '@hai/core'
 *
 * // 初始化（可选，有默认配置）
 * core.i18n.init({
 *   defaultLocale: 'zh-CN',
 *   detectBrowserLocale: true,
 * })
 *
 * // 注册模块翻译
 * core.i18n.register({
 *   module: 'ui',
 *   translations: {
 *     'zh-CN': { button: { submit: '提交' } },
 *     'en-US': { button: { submit: 'Submit' } },
 *   },
 * })
 *
 * // 使用翻译（自动带命名空间）
 * core.i18n.t('ui.button.submit') // => '提交'
 * ```
 * =============================================================================
 */

import type {
  FlatTranslationDict,
  I18nInitConfig,
  I18nService,
  InterpolationParams,
  Locale,
  LocaleInfo,
  ModuleTranslations,
  TranslationDict,
} from './i18n-types.js'

// =============================================================================
// 默认配置
// =============================================================================

/** 默认支持的语言 */
const DEFAULT_SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
]

/** 默认语言 */
const DEFAULT_LOCALE: Locale = 'zh-CN'

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 扁平化嵌套的翻译字典
 * @example
 * flattenDict({ a: { b: 'hello' } }, 'ns') => { 'ns.a.b': 'hello' }
 */
function flattenDict(dict: TranslationDict, prefix = ''): FlatTranslationDict {
  const result: FlatTranslationDict = {}

  for (const [key, value] of Object.entries(dict)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'string') {
      result[fullKey] = value
    }
    else {
      Object.assign(result, flattenDict(value, fullKey))
    }
  }

  return result
}

/**
 * 执行字符串插值
 * @example
 * interpolate('Hello, {name}!', { name: 'World' }) => 'Hello, World!'
 */
function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

/**
 * 默认的缺失键处理器
 */
function defaultMissingKeyHandler(key: string, _locale: Locale): string {
  return `[missing: ${key}]`
}

// =============================================================================
// i18n 服务实现
// =============================================================================

/**
 * 创建 i18n 服务
 */
export function createI18nService(): I18nService {
  // 内部状态
  let currentLocale: Locale = DEFAULT_LOCALE
  let fallbackLocale: Locale = DEFAULT_LOCALE
  let supportedLocales: LocaleInfo[] = [...DEFAULT_SUPPORTED_LOCALES]
  let missingKeyHandler = defaultMissingKeyHandler
  const localeChangeCallbacks: Set<(locale: Locale) => void> = new Set()

  // 扁平化的翻译字典（合并所有模块）
  const flatTranslations: Record<Locale, FlatTranslationDict> = {}

  /**
   * 初始化 i18n 服务
   */
  function init(config: I18nInitConfig = {}): void {
    if (config.supportedLocales) {
      supportedLocales = config.supportedLocales
    }

    if (config.defaultLocale) {
      currentLocale = config.defaultLocale
    }

    fallbackLocale = config.fallbackLocale ?? config.defaultLocale ?? DEFAULT_LOCALE

    if (config.missingKeyHandler) {
      missingKeyHandler = config.missingKeyHandler
    }

    // 自动检测浏览器语言
    if (config.detectBrowserLocale) {
      const detected = detectBrowserLocale()
      if (detected) {
        currentLocale = detected
      }
    }
  }

  /**
   * 注册模块翻译
   */
  function register(moduleTranslations: ModuleTranslations): void {
    const { module, translations } = moduleTranslations

    for (const [locale, dict] of Object.entries(translations)) {
      // 扁平化并添加模块前缀
      const flattened = flattenDict(dict, module)

      // 合并到全局翻译字典
      if (!flatTranslations[locale]) {
        flatTranslations[locale] = {}
      }
      Object.assign(flatTranslations[locale], flattened)
    }
  }

  /**
   * 翻译函数
   */
  function t(key: string, params?: InterpolationParams): string {
    // 尝试当前语言
    let template = flatTranslations[currentLocale]?.[key]

    // 尝试回退语言
    if (template === undefined && currentLocale !== fallbackLocale) {
      template = flatTranslations[fallbackLocale]?.[key]
    }

    // 未找到翻译
    if (template === undefined) {
      return missingKeyHandler(key, currentLocale)
    }

    // 无参数直接返回
    if (!params) {
      return template
    }

    // 执行插值
    return interpolate(template, params)
  }

  /**
   * 设置当前语言
   */
  function setLocale(locale: Locale): void {
    // 检查是否支持该语言
    const isSupported = supportedLocales.some(l => l.code === locale)
    if (!isSupported) {
      console.warn(`[i18n] 语言 "${locale}" 不支持，回退到 "${fallbackLocale}"`)
      locale = fallbackLocale
    }

    if (locale !== currentLocale) {
      currentLocale = locale
      // 通知所有回调
      for (const callback of localeChangeCallbacks) {
        callback(locale)
      }
    }
  }

  /**
   * 获取当前语言
   */
  function getLocale(): Locale {
    return currentLocale
  }

  /**
   * 获取支持的语言列表
   */
  function getSupportedLocales(): LocaleInfo[] {
    return [...supportedLocales]
  }

  /**
   * 检查语言是否支持
   */
  function isLocaleSupported(locale: Locale): boolean {
    return supportedLocales.some(l => l.code === locale)
  }

  /**
   * 检查翻译键是否存在
   */
  function hasKey(key: string, locale?: Locale): boolean {
    const targetLocale = locale ?? currentLocale
    return flatTranslations[targetLocale]?.[key] !== undefined
  }

  /**
   * 注册语言变更回调
   */
  function onLocaleChange(callback: (locale: Locale) => void): () => void {
    localeChangeCallbacks.add(callback)
    return () => {
      localeChangeCallbacks.delete(callback)
    }
  }

  /**
   * 检测浏览器首选语言
   */
  function detectBrowserLocale(): Locale | undefined {
    // 仅在浏览器环境中可用
    if (typeof navigator === 'undefined') {
      return undefined
    }

    const browserLocales = navigator.languages || [navigator.language]

    for (const browserLocale of browserLocales) {
      // 精确匹配
      if (isLocaleSupported(browserLocale)) {
        return browserLocale
      }

      // 语言代码匹配（如 'zh' 匹配 'zh-CN'）
      const langCode = browserLocale.split('-')[0]
      const matched = supportedLocales.find(l => l.code.startsWith(langCode))
      if (matched) {
        return matched.code
      }
    }

    return undefined
  }

  return {
    init,
    register,
    t,
    setLocale,
    getLocale,
    getSupportedLocales,
    isLocaleSupported,
    hasKey,
    onLocaleChange,
    detectBrowserLocale,
  }
}
