/**
 * @h-ai/ui — i18n Svelte 响应式封装
 *
 * 为 Svelte 5 应用提供 locale 状态管理的辅助工具
 * @module i18n.svelte
 */

import type { Locale, LocaleInfo } from '@h-ai/core'
import { core } from '@h-ai/core'
import { readStoredValue, writeStoredValue } from './internal/browser-safety.js'
import { changeUILocale as setGlobalLocale } from './internal/locale.js'

// 从 core.i18n 解构常用函数
const {
  DEFAULT_LOCALE,
  DEFAULT_LOCALES,
} = core.i18n

function isLocaleSupported(locale: Locale, supportedLocales: LocaleInfo[] = DEFAULT_LOCALES): boolean {
  const normalized = locale === 'en' ? 'en-US' : locale === 'zh' ? 'zh-CN' : locale
  return supportedLocales.some(item => item.code === normalized)
}

function resolveLocale(
  locale: Locale,
  supportedLocales: LocaleInfo[] = DEFAULT_LOCALES,
  defaultLocale: Locale = DEFAULT_LOCALE,
): Locale {
  const normalized = locale === 'en' ? 'en-US' : locale === 'zh' ? 'zh-CN' : locale
  return isLocaleSupported(normalized, supportedLocales) ? normalized : defaultLocale
}

function detectBrowserLocale(supportedLocales: LocaleInfo[] = DEFAULT_LOCALES): Locale | null {
  if (typeof navigator === 'undefined') {
    return null
  }

  const browserCandidates: Locale[] = [
    navigator.language,
    ...(navigator.languages ?? []),
  ]

  for (const candidate of browserCandidates) {
    const resolved = resolveLocale(candidate, supportedLocales, DEFAULT_LOCALE)
    if (isLocaleSupported(resolved, supportedLocales)) {
      return resolved
    }
  }

  return null
}

function interpolate(template: string, params: Record<string, string | number | boolean> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

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
 * @example
 * ```ts
 * const locale = createLocaleStore({ defaultLocale: 'en-US', detectBrowser: false })
 * locale.set('zh-CN') // 浏览器同步应用语言；SSR 只改变这个 store
 * ```
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
    const savedLocale = readStoredValue(persistKey)
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

  // SSR store 属于当前组件树，不能修改另一个请求的默认语言。
  if (typeof window !== 'undefined')
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
     * 浏览器同步到 @h-ai/core；SSR 仅改变当前 store，消息语言由 runWithLocale 绑定。
     * 注意：你还需要调用 Paraglide 的 setLocale 来更新 UI 翻译
     */
    set(locale: Locale) {
      const resolved = resolveLocale(locale, supportedLocales, defaultLocale)
      currentLocale = resolved

      // 服务端语言由外层 runWithLocale 明确绑定，store 只在浏览器同步应用状态。
      if (typeof window !== 'undefined')
        setGlobalLocale(resolved)

      // 持久化到 localStorage
      if (typeof window !== 'undefined') {
        writeStoredValue(persistKey, resolved)
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
  interpolate,
  isLocaleSupported,
  resolveLocale,
  setGlobalLocale,
}

// 导出额外的便捷函数
export const getGlobalLocale = core.i18n.getGlobalLocale
