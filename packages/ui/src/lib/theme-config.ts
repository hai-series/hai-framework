/**
 * @h-ai/ui — 主题配置
 *
 * DaisyUI 主题元数据和配置
 * @module theme-config
 */

import type { UIMessageKey } from './messages.js'

/**
 * 主题信息
 */
export interface ThemeInfo {
  /** 主题标识符 */
  id: string
  /** 显示名称 */
  name: string
  /** 是否为暗色主题 */
  dark: boolean
  /** 主题色（用于预览） */
  primaryColor: string
  /** 背景色（用于预览） */
  bgColor: string
}

/**
 * 主题分组
 */
export interface ThemeGroup {
  /** 分组标识 */
  id: string
  /** 分组名称 i18n key */
  nameKey: UIMessageKey
  /** 分组内的主题 */
  themes: ThemeInfo[]
}

/**
 * DaisyUI 内置主题配置（精选）
 */
export const THEMES: ThemeInfo[] = [
  // 亮色主题
  { id: 'light', name: 'Light', dark: false, primaryColor: '#570df8', bgColor: '#ffffff' },
  { id: 'cupcake', name: 'Cupcake', dark: false, primaryColor: '#65c3c8', bgColor: '#faf7f5' },
  { id: 'emerald', name: 'Emerald', dark: false, primaryColor: '#66cc8a', bgColor: '#ffffff' },
  { id: 'corporate', name: 'Corporate', dark: false, primaryColor: '#4b6bfb', bgColor: '#ffffff' },
  { id: 'lofi', name: 'Lo-Fi', dark: false, primaryColor: '#0d0d0d', bgColor: '#ffffff' },
  { id: 'winter', name: 'Winter', dark: false, primaryColor: '#047aff', bgColor: '#ffffff' },
  { id: 'nord', name: 'Nord', dark: false, primaryColor: '#5e81ac', bgColor: '#eceff4' },
  // 暗色主题
  { id: 'dark', name: 'Dark', dark: true, primaryColor: '#661ae6', bgColor: '#1d232a' },
  { id: 'dracula', name: 'Dracula', dark: true, primaryColor: '#ff79c6', bgColor: '#282a36' },
  { id: 'business', name: 'Business', dark: true, primaryColor: '#1c4f82', bgColor: '#202020' },
  { id: 'night', name: 'Night', dark: true, primaryColor: '#38bdf8', bgColor: '#0f172a' },
  { id: 'dim', name: 'Dim', dark: true, primaryColor: '#9fe88d', bgColor: '#2a303c' },
  { id: 'sunset', name: 'Sunset', dark: true, primaryColor: '#ff865b', bgColor: '#1a1919' },
  { id: 'luxury', name: 'Luxury', dark: true, primaryColor: '#c9a53d', bgColor: '#171618' },
  { id: 'coffee', name: 'Coffee', dark: true, primaryColor: '#db924b', bgColor: '#20161f' },
]

/**
 * 主题分组配置
 */
export const THEME_GROUPS: ThemeGroup[] = [
  {
    id: 'light',
    nameKey: 'theme_group_light',
    themes: THEMES.filter(t => !t.dark),
  },
  {
    id: 'dark',
    nameKey: 'theme_group_dark',
    themes: THEMES.filter(t => t.dark),
  },
]

/**
 * 暗色主题列表
 */
export const DARK_THEMES = THEMES.filter(t => t.dark).map(t => t.id)

/**
 * 获取主题信息
 */
export function getThemeInfo(themeId: string): ThemeInfo | undefined {
  return THEMES.find(t => t.id === themeId)
}

/**
 * 检查是否为暗色主题
 */
export function isDarkTheme(themeId: string): boolean {
  return DARK_THEMES.includes(themeId)
}

// ─── 主题初始化工具 ───

/**
 * 默认主题
 */
export const DEFAULT_THEME = 'light'

/**
 * 主题存储键名
 */
export const THEME_STORAGE_KEY = 'theme'

/**
 * 获取主题初始化脚本（用于 app.html 防闪烁）
 *
 * 使用方式：在 app.html 的 <head> 中添加 <script>{getThemeInitScript()}</script>
 */
export function getThemeInitScript(): string {
  return `(function(){var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';document.documentElement.setAttribute('data-theme',t)})()`
}

/**
 * 应用主题
 * @param theme - 主题 ID
 * @param persist - 是否持久化到 localStorage
 */
export function applyTheme(theme: string, persist = true): void {
  if (typeof document === 'undefined')
    return

  document.documentElement.setAttribute('data-theme', theme)

  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
}

/**
 * 获取当前主题
 */
export function getCurrentTheme(): string {
  if (typeof document === 'undefined')
    return DEFAULT_THEME
  return document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME
}

/**
 * 获取保存的主题（从 localStorage）
 */
export function getSavedTheme(): string {
  if (typeof localStorage === 'undefined')
    return DEFAULT_THEME
  return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME
}

/**
 * DaisyUI 主题配置字符串（用于 app.css）
 *
 * 注意：Tailwind CSS v4 要求主题在 CSS 中声明，无法通过 JS 动态注入
 * 消费应用需要在 app.css 中添加：
 *
 * @plugin "daisyui" {
 *   themes: light --default, dark --prefersdark, cupcake, bumblebee, ...
 * }
 */
export const DAISYUI_THEMES_CONFIG = THEMES.map((t, i) => {
  if (i === 0)
    return `${t.id} --default`
  if (t.id === 'dark')
    return `${t.id} --prefersdark`
  return t.id
}).join(',\n    ')
