/**
 * =============================================================================
 * @hai/ui - 组合组件 (Compounds)
 * =============================================================================
 *
 * 由多个原子组件组合而成的复杂 UI 模式，提供更完整的交互体验。
 *
 * 包含：
 * - Form, FormField, TagInput, MultiSelect - 表单组合
 * - Alert, Toast, ToastContainer - 反馈提示
 * - Modal, Drawer, Confirm, Popover - 弹层容器
 * - Card, Table, DataTable - 数据展示
 * - Tabs, Pagination, Breadcrumb, Steps, Timeline - 导航控件
 * - Dropdown, Tooltip, Accordion - 悬浮/折叠交互
 * - Skeleton, Empty, Result - 状态占位
 * - PageHeader, ScoreBar, SeverityBadge - 业务展示
 * - FeedbackModal, SettingsModal, LanguageSwitch, ThemeToggle, ThemeSelector - 应用级组件
 * =============================================================================
 */

// 折叠面板
export { default as Accordion } from './Accordion.svelte'
export type { AccordionItem } from './Accordion.svelte'
// 反馈提示
export { default as Alert } from './Alert.svelte'
export { default as Breadcrumb } from './Breadcrumb.svelte'
// 数据展示
export { default as Card } from './Card.svelte'
export { default as Confirm } from './Confirm.svelte'

export { default as DataTable } from './DataTable.svelte'
export { default as Drawer } from './Drawer.svelte'
// 悬浮交互
export { default as Dropdown } from './Dropdown.svelte'

export { default as Empty } from './Empty.svelte'
// 应用级组件
export { default as FeedbackModal } from './FeedbackModal.svelte'
// 表单组合
export { default as Form } from './Form.svelte'
export { default as FormField } from './FormField.svelte'

export { default as LanguageSwitch } from './LanguageSwitch.svelte'
// 弹层容器
export { default as Modal } from './Modal.svelte'
export { default as MultiSelect } from './MultiSelect.svelte'

// 业务展示
export { default as PageHeader } from './PageHeader.svelte'
export { default as Pagination } from './Pagination.svelte'
export { default as Popover } from './Popover.svelte'
export { default as Result } from './Result.svelte'

export { default as ScoreBar } from './ScoreBar.svelte'
export { default as SettingsModal } from './SettingsModal.svelte'

export { default as SeverityBadge } from './SeverityBadge.svelte'
// 状态占位
export { default as Skeleton } from './Skeleton.svelte'
export { default as Steps } from './Steps.svelte'

export { default as Table } from './Table.svelte'
// 导航控件
export { default as Tabs } from './Tabs.svelte'
export { default as TagInput } from './TagInput.svelte'

export { default as ThemeSelector } from './ThemeSelector.svelte'
export { default as ThemeToggle } from './ThemeToggle.svelte'
// 时间线
export { default as Timeline } from './Timeline.svelte'
export type { TimelineItem } from './Timeline.svelte'
export { default as Toast } from './Toast.svelte'
export { default as ToastContainer } from './ToastContainer.svelte'
export { default as Tooltip } from './Tooltip.svelte'
