/**
 * @h-ai/ui — 主题配置
 *
 * DaisyUI 主题元数据和配置
 * @module theme-config
 */

import type { UIMessageKey } from './messages.js'
import { readStoredValue, writeStoredValue } from './internal/browser-safety.js'

/**
 * 主题信息
 *
 * @example
 * ```ts
 * import type { ThemeInfo } from '@h-ai/ui'
 * const example: ThemeInfo = { id: 'light', name: 'Light', dark: false, primaryColor: '#2563eb', bgColor: '#ffffff' }
 * ```
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
 * 主题色预设定义
 *
 * @example
 * ```ts
 * import type { ThemeColorPreset } from '@h-ai/ui'
 * const example: ThemeColorPreset = { value: '#2563eb', labelKey: 'theme_color_ocean' }
 * ```
 */
export interface ThemeColorPreset {
  /** 颜色值（Hex） */
  value: string
  /** 预设标签 i18n key */
  labelKey: UIMessageKey
}

/**
 * 主题分组
 *
 * @example
 * ```ts
 * import type { ThemeGroup } from '@h-ai/ui'
 * const example: ThemeGroup = { id: 'light', nameKey: 'theme_group_light', themes: [{ id: 'light', name: 'Light', dark: false, primaryColor: '#2563eb', bgColor: '#ffffff' }] }
 * ```
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
 *
 * @example
 * ```ts
 * import { THEMES } from '@h-ai/ui'
 * const choices = THEMES.map(theme => ({ value: theme.id, label: theme.name }))
 * ```
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
 *
 * @example
 * ```ts
 * import { THEME_GROUPS } from '@h-ai/ui'
 * const light = THEME_GROUPS.find(group => group.id === 'light')
 * const choices = light?.themes
 * ```
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
 *
 * @example
 * ```ts
 * import { DARK_THEMES } from '@h-ai/ui'
 * const dark = DARK_THEMES.includes('dark')
 * ```
 */
export const DARK_THEMES = THEMES.filter(t => t.dark).map(t => t.id)

/**
 * 支持的主题 ID 列表
 *
 * @example
 * ```ts
 * import { SUPPORTED_THEME_IDS } from '@h-ai/ui'
 * const supported = SUPPORTED_THEME_IDS.includes('light')
 * ```
 */
export const SUPPORTED_THEME_IDS = THEMES.map(theme => theme.id)

/**
 * 默认主题色
 *
 * @example
 * ```ts
 * import { DEFAULT_THEME_COLOR } from '@h-ai/ui'
 * const style = { '--brand-color': DEFAULT_THEME_COLOR }
 * ```
 */
export const DEFAULT_THEME_COLOR = '#5765f0'

/**
 * 主题色 CSS 变量名
 *
 * @example
 * ```ts
 * import { DEFAULT_THEME_COLOR_CSS_VAR } from '@h-ai/ui'
 * document.documentElement.style.setProperty(DEFAULT_THEME_COLOR_CSS_VAR, '#2563eb')
 * ```
 */
export const DEFAULT_THEME_COLOR_CSS_VAR = '--hai-theme-color-default'

/**
 * 内置主题色预设
 *
 * @example
 * ```ts
 * import { THEME_COLOR_PRESETS } from '@h-ai/ui'
 * const options = THEME_COLOR_PRESETS.map(preset => ({ value: preset.value, labelKey: preset.labelKey }))
 * ```
 */
export const THEME_COLOR_PRESETS: ThemeColorPreset[] = [
  { value: DEFAULT_THEME_COLOR, labelKey: 'theme_color_tech_purple' },
  { value: '#13b981', labelKey: 'theme_color_grid_green' },
  { value: '#1f5eff', labelKey: 'theme_color_ocean' },
]

const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i
const SHORT_HEX_COLOR_REGEX = /^#[0-9a-f]{3}$/i
const SUPPORTED_THEME_ID_SET = new Set(SUPPORTED_THEME_IDS)

