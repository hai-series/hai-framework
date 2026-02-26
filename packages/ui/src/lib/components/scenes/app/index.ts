/**
 * =============================================================================
 * @h-ai/ui - 应用级场景组件 (App Scenes)
 * =============================================================================
 *
 * 面向应用层的通用功能组件，包含设置、反馈、语言/主题切换等。
 * 内置中英文翻译，自动响应全局 locale。
 *
 * 包含：
 * - FeedbackModal - 用户反馈模态框
 * - SettingsModal - 应用设置模态框（语言 + 主题）
 * - LanguageSwitch - 语言切换下拉组件
 * - ThemeSelector - 主题选择器（完整主题列表）
 * - ThemeToggle - 明/暗主题快速切换
 * =============================================================================
 */

export { default as FeedbackModal } from './FeedbackModal.svelte'
export { default as LanguageSwitch } from './LanguageSwitch.svelte'
export { default as SettingsModal } from './SettingsModal.svelte'
export { default as ThemeSelector } from './ThemeSelector.svelte'
export { default as ThemeToggle } from './ThemeToggle.svelte'
