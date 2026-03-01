/**
 * @h-ai/ui — i18n Svelte 响应式封装
 *
 * 为 Svelte 5 应用提供 locale 状态管理的辅助工具
 * @module i18n.svelte
 */

import type { Locale, LocaleInfo } from '@h-ai/core'
import { core } from '@h-ai/core'

// 从 core.i18n 解构常用函数
const {
  DEFAULT_LOCALE,
  DEFAULT_LOCALES,
  detectBrowserLocale,
  isLocaleSupported,
  resolveLocale,
  setGlobalLocale,
} = core.i18n

// ─── LocalStorage Key ───

const LOCALE_STORAGE_KEY = 'hai-locale'

// ─── Locale Store ───

/**
 * 创建 locale 状态管理器
 *
 * @param options - 配置选项
 * @param options.defaultLocale - 默认 locale
 * @param options.supportedLocales - 支持的 locale 列表
 * @param options.detectBrowser - 是否检测浏览器语言
 * @param options.persistKey - localStorage key
 * @returns locale 状态对象
 */
export function createLocaleStore(options: {
  defaultLocale?: Locale
  supportedLocales?: LocaleInfo[]
  detectBrowser?: boolean
  persistKey?: string
} = {}) {
  const {
    defaultLocale = DEFAULT_LOCALE,
    supportedLocales = DEFAULT_LOCALES,
    detectBrowser = true,
    persistKey = LOCALE_STORAGE_KEY,
  } = options

  // 初始化 locale
  let initialLocale = defaultLocale

  if (typeof window !== 'undefined') {
    // 1. 优先从 localStorage 读取
    const savedLocale = localStorage.getItem(persistKey)
    if (savedLocale && isLocaleSupported(savedLocale, supportedLocales)) {
      initialLocale = savedLocale
    }
    // 2. 其次检测浏览器语言
    else if (detectBrowser) {
      const browserLocale = detectBrowserLocale(supportedLocales)
      if (browserLocale) {
        initialLocale = browserLocale
      }
    }
  }

  // 同步初始 locale 到 @h-ai/core 的全局管理器
  setGlobalLocale(initialLocale)

  // 使用 Svelte 5 runes 创建响应式状态
  let currentLocale = $state<Locale>(initialLocale)

  return {
    /** 当前语言（响应式） */
    get current() {
      return currentLocale
    },

    /** 支持的语言列表 */
    get supported() {
      return supportedLocales
    },

    /**
     * 设置当前语言
     * 会同步到 @h-ai/core 的全局 locale 管理器
     * 注意：你还需要调用 Paraglide 的 setLocale 来更新 UI 翻译
     */
    set(locale: Locale) {
      const resolved = resolveLocale(locale, supportedLocales, defaultLocale)
      currentLocale = resolved

      // 同步到 @h-ai/core 的全局 locale 管理器
      setGlobalLocale(resolved)

      // 持久化到 localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(persistKey, resolved)
      }
    },

    /** 检查语言是否支持 */
    isSupported(locale: Locale) {
      return isLocaleSupported(locale, supportedLocales)
    },
  }
}

// ─── 类型重导出（从 @h-ai/core 导出类型，函数通过 core.i18n 访问） ───

export type { InterpolationParams, Locale, LocaleInfo } from '@h-ai/core'

// 重导出常用常量和函数（便于应用层使用）
export {
  DEFAULT_LOCALE,
  DEFAULT_LOCALES,
  detectBrowserLocale,
  isLocaleSupported,
  resolveLocale,
  setGlobalLocale,
}

// 导出额外的便捷函数
export const getGlobalLocale = core.i18n.getGlobalLocale
export const interpolate = core.i18n.interpolate
