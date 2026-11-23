import { applyTheme, createThemeBootstrapScript, getCurrentTheme, getSavedTheme, getThemeInfo, getThemeInitScript, isDarkTheme, normalizeHexColor, normalizeThemeId, resolveThemeTone } from './theme-config.js'

export { DAISYUI_THEMES_CONFIG, DARK_THEMES, DEFAULT_THEME, DEFAULT_THEME_COLOR, DEFAULT_THEME_COLOR_CSS_VAR, SUPPORTED_THEME_IDS, THEME_COLOR_PRESETS, THEME_GROUPS, THEME_STORAGE_KEY, THEMES } from './theme-config.js'
export type { ThemeBootstrapLocaleConfig, ThemeBootstrapScriptOptions, ThemeColorPreset, ThemeGroup, ThemeInfo } from './theme-config.js'

/**
 * UI theme 子路径的运行入口。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/theme'
 *
 * // 规范化主题标识，未知值采用框架回退主题。
 * const theme = ui.normalizeThemeId('light')
 * void theme
 * ```
 */
export const ui = {
  getThemeInfo,
  isDarkTheme,
  normalizeThemeId,
  normalizeHexColor,
  resolveThemeTone,
  createThemeBootstrapScript,
  getThemeInitScript,
  applyTheme,
  getCurrentTheme,
  getSavedTheme,
}