/**
 * 默认主题
 *
 * @example
 * ```ts
 * import { DEFAULT_THEME, applyTheme } from '@h-ai/ui'
 * applyTheme(DEFAULT_THEME, false)
 * ```
 */
export const DEFAULT_THEME = 'light'

/**
 * 主题存储键名
 *
 * @example
 * ```ts
 * import { THEME_STORAGE_KEY, getSavedTheme } from '@h-ai/ui'
 * const preference = { key: THEME_STORAGE_KEY, value: getSavedTheme('light') }
 * // 通过公开安全读取函数消费偏好，不直接访问受限存储。
 * ```
 */
export const THEME_STORAGE_KEY = 'theme'

/**
 * 获取主题信息
 * @param themeId - 主题候选 ID。
 * @returns 匹配的主题元数据，不存在时返回 undefined。
 *
 * @example
 * ```ts
 * import { getThemeInfo } from '@h-ai/ui'
 * const theme = getThemeInfo('light')
 * const background = theme?.bgColor
 * ```
 */
export function getThemeInfo(themeId: string): ThemeInfo | undefined {
  return THEMES.find(t => t.id === themeId)
}

/**
 * 检查是否为暗色主题
 * @param themeId - 主题候选 ID。
 * @returns 是否属于内置暗色主题。
 *
 * @example
 * ```ts
 * import { isDarkTheme } from '@h-ai/ui'
 * const dark = isDarkTheme('dark')
 * ```
 */
export function isDarkTheme(themeId: string): boolean {
  return DARK_THEMES.includes(themeId)
}

/**
 * 归一化主题 ID，不支持的值回退到默认主题。
 * @param themeId - 主题候选 ID。
 * @param fallbackThemeId - 候选不支持时尝试的主题。
 * @returns 支持的主题 ID；无效输入按候选和默认主题回退。
 *
 * @example
 * ```ts
 * import { normalizeThemeId } from '@h-ai/ui'
 * const theme = normalizeThemeId('unknown-theme', 'light')
 * ```
 */
export function normalizeThemeId(
  themeId: string | null | undefined,
  fallbackThemeId = DEFAULT_THEME,
): string {
  const normalized = `${themeId ?? ''}`
  if (SUPPORTED_THEME_ID_SET.has(normalized)) {
    return normalized
  }
  return SUPPORTED_THEME_ID_SET.has(fallbackThemeId) ? fallbackThemeId : DEFAULT_THEME
}

/**
 * 归一化 Hex 颜色；无效值返回 null。
 * @param value - 待处理或校验的值。
 * @returns 小写六位 Hex 颜色；无效输入返回 null。
 *
 * @example
 * ```ts
 * import { normalizeHexColor } from '@h-ai/ui'
 * const color = normalizeHexColor('#abc')
 * ```
 */
export function normalizeHexColor(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? ''

  if (HEX_COLOR_REGEX.test(normalized)) {
    return normalized
  }

  if (SHORT_HEX_COLOR_REGEX.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
  }

  return null
}

/**
 * 解析主题对应的浏览器色调。
 * @param themeId - 主题候选 ID。
 * @returns 供浏览器控件配色使用的 light/dark 值。
 *
 * @example
 * ```ts
 * import { resolveThemeTone } from '@h-ai/ui'
 * const tone = resolveThemeTone('dark')
 * ```
 */
export function resolveThemeTone(themeId: string): 'light' | 'dark' {
  return isDarkTheme(themeId) ? 'dark' : 'light'
}

// ─── 主题初始化工具 ───

/**
 * 主题首屏恢复脚本里可选的语言字段配置。
 *
 * 业务侧如果把语言和主题一起落到同一个偏好对象里，可用这组配置在首屏阶段同步恢复语言值，
 * 避免 HTML shell 和 hydrate 后的语言状态短暂不一致。
 *
 * @example
 * ```ts
 * import type { ThemeBootstrapLocaleConfig } from '@h-ai/ui'
 * const example: ThemeBootstrapLocaleConfig = { key: 'demo-locale', defaultValue: 'zh-CN', supportedValues: ['zh-CN', 'en-US'] }
 * ```
 */
