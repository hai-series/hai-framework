/**
 * =============================================================================
 * @hai/ui - i18n Svelte 响应式封装
 * =============================================================================
 * 为 Svelte 5 应用提供 locale 状态管理的辅助工具
 *
 * 设计原则：
 * - Paraglide 优先：翻译由 Paraglide 生成，此模块仅提供 locale 状态管理
 * - 显式 locale：库组件通过 props 接收 locale，不依赖全局状态
 * - 应用层使用：此工具主要在应用层（如 admin-console）使用
 *
 * 使用方式：
 * ```svelte
 * <script lang="ts">
 *   import { createLocaleStore } from '@hai/ui'
 *   import { m } from '$lib/paraglide/messages.js'
 *   import { setLocale } from '$lib/paraglide/runtime.js'
 *
 *   const localeStore = createLocaleStore()
 * </script>
 *
 * <p>{m.greeting({ name: 'World' })}</p>
 * <select
 *   value={localeStore.current}
 *   onchange={(e) => {
 *     localeStore.set(e.currentTarget.value)
 *     setLocale(e.currentTarget.value)
 *   }}
 * >
 *   {#each localeStore.supported as l}
 *     <option value={l.code}>{l.label}</option>
 *   {/each}
 * </select>
 * ```
 * =============================================================================
 */

import type { Locale, LocaleInfo } from '@hai/core'

import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALES,
  detectBrowserLocale,
  isLocaleSupported,
  resolveLocale,
} from '@hai/core'

// =============================================================================
// LocalStorage Key
// =============================================================================

const LOCALE_STORAGE_KEY = 'hai-locale'

// =============================================================================
// Locale Store
// =============================================================================

/**
 * 创建 locale 状态管理器
 *
 * @param options - 配置选项
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
     * 注意：这只更新本地状态，你还需要调用 Paraglide 的 setLocale
     */
    set(locale: Locale) {
      const resolved = resolveLocale(locale, supportedLocales, defaultLocale)
      currentLocale = resolved

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

// =============================================================================
// 类型重导出
// =============================================================================

export type { InterpolationParams, Locale, LocaleInfo } from '@hai/core'
export { DEFAULT_LOCALE, DEFAULT_LOCALES, detectBrowserLocale, interpolate, isLocaleSupported, resolveLocale } from '@hai/core'
