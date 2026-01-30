/**
 * =============================================================================
 * @hai/core - i18n 类型定义
 * =============================================================================
 * 国际化核心类型定义
 *
 * 设计原则：
 * - 类型安全：完整的 TypeScript 类型支持
 * - 模块化：每个模块可注册自己的翻译
 * - 可扩展：支持动态添加语言和翻译
 * - 跨平台：前后端通用
 * =============================================================================
 */

/**
 * 语言代码（ISO 639-1 + 地区代码）
 * @example 'zh-CN', 'en-US', 'ja-JP'
 */
export type Locale = string

/**
 * 翻译字典类型
 * 支持嵌套结构
 */
export interface TranslationDict {
  [key: string]: string | TranslationDict
}

/**
 * 扁平化的翻译字典（内部使用）
 */
export type FlatTranslationDict = Record<string, string>

/**
 * 语言信息
 */
export interface LocaleInfo {
  /** 语言代码 */
  code: Locale
  /** 显示名称 */
  label: string
  /** 是否为 RTL 语言 */
  rtl?: boolean
}

/**
 * 模块翻译配置
 * 每个模块提供自己的翻译资源
 */
export interface ModuleTranslations {
  /** 模块名称（用于命名空间，如 'core', 'ui', 'iam'） */
  module: string
  /** 翻译字典（按语言分组） */
  translations: Record<Locale, TranslationDict>
}

/**
 * i18n 初始化配置
 */
export interface I18nInitConfig {
  /** 默认语言 */
  defaultLocale?: Locale
  /** 支持的语言列表 */
  supportedLocales?: LocaleInfo[]
  /** 回退语言（当翻译缺失时） */
  fallbackLocale?: Locale
  /** 翻译缺失时的处理方式 */
  missingKeyHandler?: (key: string, locale: Locale) => string
  /** 是否自动检测浏览器语言 */
  detectBrowserLocale?: boolean
}

/**
 * 插值参数类型
 */
export type InterpolationParams = Record<string, string | number | boolean>

/**
 * i18n 服务接口（整合到 core 中）
 */
export interface I18nService {
  /**
   * 初始化 i18n 服务
   */
  init: (config?: I18nInitConfig) => void

  /**
   * 注册模块翻译
   * @param moduleTranslations 模块翻译配置
   */
  register: (moduleTranslations: ModuleTranslations) => void

  /**
   * 翻译函数
   * @param key 翻译键（支持命名空间，如 'ui.button.submit'）
   * @param params 插值参数
   */
  t: (key: string, params?: InterpolationParams) => string

  /**
   * 设置当前语言
   */
  setLocale: (locale: Locale) => void

  /**
   * 获取当前语言
   */
  getLocale: () => Locale

  /**
   * 获取支持的语言列表
   */
  getSupportedLocales: () => LocaleInfo[]

  /**
   * 检查语言是否支持
   */
  isLocaleSupported: (locale: Locale) => boolean

  /**
   * 检查翻译键是否存在
   */
  hasKey: (key: string, locale?: Locale) => boolean

  /**
   * 注册语言变更回调
   * @returns 取消注册函数
   */
  onLocaleChange: (callback: (locale: Locale) => void) => () => void

  /**
   * 检测浏览器首选语言
   * @returns 检测到的语言代码，如果不支持则返回 undefined
   */
  detectBrowserLocale: () => Locale | undefined
}

/**
 * 翻译加载器（可选，用于懒加载翻译）
 */
export interface TranslationLoader {
  load: (locale: Locale) => Promise<TranslationDict>
}