export interface ThemeBootstrapLocaleConfig {
  /** 偏好对象中的语言字段名。 */
  key: string
  /** 默认语言。 */
  defaultValue: string
  /** 允许的语言列表。 */
  supportedValues: string[]
}

/**
 * 生成首屏主题恢复脚本时使用的宿主侧配置。
 *
 * 这组配置刻意只保留“HTML shell 首屏恢复”所需的信息，避免把运行时 helper 或 UI 组件状态
 * 泄漏到脚本字符串里，方便不同应用在 `app.html` / 服务端模板中复用同一套恢复逻辑。
 *
 * @example
 * ```ts
 * import type { ThemeBootstrapScriptOptions } from '@h-ai/ui'
 * const example: ThemeBootstrapScriptOptions = { storageKey: 'demo-theme', defaultThemeId: 'light', defaultThemeColor: '#2563eb' }
 * ```
 */
export interface ThemeBootstrapScriptOptions {
  /** 偏好存储 key。 */
  storageKey: string
  /** 历史主题 key；传 null 表示不做迁移。 */
  legacyThemeStorageKey?: string | null
  /** 默认主题 ID。 */
  defaultThemeId?: string
  /** 默认主题色；传 null 表示不处理主题色。 */
  defaultThemeColor?: string | null
  /** 主题色写入的 CSS 变量；传 null 表示不写。 */
  colorCssVar?: string | null
  /** 主题 tone 写入的 dataset key；传 null 表示不写。 */
  toneDatasetKey?: string | null
  /** 可选的语言字段配置。 */
  locale?: ThemeBootstrapLocaleConfig | null
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * 生成首屏主题恢复脚本，适合注入到 SvelteKit `app.html` 的 `<script>` 中。
 * @param options - 本次操作的行为与显示选项。
 * @returns 可放入受控 HTML shell 的初始化脚本文本。
 *
 * @example
 * ```ts
 * import { createThemeBootstrapScript } from '@h-ai/ui'
 * const script = createThemeBootstrapScript({ storageKey: 'demo-theme', defaultThemeId: 'light' })
 * // 在应用 HTML shell 中作为受控脚本使用，避免首屏主题闪烁。
 * ```
 */
export function createThemeBootstrapScript(options: ThemeBootstrapScriptOptions): string {
  const defaultThemeId = normalizeThemeId(options.defaultThemeId ?? DEFAULT_THEME)
  const defaultThemeColor = options.defaultThemeColor == null
    ? null
    : normalizeHexColor(options.defaultThemeColor) ?? DEFAULT_THEME_COLOR
  const locale = options.locale
    ? {
        key: options.locale.key,
        defaultValue: options.locale.defaultValue,
        supportedValues: [...options.locale.supportedValues],
      }
    : null
  const defaultPreferences: Record<string, string> = {
    themeId: defaultThemeId,
  }

  if (defaultThemeColor) {
    defaultPreferences.themeColor = defaultThemeColor
  }

  if (locale) {
    defaultPreferences[locale.key] = locale.defaultValue
  }

  return `(function(){var d=${escapeJsonForScript(defaultPreferences)};var s=${escapeJsonForScript(options.storageKey)};var l=${escapeJsonForScript(options.legacyThemeStorageKey ?? null)};var u=new Set(${escapeJsonForScript(SUPPORTED_THEME_IDS)});var k=new Set(${escapeJsonForScript(DARK_THEMES)});var c=${escapeJsonForScript(options.colorCssVar ?? null)};var y=${escapeJsonForScript(options.toneDatasetKey ?? null)};var i=${escapeJsonForScript(locale)};function n(e){var r=''+(e??'');return u.has(r)?r:d.themeId}function h(e){var r=(''+(e??'')).trim().toLowerCase();if(/^#[0-9a-f]{6}$/i.test(r))return r;if(/^#[0-9a-f]{3}$/i.test(r))return '#'+r[1]+r[1]+r[2]+r[2]+r[3]+r[3];return Object.prototype.hasOwnProperty.call(d,'themeColor')?d.themeColor:null}function g(e){var r={...d,themeId:n(e?.themeId)};if(Object.prototype.hasOwnProperty.call(d,'themeColor'))r.themeColor=h(e?.themeColor);if(i)r[i.key]=i.supportedValues.includes(e?.[i.key])?e[i.key]:d[i.key];return r}function a(e){var r=document.documentElement;var o=k.has(e.themeId)?'dark':'light';r.setAttribute('data-theme',e.themeId);if(y)r.dataset[y]=o;if(c){if(e.themeColor){r.style.setProperty(c,e.themeColor)}else{r.style.removeProperty(c)}}r.style.setProperty('color-scheme',o)}var p=d;try{var f=window.localStorage.getItem(s);if(f){p=g(JSON.parse(f))}else if(l){p=g({themeId:window.localStorage.getItem(l)})}else{p=g(d)}a(p);window.localStorage.setItem(s,JSON.stringify(p));if(l)window.localStorage.removeItem(l)}catch{a(d)}})()`
}

/**
 * 获取主题初始化脚本（用于 HTML shell 防闪烁）
 *
 * 返回值是“脚本标签内的文本内容”，适合宿主在构建阶段或服务端模板中注入。
 * 对于 SvelteKit `app.html`，请直接粘贴这段脚本字符串的内容，不能写 `{@html getThemeInitScript()}`。
 * @returns 使用默认存储约定的主题初始化脚本。
 *
 * @example
 * ```ts
 * import { getThemeInitScript } from '@h-ai/ui'
 * const script = getThemeInitScript()
 * ```
 */
export function getThemeInitScript(): string {
  return createThemeBootstrapScript({
    storageKey: THEME_STORAGE_KEY,
    defaultThemeId: DEFAULT_THEME,
  })
}

/**
 * 应用主题
 * @param theme - 主题 ID
 * @param persist - 是否持久化到 localStorage
 * @returns 无返回值；更新当前文档，并按 persist 决定是否保存偏好。
 *
 * @example
 * ```ts
 * import { applyTheme } from '@h-ai/ui'
 * applyTheme('dark', false)
 * // false 仅更新当前 DOM，不写入持久化偏好。
 * ```
 */
export function applyTheme(theme: string, persist = true): void {
  if (typeof document === 'undefined')
    return

  document.documentElement.setAttribute('data-theme', theme)

  if (persist) {
    writeStoredValue(THEME_STORAGE_KEY, theme)
  }
}

/**
 * 获取当前主题
 * @returns 当前文档主题；无 DOM 时使用默认值。
 *
 * @example
 * ```ts
 * import { getCurrentTheme } from '@h-ai/ui'
 * const theme = getCurrentTheme()
 * ```
 */
export function getCurrentTheme(): string {
  if (typeof document === 'undefined')
    return DEFAULT_THEME
  return document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME
}

/**
 * 获取保存的主题；存储为空或不可用时使用宿主默认主题。
 *
 * @param fallbackTheme - 未保存主题时的默认值，默认 light
 * @returns 安全读取并归一化的主题偏好。
 *
 * @example
 * ```ts
 * import { getSavedTheme } from '@h-ai/ui'
 * const theme = getSavedTheme('light')
 * ```
 */
export function getSavedTheme(fallbackTheme = DEFAULT_THEME): string {
  return readStoredValue(THEME_STORAGE_KEY) ?? fallbackTheme
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
 *
 * @example
 * ```ts
 * import { DAISYUI_THEMES_CONFIG } from '@h-ai/ui'
 * const css = '@plugin "daisyui" { themes: ' + DAISYUI_THEMES_CONFIG + '; }'
 * // 将生成的配置用于构建时 CSS，不在浏览器动态安装主题。
 * ```
 */
export const DAISYUI_THEMES_CONFIG = THEMES.map((t, i) => {
  if (i === 0)
    return `${t.id} --default`
  if (t.id === 'dark')
    return `${t.id} --prefersdark`
  return t.id
}).join(',\n    ')
