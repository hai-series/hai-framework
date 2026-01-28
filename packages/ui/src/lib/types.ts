/**
 * =============================================================================
 * @hai/ui - 类型定义
 * =============================================================================
 * UI 组件相关类型
 * =============================================================================
 */

import type { Snippet } from 'svelte'

/**
 * 基础变体类型
 */
export type Variant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

/**
 * 尺寸类型
 */
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * 位置类型
 */
export type Position = 'top' | 'right' | 'bottom' | 'left'

/**
 * 对齐类型
 */
export type Alignment = 'start' | 'center' | 'end'

/**
 * 按钮属性
 */
export interface ButtonProps {
  /** 变体 */
  variant?: Variant
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否加载中 */
  loading?: boolean
  /** 是否为轮廓样式 */
  outline?: boolean
  /** 是否为圆形 */
  circle?: boolean
  /** 自定义类名 */
  class?: string
  /** 按钮类型 */
  type?: 'button' | 'submit' | 'reset'
  /** 点击事件 */
  onclick?: (e: MouseEvent) => void
  /** 子内容 */
  children?: Snippet
}

/**
 * 输入框属性
 */
export interface InputProps {
  /** 值 */
  value?: string
  /** 占位符 */
  placeholder?: string
  /** 类型 */
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search'
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 是否必填 */
  required?: boolean
  /** 错误消息 */
  error?: string
  /** 自定义类名 */
  class?: string
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 变化事件 */
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
}

/**
 * 文本域属性
 */
export interface TextareaProps {
  /** 值 */
  value?: string
  /** 占位符 */
  placeholder?: string
  /** 行数 */
  rows?: number
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 是否必填 */
  required?: boolean
  /** 是否自动调整高度 */
  autoResize?: boolean
  /** 错误消息 */
  error?: string
  /** 自定义类名 */
  class?: string
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void
}

/**
 * 选择框选项
 */
export interface SelectOption<T = string> {
  /** 值 */
  value: T
  /** 显示文本 */
  label: string
  /** 是否禁用 */
  disabled?: boolean
}

/**
 * 选择框属性
 */
export interface SelectProps<T = string> {
  /** 值 */
  value?: T
  /** 选项 */
  options: SelectOption<T>[]
  /** 占位符 */
  placeholder?: string
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否必填 */
  required?: boolean
  /** 错误消息 */
  error?: string
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (value: T) => void
}

/**
 * 复选框属性
 */
export interface CheckboxProps {
  /** 是否选中 */
  checked?: boolean
  /** 标签 */
  label?: string
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否不确定状态 */
  indeterminate?: boolean
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (checked: boolean) => void
}

/**
 * 开关属性
 */
export interface SwitchProps {
  /** 是否开启 */
  checked?: boolean
  /** 标签 */
  label?: string
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (checked: boolean) => void
}

/**
 * 单选框属性
 */
export interface RadioProps<T = string> {
  /** 值 */
  value?: T
  /** 选项 */
  options: SelectOption<T>[]
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 方向 */
  direction?: 'horizontal' | 'vertical'
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (value: T) => void
}

/**
 * 徽章属性
 */
export interface BadgeProps {
  /** 变体 */
  variant?: Variant
  /** 尺寸 */
  size?: Size
  /** 是否为轮廓样式 */
  outline?: boolean
  /** 自定义类名 */
  class?: string
  /** 子内容 */
  children?: Snippet
}

/**
 * 卡片属性
 */
export interface CardProps {
  /** 标题 */
  title?: string
  /** 是否有边框 */
  bordered?: boolean
  /** 是否有阴影 */
  shadow?: boolean | 'sm' | 'md' | 'lg'
  /** 内边距 */
  padding?: Size | 'none'
  /** 自定义类名 */
  class?: string
  /** 标题插槽 */
  header?: Snippet
  /** 底部插槽 */
  footer?: Snippet
  /** 内容插槽 */
  children?: Snippet
}

/**
 * 模态框属性
 */
export interface ModalProps {
  /** 是否打开 */
  open?: boolean
  /** 标题 */
  title?: string
  /** 尺寸 */
  size?: Size | 'full'
  /** 是否可通过点击遮罩关闭 */
  closeOnBackdrop?: boolean
  /** 是否可通过 ESC 键关闭 */
  closeOnEscape?: boolean
  /** 是否显示关闭按钮 */
  showClose?: boolean
  /** 自定义类名 */
  class?: string
  /** 关闭事件 */
  onclose?: () => void
  /** 标题插槽 */
  header?: Snippet
  /** 底部插槽 */
  footer?: Snippet
  /** 内容插槽 */
  children?: Snippet
}

/**
 * 抽屉属性
 */
export interface DrawerProps {
  /** 是否打开 */
  open?: boolean
  /** 标题 */
  title?: string
  /** 位置 */
  position?: Position
  /** 尺寸 */
  size?: Size
  /** 是否可通过点击遮罩关闭 */
  closeOnBackdrop?: boolean
  /** 是否显示关闭按钮 */
  showClose?: boolean
  /** 自定义类名 */
  class?: string
  /** 关闭事件 */
  onclose?: () => void
  /** 内容插槽 */
  children?: Snippet
}

