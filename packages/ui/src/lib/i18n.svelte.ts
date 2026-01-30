/**
 * =============================================================================
 * @hai/ui - i18n Svelte 响应式封装
 * =============================================================================
 * 使用 Svelte 5 runes 封装 @hai/core 的 i18n 功能
 *
 * 使用方式：
 * ```svelte
 * <script lang="ts">
 *   import { initI18n, useI18n } from '@hai/ui'
 *   import { core } from '@hai/core'
 *
 *   // 在应用入口初始化（可选，会自动检测浏览器语言）
 *   initI18n({ detectBrowserLocale: true })
 *
 *   // 注册模块翻译
 *   core.i18n.register(myAppTranslations)
 *
 *   // 在组件中使用
 *   const { t, locale, setLocale, locales } = useI18n()
 * </script>
 *
 * <p>{t('ui.button.submit')}</p>
 * <select bind:value={locale} onchange={(e) => setLocale(e.currentTarget.value)}>
 *   {#each locales as l}
 *     <option value={l.code}>{l.label}</option>
 *   {/each}
 * </select>
 * ```
 * =============================================================================
 */

import {
  core,
  coreTranslations,
  type I18nInitConfig,
  type InterpolationParams,
  type Locale,
  type LocaleInfo,
  type ModuleTranslations,
} from '@hai/core'
import { uiTranslations } from './i18n-translations.js'

// =============================================================================
// 内部状态
// =============================================================================

let initialized = false
let localeState = $state<Locale>('zh-CN')

// =============================================================================
// 初始化
// =============================================================================

/**
 * 初始化 i18n（在应用入口调用一次）
 * 会自动注册 core 和 ui 模块的翻译
 */
export function initI18n(config: I18nInitConfig = {}): void {
  if (initialized) {
    console.warn('[i18n] 已初始化，跳过重复初始化')
    return
  }

  // 初始化 i18n 服务
  core.i18n.init({
    defaultLocale: config.defaultLocale ?? 'zh-CN',
    detectBrowserLocale: config.detectBrowserLocale ?? true,
    ...config,
  })

  // 注册 core 模块翻译
  core.i18n.register(coreTranslations)

  // 注册 ui 模块翻译
  core.i18n.register(uiTranslations)

  // 同步响应式状态
  localeState = core.i18n.getLocale()

  // 监听语言变更，同步到响应式状态
  core.i18n.onLocaleChange((newLocale) => {
    localeState = newLocale
  })

  // 尝试从 localStorage 恢复语言设置
  if (typeof window !== 'undefined') {
    const savedLocale = localStorage.getItem('hai-locale')
    if (savedLocale && core.i18n.isLocaleSupported(savedLocale)) {
      core.i18n.setLocale(savedLocale)
    }
  }

  initialized = true
}

/**
 * 注册模块翻译（便捷方法）
 */
export function registerTranslations(moduleTranslations: ModuleTranslations): void {
  core.i18n.register(moduleTranslations)
}

// =============================================================================
// Svelte 响应式 Hook
// =============================================================================

/**
 * i18n 响应式 Hook
 *
 * @returns 响应式的 i18n 对象
 *
 * @example
 * ```svelte
 * <script>
 *   const { t, locale, setLocale, locales } = useI18n()
 * </script>
 * ```
 */
export function useI18n() {
  // 确保已初始化
  if (!initialized) {
    initI18n()
  }

  /**
   * 翻译函数（响应式：语言变更时会重新计算）
   */
  function t(key: string, params?: InterpolationParams): string {
    // 通过访问 localeState 来触发响应式更新
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    localeState
    return core.i18n.t(key, params)
  }

  /**
   * 设置当前语言
   */
  function setLocale(locale: Locale): void {
    core.i18n.setLocale(locale)
    // 保存到 localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('hai-locale', locale)
    }
  }

  return {
    /** 翻译函数 */
    t,
    /** 当前语言（响应式） */
    get locale() {
      return localeState
    },
    /** 设置当前语言 */
    setLocale,
    /** 支持的语言列表 */
    get locales() {
      return core.i18n.getSupportedLocales()
    },
    /** 检查语言是否支持 */
    isLocaleSupported: (locale: Locale) => core.i18n.isLocaleSupported(locale),
    /** 检查翻译键是否存在 */
    hasKey: (key: string) => core.i18n.hasKey(key),
    /** 注册模块翻译 */
    register: (moduleTranslations: ModuleTranslations) => core.i18n.register(moduleTranslations),
  }
}

// =============================================================================
// 便捷导出
// =============================================================================

/**
 * 全局翻译函数（非响应式版本，适合在非组件代码中使用）
 */
export function t(key: string, params?: InterpolationParams): string {
  if (!initialized) {
    initI18n()
  }
  return core.i18n.t(key, params)
}

/**
 * 设置全局语言
 */
export function setLocale(locale: Locale): void {
  if (!initialized) {
    initI18n()
  }
  core.i18n.setLocale(locale)
  if (typeof window !== 'undefined') {
    localStorage.setItem('hai-locale', locale)
  }
}

/**
 * 获取当前语言
 */
export function getLocale(): Locale {
  if (!initialized) {
    initI18n()
  }
  return core.i18n.getLocale()
}

/**
 * 获取支持的语言列表
 */
export function getSupportedLocales(): LocaleInfo[] {
  if (!initialized) {
    initI18n()
  }
  return core.i18n.getSupportedLocales()
}

// 类型重导出
export type { I18nInitConfig, InterpolationParams, Locale, LocaleInfo, ModuleTranslations }
