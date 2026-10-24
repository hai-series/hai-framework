/**
 * @h-ai/ui — 应用级场景组件 (App Scenes)
 *
 * 面向应用层的通用功能组件，包含设置、反馈、语言/主题切换等。 内置中英日文翻译，自动响应全局 locale。
 * @module index
 */

export type { FeedbackAnnotation, FeedbackAttachmentView, FeedbackEvidenceQuery, FeedbackEvidenceSummary, FeedbackEvidenceView, FeedbackFormData, FeedbackHistoryView, FeedbackListQuery, FeedbackPage, FeedbackPermissions, FeedbackReceipt, FeedbackReportView, FeedbackStatus, FeedbackStatusChange } from './feedback-types.js'
export { default as FeedbackDetail } from './FeedbackDetail.svelte'
export { default as FeedbackForm } from './FeedbackForm.svelte'
export { default as FeedbackList } from './FeedbackList.svelte'
export { default as FeedbackModal } from './FeedbackModal.svelte'
export { default as LanguageSwitch } from './LanguageSwitch.svelte'
export { default as SettingsLayout } from './SettingsLayout.svelte'
export { default as SettingsModal } from './SettingsModal.svelte'
export { default as ThemeColorPicker } from './ThemeColorPicker.svelte'
export { default as ThemeSelector } from './ThemeSelector.svelte'
export { default as ThemeToggle } from './ThemeToggle.svelte'