/**
 * 提示框属性
 */
export interface TooltipProps {
  /** 提示内容 */
  content: string
  /** 位置 */
  position?: Position
  /** 延迟显示 (ms) */
  delay?: number
  /** 自定义类名 */
  class?: string
  /** 触发元素插槽 */
  children?: Snippet
}

/**
 * 加载属性
 */
export interface SpinnerProps {
  /** 尺寸 */
  size?: Size
  /** 变体 */
  variant?: Variant
  /** 自定义类名 */
  class?: string
}

/**
 * 进度条属性
 */
export interface ProgressProps {
  /** 值 (0-100) */
  value: number
  /** 最大值 */
  max?: number
  /** 尺寸 */
  size?: Size
  /** 变体 */
  variant?: Variant
  /** 是否显示标签 */
  showLabel?: boolean
  /** 是否有条纹 */
  striped?: boolean
  /** 是否动画 */
  animated?: boolean
  /** 自定义类名 */
  class?: string
}

/**
 * 警告框属性
 */
export interface AlertProps {
  /** 变体 */
  variant?: Variant
  /** 标题 */
  title?: string
  /** 是否可关闭 */
  dismissible?: boolean
  /** 自定义类名 */
  class?: string
  /** 关闭事件 */
  onclose?: () => void
  /** 内容插槽 */
  children?: Snippet
}

/**
 * Toast 属性
 */
export interface ToastProps {
  /** 消息 */
  message: string
  /** 变体 */
  variant?: Variant
  /** 持续时间 (ms)，0 为不自动关闭 */
  duration?: number
  /** 位置 */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
  /** 是否可关闭 */
  dismissible?: boolean
  /** 关闭事件 */
  onclose?: () => void
}

/**
 * 表格列定义
 */
export interface TableColumn<T = unknown> {
  /** 列 key */
  key: string
  /** 列标题 */
  title: string
  /** 宽度 */
  width?: string | number
  /** 对齐方式 */
  align?: Alignment
  /** 是否可排序 */
  sortable?: boolean
  /** 自定义渲染 */
  render?: (row: T, index: number) => string
}

/**
 * 表格属性
 */
export interface TableProps<T = unknown> {
  /** 数据 */
  data: T[]
  /** 列定义 */
  columns: TableColumn<T>[]
  /** 是否有边框 */
  bordered?: boolean
  /** 是否有条纹 */
  striped?: boolean
  /** 是否有悬停效果 */
  hoverable?: boolean
  /** 是否紧凑 */
  compact?: boolean
  /** 是否加载中 */
  loading?: boolean
  /** 自定义类名 */
  class?: string
}

/**
 * 分页属性
 */
export interface PaginationProps {
  /** 当前页 */
  page: number
  /** 总数 */
  total: number
  /** 每页数量 */
  pageSize?: number
  /** 尺寸 */
  size?: Size
  /** 是否显示总数 */
  showTotal?: boolean
  /** 是否显示跳转 */
  showJumper?: boolean
  /** 自定义类名 */
  class?: string
  /** 页码变化事件 */
  onchange?: (page: number) => void
}

/**
 * 面包屑项
 */
export interface BreadcrumbItem {
  /** 显示文本 */
  label: string
  /** 链接 */
  href?: string
  /** 图标 */
  icon?: string
}

/**
 * 面包屑属性
 */
export interface BreadcrumbProps {
  /** 项目 */
  items: BreadcrumbItem[]
  /** 分隔符 */
  separator?: string
  /** 自定义类名 */
  class?: string
}

/**
 * 标签页项
 */
export interface TabItem {
  /** 唯一标识 */
  key: string
  /** 标签 */
  label: string
  /** 是否禁用 */
  disabled?: boolean
  /** 图标 */
  icon?: string
}

/**
 * 标签页属性
 */
export interface TabsProps {
  /** 标签项 */
  items: TabItem[]
  /** 当前激活的标签 */
  active?: string
  /** 尺寸 */
  size?: Size
  /** 样式类型 */
  type?: 'line' | 'card' | 'pills'
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (key: string) => void
  /** 内容插槽 */
  children?: Snippet
}

/**
 * 头像属性
 */
export interface AvatarProps {
  /** 图片地址 */
  src?: string
  /** 替代文本 */
  alt?: string
  /** 名称（用于生成首字母） */
  name?: string
  /** 尺寸 */
  size?: Size | number
  /** 形状 */
  shape?: 'circle' | 'square'
  /** 自定义类名 */
  class?: string
}

/**
 * 下拉菜单项
 */
export interface DropdownItem {
  /** 唯一标识 */
  key: string
  /** 显示文本 */
  label: string
  /** 图标 */
  icon?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否为分隔线 */
  divider?: boolean
}

/**
 * 下拉菜单属性
 */
export interface DropdownProps {
  /** 菜单项 */
  items: DropdownItem[]
  /** 触发方式 */
  trigger?: 'click' | 'hover'
  /** 位置 */
  position?: Position
  /** 对齐 */
  align?: Alignment
  /** 自定义类名 */
  class?: string
  /** 选择事件 */
  onselect?: (key: string) => void
  /** 触发元素插槽 */
  children?: Snippet
}
