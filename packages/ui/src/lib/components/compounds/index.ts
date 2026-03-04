/**
 * @h-ai/ui — 组合组件 (Compounds)
 *
 * 由多个原子组件组合而成的复杂 UI 模式，提供更完整的交互体验。
 * @module index
 */

// 折叠面板
export type { AccordionItem } from './accordion-types.js'
export { default as Accordion } from './Accordion.svelte'
// 移动端操作菜单
export type { ActionSheetItem } from './action-sheet-types.js'
export { default as ActionSheet } from './ActionSheet.svelte'
// 反馈提示
export { default as Alert } from './Alert.svelte'
// 移动端顶部应用栏
export { default as AppBar } from './AppBar.svelte'
// 移动端底部导航栏
export type { BottomNavItem } from './bottom-nav-types.js'
export { default as BottomNav } from './BottomNav.svelte'
// 导航控件
export { default as Breadcrumb } from './Breadcrumb.svelte'
// 日历（Bits UI headless + DaisyUI 样式）
export { default as Calendar } from './Calendar.svelte'
// 数据展示
export { default as Card } from './Card.svelte'
// 可搜索下拉选择（Bits UI headless + DaisyUI 样式）
export { default as Combobox } from './Combobox.svelte'
export { default as Confirm } from './Confirm.svelte'
export { default as DataTable } from './DataTable.svelte'
// 日期选择器（Bits UI headless + DaisyUI 样式）
export { default as DatePicker } from './DatePicker.svelte'
// 弹层容器
export { default as Drawer } from './Drawer.svelte'
export { default as Dropdown } from './Dropdown.svelte'
// 状态占位
export { default as Empty } from './Empty.svelte'
// 表单组合
export { default as Form } from './Form.svelte'
export { default as FormField } from './FormField.svelte'
// 无限滚动 / 上拉加载
export { default as InfiniteScroll } from './InfiniteScroll.svelte'
export { default as Modal } from './Modal.svelte'
// 页面头部
export { default as PageHeader } from './PageHeader.svelte'
export { default as Pagination } from './Pagination.svelte'
export { default as Popover } from './Popover.svelte'
// 下拉刷新
export { default as PullRefresh } from './PullRefresh.svelte'
export { default as Result } from './Result.svelte'
// 安全区域包裹
export { default as SafeArea } from './SafeArea.svelte'
export { default as Skeleton } from './Skeleton.svelte'
export { default as Steps } from './Steps.svelte'
// 滑动操作
export type { SwipeCellAction } from './swipe-cell-types.js'
export { default as SwipeCell } from './SwipeCell.svelte'
export { default as Tabs } from './Tabs.svelte'
export { default as TagInput } from './TagInput.svelte'
// 时间线
export type { TimelineItem } from './timeline-types.js'
export { default as Timeline } from './Timeline.svelte'
// Toast（统一使用 store 驱动模式）
export { default as ToastContainer } from './ToastContainer.svelte'
export { default as Tooltip } from './Tooltip.svelte'
