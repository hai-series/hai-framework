/**
 * @h-ai/ui — 主入口
 *
 * UI 组件库，提供: - 基于 Svelte 5 Runes 的组件 - DaisyUI 风格 + Bits UI headless 交互 - 完整的类型定义
 * @module index
 */

// ─── 组件导出（从 components/ 统一导出所有三层组件及其类型） ───

export * from './components/index.js'

// ─── i18n 国际化（Paraglide 辅助工具） ───

export * from './i18n.svelte.js'

// ─── 主题配置 ───

export * from './theme-config.js'

// ─── Toast 状态管理 ───

export * from './toast.svelte.js'

// ─── 平台检测与移动端工具 ───

export * from './types.js'

// ─── 基础类型与工具 ───

export * from './utils.js'
export { detectPlatform, isMobile, isNativeApp, type Platform, usePlatform } from './utils/platform.svelte.js'
