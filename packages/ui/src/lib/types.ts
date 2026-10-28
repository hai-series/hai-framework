/**
 * @h-ai/ui — 类型定义
 *
 * UI 组件相关类型
 * @module types
 */

import type { Snippet } from 'svelte'

/**
 * 可转发到组件根节点或主交互节点的 data-* 属性。
 *
 * @example
 * ```ts
 * import type { DataAttributeValue } from '@h-ai/ui'
 * const example: DataAttributeValue = 'profile-save'
 * ```
 */
export type DataAttributeValue = string | number | boolean | null | undefined

/**
 * 可转发到 DOM 的 data-* 字段集合；null/undefined 在转发时被忽略。
 *
 * @example
 * ```ts
 * import type { DataAttributes } from '@h-ai/ui'
 * const example: DataAttributes = { 'data-testid': 'profile-save', 'data-loading': false }
 * ```
 */
export interface DataAttributes {
  [key: `data-${string}`]: DataAttributeValue
}

export type { ChartDataItem, ChartProps, ChartSeries, ChartSize, ChartType } from './components/scenes/charts/chart-types.js'

/**
 * 基础变体类型
 *
 * @example
 * ```ts
 * import type { Variant } from '@h-ai/ui'
 * const example: Variant = 'primary'
 * ```
 */
export type Variant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'ghost' | 'link' | 'outline'

/**
 * 尺寸类型
 *
 * @example
 * ```ts
 * import type { Size } from '@h-ai/ui'
 * const example: Size = 'lg'
 * ```
 */
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'

/**
 * 位置类型
 *
 * @example
 * ```ts
 * import type { Position } from '@h-ai/ui'
 * const example: Position = 'right'
 * ```
 */
export type Position = 'top' | 'right' | 'bottom' | 'left'

/**
 * 对齐类型
 *
 * @example
 * ```ts
 * import type { Alignment } from '@h-ai/ui'
 * const example: Alignment = 'end'
 * ```
 */
export type Alignment = 'start' | 'center' | 'end'

/**
 * 按钮属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Button } from '@h-ai/ui'
 *   import type { ButtonProps } from '@h-ai/ui'
 *   const props: ButtonProps = { variant: 'primary', type: 'submit' }
 * </script>
 * <Button {...props}>保存</Button>
 * ```
 */
export interface ButtonProps extends DataAttributes {
  /** 变体 */
  variant?: Variant
  /** 尺寸 */
  size?: Size
  /** 关联表单 ID */
  form?: string
  /** 自定义类名 */
  class?: string
  /** aria-label（无障碍标签） */
  ariaLabel?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否加载中 */
  loading?: boolean
  /** 是否为轮廓样式 */
  outline?: boolean
  /** 是否为圆形 */
  circle?: boolean
  /** 按钮类型 */
  type?: 'button' | 'submit' | 'reset'
  /** type=submit 时显示原生表单 Enter 提示；不注册全局快捷键。 */
  submitHint?: boolean
  /** 点击事件 */
  onclick?: (e: MouseEvent) => void
  /** 子内容 */
  children?: Snippet
}

/**
 * 无样式按钮属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { BareButton } from '@h-ai/ui'
 *   import type { BareButtonProps } from '@h-ai/ui'
 *   const props: BareButtonProps = { type: 'button', ariaLabel: '关闭' }
 * </script>
 * <BareButton {...props}>关闭</BareButton>
 * ```
 */
export interface BareButtonProps extends DataAttributes {
  /** 按钮类型 */
  type?: 'button' | 'submit' | 'reset'
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义类名 */
  class?: string
  /** aria-label（无障碍标签） */
  ariaLabel?: string
  /** 角色（用于特殊交互） */
  role?: string
  /** aria-selected（用于 option/tab 等） */
  ariaSelected?: boolean
  /** tabindex */
  tabindex?: number
  /** 点击事件 */
  onclick?: (e: MouseEvent) => void
  /** 键盘事件 */
  onkeydown?: (e: KeyboardEvent) => void
  /** 子内容 */
  children?: Snippet
}

/**
 * 输入框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Input } from '@h-ai/ui'
 *   import type { InputProps } from '@h-ai/ui'
 *   const props: InputProps = { name: 'email', type: 'email', required: true }
 * </script>
 * <Input {...props} />
 * ```
 */
export interface InputProps extends DataAttributes {
  /** 值 */
  value?: string
  /** 占位符 */
  placeholder?: string
  /** 类型；datetime-local 使用浏览器本地时区，服务层应转换为明确的时间戳。 */
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'datetime-local'
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 是否必填 */
  required?: boolean
  /** 错误消息 */
  error?: FormText
  /** 自定义验证消息（用于覆盖浏览器原生验证提示） */
  validationMessage?: FormText
  /** 自定义类名 */
  class?: string
  /** 元素 ID */
  id?: string
  /** input 引用 */
  inputRef?: HTMLInputElement
  /** 表单字段名 */
  name?: string
  /** 自动完成 */
  autocomplete?: string
  /** 输入模式验证（正则表达式） */
  pattern?: string
  /** 关联的 datalist id */
  list?: string
  /** 输入模式（移动端键盘） */
  inputmode?: 'text' | 'search' | 'none' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal'
  /** 最小长度 */
  minlength?: number
  /** 最大长度 */
  maxlength?: number
  /** 最小值（针对 number 类型） */
  min?: number
  /** 最大值（针对 number 类型） */
  max?: number
  /** 步进值（number 类型） */
  step?: number
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 变化事件 */
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 键盘事件 */
  onkeydown?: (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => void
  /** 失去焦点事件 */
  onblur?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  /** 获得焦点事件 */
  onfocus?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  /** 失效事件（表单验证失败） */
  oninvalid?: (e: Event & { currentTarget: HTMLInputElement }) => void
}

/**
 * 无样式输入框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { BareInput } from '@h-ai/ui'
 *   import type { BareInputProps } from '@h-ai/ui'
 *   const props: BareInputProps = { name: 'query', type: 'search' }
 * </script>
 * <BareInput {...props} />
 * ```
 */
export interface BareInputProps extends DataAttributes {
  /** 文本值；file 类型通过事件读取 files，不绑定文件路径。 */
  value?: string
  /** 占位符 */
  placeholder?: string
  /** 类型 */
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'file' | 'range'
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 是否必填 */
  required?: boolean
  /** 自定义类名 */
  class?: string
  /** 角色 */
  role?: string
  /** aria-expanded */
  ariaExpanded?: boolean
  /** aria-controls */
  ariaControls?: string
  /** aria-autocomplete */
  ariaAutocomplete?: 'none' | 'list' | 'inline' | 'both'
  /** 字段校验状态 */
  ariaInvalid?: boolean
  /** 字段提示/错误元素 ID */
  ariaDescribedby?: string
  /** 元素 ID */
  id?: string
  /** input 引用 */
  inputRef?: HTMLInputElement
  /** 表单字段名 */
  name?: string
  /** 自动完成 */
  autocomplete?: string
  /** 输入模式验证（正则表达式） */
  pattern?: string
  /** 关联的 datalist id */
  list?: string
  /** 文件类型限制（file 类型） */
  accept?: string
  /** 是否允许多选（file 类型） */
  multiple?: boolean
  /** 最小长度 */
  minlength?: number
  /** 最大长度 */
  maxlength?: number
  /** 最小值（针对 number 类型） */
  min?: number
  /** 最大值（针对 number 类型） */
  max?: number
  /** 步进值（number 类型） */
  step?: number
  /** 禁用软键盘（移动端） */
  inputmode?: 'text' | 'search' | 'none' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal'
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 变化事件 */
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 键盘事件 */
  onkeydown?: (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => void
  /** 失去焦点事件 */
  onblur?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  /** 获得焦点事件 */
  onfocus?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  /** 失效事件（表单验证失败） */
  oninvalid?: (e: Event & { currentTarget: HTMLInputElement }) => void
}

/**
 * 文本域属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Textarea } from '@h-ai/ui'
 *   import type { TextareaProps } from '@h-ai/ui'
 *   const props: TextareaProps = { name: 'description', rows: 4, maxlength: 500 }
 * </script>
 * <Textarea {...props} />
 * ```
 */
export interface TextareaProps extends DataAttributes {
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
  inputmode?: InputProps['inputmode']
  error?: FormText
  /** 自定义验证消息（用于覆盖浏览器原生验证提示） */
  validationMessage?: FormText
  /** 最小长度 */
  minlength?: number
  /** 最大长度 */
  maxlength?: number
  /** 原生控件引用 */
  textareaRef?: HTMLTextAreaElement
  oninvalid?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void
  /** 自定义类名 */
  class?: string
  /** 元素 ID */
  id?: string
  /** 表单字段名 */
  name?: string
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void
}

/**
 * 选择框选项
 * @typeParam T - 字段值或资源条目的数据类型。
 *
 * @example
 * ```ts
 * import type { SelectOption } from '@h-ai/ui'
 * const example: SelectOption = { value: 'active', label: '启用' }
 * ```
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
 * @typeParam T - 字段值或资源条目的数据类型。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Select } from '@h-ai/ui'
 *   import type { SelectProps } from '@h-ai/ui'
 *   const props: SelectProps = { options: [{ value: 'active', label: '启用' }], value: 'active' }
 * </script>
 * <Select {...props} />
 * ```
 */
export interface SelectProps<T = string> extends DataAttributes {
  /** 值 */
  value?: T
  /** 选项 */
  options?: SelectOption<T>[]
  /** 占位符 */
  placeholder?: string
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否必填 */
  required?: boolean
  /** 是否可清空 */
  clearable?: boolean
  /** 是否可筛选（启用后可在输入框内输入过滤选项） */
  filterable?: boolean
  /** 错误消息 */
  error?: FormText
  /** 自定义验证提示，仅在校验失败时显示。 */
  validationMessage?: FormText
  /** 表单字段名 */
  name?: string
  /** 自定义类名 */
  class?: string
  /** 元素 ID */
  id?: string
  /** 变化事件 */
  onchange?: (value: T) => void
}

/**
 * 复选框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Checkbox } from '@h-ai/ui'
 *   import type { CheckboxProps } from '@h-ai/ui'
 *   const props: CheckboxProps = { label: '同意条款', checked: true }
 * </script>
 * <Checkbox {...props} />
 * ```
 */
export interface CheckboxProps extends DataAttributes {
  /** 元素 ID；用于 FormField 标签关联。 */
  id?: string
  /** 是否选中 */
  checked?: boolean
  /** 标签 */
  label?: string
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 是否不确定状态 */
  indeterminate?: boolean
  /** 自定义类名 */
  class?: string
  /** 变化事件 - 传递选中状态 */
  onchange?: (checked: boolean) => void
}

/**
 * 开关属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Switch } from '@h-ai/ui'
 *   import type { SwitchProps } from '@h-ai/ui'
 *   const props: SwitchProps = { label: '开启通知', checked: true }
 * </script>
 * <Switch {...props} />
 * ```
 */
export interface SwitchProps extends DataAttributes {
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
 * 原生开关输入（用于折叠/抽屉等结构要求 input 直系子元素的场景）
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ToggleCheckbox } from '@h-ai/ui'
 *   import type { ToggleCheckboxProps } from '@h-ai/ui'
 *   const props: ToggleCheckboxProps = { name: 'expanded', checked: true }
 * </script>
 * <ToggleCheckbox {...props} />
 * ```
 */
export interface ToggleCheckboxProps extends DataAttributes {
  /** 是否选中 */
  checked?: boolean
  /** 表单字段名称 */
  name?: string
  /** 元素 ID */
  id?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (checked: boolean) => void
}

/**
 * 用于手风琴等结构的原生单选控件属性；同一 name 的选项互斥。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ToggleRadio } from '@h-ai/ui'
 *   import type { ToggleRadioProps } from '@h-ai/ui'
 *   const props: ToggleRadioProps = { name: 'section', checked: true }
 * </script>
 * <ToggleRadio {...props} />
 * ```
 */
export interface ToggleRadioProps extends DataAttributes {
  /** 是否选中 */
  checked?: boolean
  /** 表单字段名称 */
  name?: string
  /** 元素 ID */
  id?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (checked: boolean) => void
}

/**
 * 单选框属性
 * @typeParam T - 字段值或资源条目的数据类型。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Radio } from '@h-ai/ui'
 *   import type { RadioProps } from '@h-ai/ui'
 *   const props: RadioProps = { options: [{ value: 'email', label: '邮件' }], value: 'email' }
 * </script>
 * <Radio {...props} />
 * ```
 */
export interface RadioProps<T = string> extends DataAttributes {
  /** 值 */
  value?: T
  /** 选项 */
  options: SelectOption<T>[]
  /** 表单字段名称 */
  name?: string
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Badge } from '@h-ai/ui'
 *   import type { BadgeProps } from '@h-ai/ui'
 *   const props: BadgeProps = { variant: 'success' }
 * </script>
 * <Badge {...props}>已启用</Badge>
 * ```
 */
export interface BadgeProps extends DataAttributes {
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Card } from '@h-ai/ui'
 *   import type { CardProps } from '@h-ai/ui'
 *   const props: CardProps = { title: '个人资料', bordered: true }
 * </script>
 * <Card {...props}>资料内容</Card>
 * ```
 */
export interface CardProps extends DataAttributes {
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Modal } from '@h-ai/ui'
 *   import type { ModalProps } from '@h-ai/ui'
 *   const props: ModalProps = { open: true, title: '编辑资料', closeOnBackdrop: false }
 * </script>
 * <Modal {...props}>表单内容</Modal>
 * ```
 */
export interface ModalProps extends DataAttributes {
  /** 是否打开 */
  open?: boolean
  /** 标题 */
  title?: string
  /** 尺寸 */
  size?: Size | 'full'
  /** 面板圆角（任意合法 CSS border-radius 值，默认 1rem） */
  radius?: string
  /** 是否可通过点击遮罩关闭 */
  closeOnBackdrop?: boolean
  /** 是否可通过 ESC 键关闭 */
  closeOnEscape?: boolean
  /** 是否显示关闭按钮 */
  showClose?: boolean
  /** 自定义宽度（任意合法 CSS 宽度值） */
  width?: string
  /** 自定义高度（任意合法 CSS 高度值） */
  height?: string
  /** 主体区域溢出策略。默认 auto，适合长内容；visible 适合内部浮层需要越界显示的场景。 */
  bodyOverflow?: 'auto' | 'visible' | 'hidden'
  /** 主体区域自定义类名 */
  bodyClass?: string
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Drawer } from '@h-ai/ui'
 *   import type { DrawerProps } from '@h-ai/ui'
 *   const props: DrawerProps = { open: true, title: '详情', position: 'right', width: '28rem' }
 * </script>
 * <Drawer {...props}>详情内容</Drawer>
 * ```
 */
export interface DrawerProps extends DataAttributes {
  /** 是否打开 */
  open?: boolean
  /** 标题 */
  title?: string
  /** 位置 */
  position?: Position
  /** 尺寸 */
  size?: Size
  /** 自定义宽度（任意合法 CSS 宽度值，优先级高于 size 预设） */
  width?: string
  /** 是否允许拖动抽屉边缘调整宽度；仅 left/right 位置生效 */
  resizable?: boolean
  /** 宽度持久化 key；设置后会从 localStorage 恢复并记忆拖动后的像素宽度 */
  widthStorageKey?: string
  /** 是否可通过点击遮罩关闭 */
  closeOnBackdrop?: boolean
  /** 是否允许 Esc 关闭；提交期间可显式关闭。 */
  closeOnEscape?: boolean
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Tooltip } from '@h-ai/ui'
 *   import type { TooltipProps } from '@h-ai/ui'
 *   const props: TooltipProps = { content: '复制链接', position: 'top' }
 * </script>
 * <Tooltip {...props}><span>复制</span></Tooltip>
 * ```
 */
export interface TooltipProps extends DataAttributes {
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
  /**
   * 启用 portal 模式：提示内容通过 document.body 渲染，
   * 不受父容器 overflow 裁剪。适用于表格、滚动容器等场景。
   */
  portal?: boolean
}

/**
 * 加载属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Spinner } from '@h-ai/ui'
 *   import type { SpinnerProps } from '@h-ai/ui'
 *   const props: SpinnerProps = { size: 'sm', variant: 'primary' }
 * </script>
 * <Spinner {...props} />
 * ```
 */
export interface SpinnerProps extends DataAttributes {
  /** 尺寸 */
  size?: Size
  /** 变体 */
  variant?: Variant
  /** 自定义类名 */
  class?: string
}

/**
 * 进度条属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Progress } from '@h-ai/ui'
 *   import type { ProgressProps } from '@h-ai/ui'
 *   const props: ProgressProps = { value: 65, max: 100, showLabel: true }
 * </script>
 * <Progress {...props} />
 * ```
 */
export interface ProgressProps extends DataAttributes {
  /** 当前进度值，按 max 解释；max 默认 100。 */
  value: number
  /** 最大值 */
  max?: number
  /** 步进值（number 类型） */
  step?: number
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Alert } from '@h-ai/ui'
 *   import type { AlertProps } from '@h-ai/ui'
 *   const props: AlertProps = { title: '保存成功', variant: 'success' }
 * </script>
 * <Alert {...props}>操作已经完成。</Alert>
 * ```
 */
export interface AlertProps extends DataAttributes {
  /** 持续信息的变体；警告和错误统一使用 toast / ToastContainer。 */
  variant?: 'info' | 'success'
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
 *
 * @example
 * ```ts
 * import { toast } from '@h-ai/ui'
 * import type { ToastProps } from '@h-ai/ui'
 * const options: ToastProps = { message: '保存完成', variant: 'success', duration: 3000 }
 * const id = toast.add(options)
 * toast.remove(id)
 * ```
 */
export interface ToastProps extends DataAttributes {
  /** 消息 */
  message: string
  /** 问题追踪编号；默认隐藏，用户展开排查信息后可查看和复制，不传入敏感信息。 */
  traceId?: string
  /** 变体 */
  variant?: Variant
  /** 展示后的持续时间 (ms)，默认 3000；排队、悬停、聚焦或展开排查信息时暂停，0 为不自动关闭 */
  duration?: number
  /** 浮动位置，默认 bottom-right；多个提示按加入顺序逐条显示 */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
  /** 是否可关闭 */
  dismissible?: boolean
  /** 关闭事件 */
  onclose?: () => void
}

/**
 * 分页属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Pagination } from '@h-ai/ui'
 *   import type { PaginationProps } from '@h-ai/ui'
 *   const props: PaginationProps = { page: 1, total: 42, pageSize: 10 }
 * </script>
 * <Pagination {...props} />
 * ```
 */
export interface PaginationProps extends DataAttributes {
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
  /** 是否显示每页条数选择器 */
  showSizeChanger?: boolean
  /** 是否显示页码信息文案（如「第 1 / 5 页」，默认 true；紧凑视图可关闭） */
  showPageInfo?: boolean
  /** 是否显示首页 / 末页跳转按钮（默认 true；紧凑视图可仅保留上一页 / 下一页） */
  showFirstLast?: boolean
  /** 每页条数候选项（配合 showSizeChanger，默认 [10, 20, 50, 100]） */
  pageSizeOptions?: number[]
  /** i18n 文案配置 */
  labels?: {
    /** 总数文案，{count} 会被替换为实际数字 */
    total?: string
    /** 跳转到 */
    jumpTo?: string
    /** 页 */
    page?: string
    /** 每页条数文案，{size} 会被替换为实际数字 */
    pageSize?: string
    /** 每页条数前缀文案（如「每页」/「Rows per page」） */
    rowsPerPage?: string
    /** 页码信息文案，{page} / {total} 会被替换（如「第 {page} / {total} 页」） */
    pageInfo?: string
  }
  /** 自定义类名 */
  class?: string
  /** 页码变化事件 */
  onchange?: (page: number) => void
  /** 每页条数变化事件 */
  onpagesizechange?: (pageSize: number) => void
}

/**
 * 面包屑项
 *
 * @example
 * ```ts
 * import type { BreadcrumbItem } from '@h-ai/ui'
 * const example: BreadcrumbItem = { label: '设置', href: '/settings' }
 * ```
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Breadcrumb } from '@h-ai/ui'
 *   import type { BreadcrumbProps } from '@h-ai/ui'
 *   const props: BreadcrumbProps = { items: [{ label: '首页', href: '/' }, { label: '设置' }] }
 * </script>
 * <Breadcrumb {...props} />
 * ```
 */
export interface BreadcrumbProps extends DataAttributes {
  /** 项目 */
  items: BreadcrumbItem[]
  /** 分隔符 */
  separator?: string
  /** 自定义类名 */
  class?: string
}

/**
 * 标签页项
 *
 * @example
 * ```ts
 * import type { TabItem } from '@h-ai/ui'
 * const example: TabItem = { key: 'security', label: '安全' }
 * ```
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
 * 标签页内容上下文
 *
 * 传给 `Tabs` 的 `children` 插槽，支持惰性挂载：只渲染已激活过的页签内容，
 * 不预加载不可见页签。
 *
 * @example
 * ```ts
 * import type { TabsContentContext } from '@h-ai/ui'
 * const example: TabsContentContext = { active: 'profile', isActivated: key => key === 'profile' }
 * ```
 */
export interface TabsContentContext {
  /** 当前激活的标签 key */
  active: string
  /** 指定标签是否已被激活过（`lazy` 为 false 时恒为 true） */
  isActivated: (key: string) => boolean
}

/**
 * 标签页属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Tabs } from '@h-ai/ui'
 *   import type { TabsProps } from '@h-ai/ui'
 *   const props: TabsProps = { items: [{ key: 'profile', label: '资料' }, { key: 'security', label: '安全' }], active: 'profile', lazy: true }
 * </script>
 * <Tabs {...props} />
 * ```
 */
export interface TabsProps extends DataAttributes {
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
  /** 页签首次激活时触发一次；用于惰性加载对应内容（如调用控制器的 load） */
  onactivate?: (key: string) => void
  /** 是否惰性挂载页签内容：为 true 时未激活过的页签不渲染，`isActivated` 据此判断 */
  lazy?: boolean
  /** 内容插槽；参数提供当前激活项与惰性挂载判断 */
  children?: Snippet<[TabsContentContext]>
}

/**
 * 头像属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Avatar } from '@h-ai/ui'
 *   import type { AvatarProps } from '@h-ai/ui'
 *   const props: AvatarProps = { name: 'Ada', alt: '用户头像', size: 'md' }
 * </script>
 * <Avatar {...props} />
 * ```
 */
export interface AvatarProps extends DataAttributes {
  /** 图片地址 */
  src?: string
  /** 替代文本 */
  alt?: string
  /** 名称（用于生成首字母） */
  name?: string
  /** 占位文字（没有图片时显示） */
  placeholder?: string
  /** 尺寸 */
  size?: Size | number
  /** 形状 */
  shape?: 'circle' | 'square'
  /** 是否显示边框环 */
  ring?: boolean
  /** 自定义类名 */
  class?: string
}

/**
 * 下拉菜单项
 *
 * @example
 * ```ts
 * import type { DropdownItem } from '@h-ai/ui'
 * const example: DropdownItem = { key: 'edit', label: '编辑' }
 * ```
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
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Dropdown } from '@h-ai/ui'
 *   import type { DropdownProps } from '@h-ai/ui'
 *   const props: DropdownProps = { items: [{ key: 'edit', label: '编辑' }], position: 'bottom' }
 * </script>
 * <Dropdown {...props} />
 * ```
 */
export interface DropdownProps extends DataAttributes {
  /** 菜单项 */
  items: DropdownItem[]
  /** 触发方式；`manual` 由外部完全控制 open 状态。 */
  trigger?: 'click' | 'hover' | 'manual'
  /** 位置 */
  position?: Position
  /** 对齐 */
  align?: Alignment
  /** 自定义类名 */
  class?: string
  /** 触发按钮类名 */
  triggerClass?: string
  /** 选择事件 */
  onselect?: (key: string) => void
  /** 触发元素插槽 */
  children?: Snippet
}

// ─── 新增 Base 组件类型 ───

/**
 * 表单属性
 */
/**
 * 表单标签位置：独立成行或与控件同行。
 *
 * @example
 * ```ts
 * import type { FormLabelPosition } from '@h-ai/ui'
 * const example: FormLabelPosition = 'top'
 * ```
 */
export type FormLabelPosition = 'top' | 'left'

/**
 * 双列表单字段占用列数；auto 根据控件类型判断。
 *
 * @example
 * ```ts
 * import type { FormColSpan } from '@h-ai/ui'
 * const example: FormColSpan = 2
 * ```
 */
export type FormColSpan = 'auto' | 1 | 2

/**
 * 支持延迟求值的表单文案，切换语言时重新解析。
 *
 * @example
 * ```ts
 * import type { FormText } from '@h-ai/ui'
 * const example: FormText = () => '邮箱不能为空'
 * ```
 */
export type FormText = string | (() => string)

/**
 * 表单布局配置；窄容器自动收为单列。
 *
 * @example
 * ```ts
 * import type { FormLayoutOptions } from '@h-ai/ui'
 * const example: FormLayoutOptions = { columns: 2, labelPosition: 'top', labelWidth: '8rem' }
 * ```
 */
export interface FormLayoutOptions {
  /** 字段列数，默认 1。 */
  columns?: 1 | 2
  /** 标签位置，默认 top。 */
  labelPosition?: FormLabelPosition
  /** 同行标签宽度（CSS 值），默认 8rem。 */
  labelWidth?: string
}

/**
 * 可嵌入原生 form 的布局容器。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { FormLayout } from '@h-ai/ui'
 *   import type { FormLayoutProps } from '@h-ai/ui'
 *   const props: FormLayoutProps = { columns: 2, labelPosition: 'top' }
 * </script>
 * <FormLayout {...props}><span>表单字段</span></FormLayout>
 * ```
 */
export interface FormLayoutProps extends FormLayoutOptions, DataAttributes {
  class?: string
  children?: Snippet
}

/**
 * 表单容器属性；接管提交和重置，并向后代提供布局与禁用状态。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Form } from '@h-ai/ui'
 *   import type { FormProps } from '@h-ai/ui'
 *   const props: FormProps = { id: 'profile-form', columns: 2 }
 * </script>
 * <Form {...props}><input name="email" type="email" value="ada@example.com" /></Form>
 * ```
 */
export interface FormProps extends FormLayoutOptions, DataAttributes {
  /** 表单 ID */
  id?: string
  /** 自定义类名 */
  class?: string
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 提交事件 */
  onsubmit?: (data: Record<string, unknown>) => void | Promise<void>
  /** 重置事件 */
  onreset?: () => void
  /** 错误事件 */
  onerror?: (error: unknown) => void
  /** 子内容 */
  children?: Snippet
}

/**
 * 表单字段属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { FormField } from '@h-ai/ui'
 *   import type { FormFieldProps } from '@h-ai/ui'
 *   const props: FormFieldProps = { label: '邮箱', name: 'email', required: true }
 * </script>
 * <FormField {...props}><input name="email" type="email" /></FormField>
 * ```
 */
export interface FormFieldProps extends DataAttributes {
  /** 标签 */
  label?: FormText
  /** 关联控件 ID；省略时为内部控件自动提供唯一 ID。 */
  for?: string
  /** 覆盖所在表单的标签位置。 */
  labelPosition?: FormLabelPosition
  /** 覆盖所在表单的同行标签宽度。 */
  labelWidth?: string
  /** 双列时的占用列数，默认 auto；多行文本、上传和多选自动占两列。 */
  colSpan?: FormColSpan
  /** 字段名 */
  name?: string
  /** 错误消息 */
  error?: FormText
  /** 提示信息 */
  hint?: FormText
  /** 是否必填 */
  required?: boolean
  /** 自定义类名 */
  class?: string
  /** 子内容 */
  children?: Snippet
}

/**
 * 骨架屏属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Skeleton } from '@h-ai/ui'
 *   import type { SkeletonProps } from '@h-ai/ui'
 *   const props: SkeletonProps = { variant: 'text', count: 3 }
 * </script>
 * <Skeleton {...props} />
 * ```
 */
export interface SkeletonProps extends DataAttributes {
  /** 变体 */
  variant?: 'text' | 'title' | 'avatar' | 'thumbnail' | 'button' | 'input'
  /** 宽度 */
  width?: string
  /** 高度 */
  height?: string
  /** 是否圆形 */
  circle?: boolean
  /** 是否有动画 */
  animation?: boolean
  /** 数量 */
  count?: number
  /** 自定义类名 */
  class?: string
}

/**
 * 空状态属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Empty } from '@h-ai/ui'
 *   import type { EmptyProps } from '@h-ai/ui'
 *   const props: EmptyProps = { title: '暂无记录', icon: 'inbox' }
 * </script>
 * <Empty {...props} />
 * ```
 */
export interface EmptyProps extends DataAttributes {
  /** 标题 */
  title?: string
  /** 描述 */
  description?: string
  /** 图标类型 */
  icon?: 'inbox' | 'search' | 'file' | 'error'
  /** 尺寸 */
  size?: Size
  /** 自定义类名 */
  class?: string
  /** 操作按钮插槽 */
  action?: Snippet
  /** 自定义图标插槽 */
  children?: Snippet
}

/**
 * JSON 查看器属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { JsonViewer } from '@h-ai/ui'
 *   import type { JsonViewerProps } from '@h-ai/ui'
 *   const props: JsonViewerProps = { value: { name: 'wf', nested: { list: [1, 2] } } }
 * </script>
 * <JsonViewer {...props} />
 * ```
 */
export interface JsonViewerProps extends DataAttributes {
  /** 要展示的 JSON 数据；循环引用自动替换为占位符 */
  value: unknown
  /** 初始展开深度；0 表示全部折叠，1 展开顶层容器 */
  defaultExpandedDepth?: number
  /** 标量文本截断长度；超出部分以省略号结尾 */
  maxScalarLength?: number
  /** 是否显示复制按钮 */
  showCopy?: boolean
  /** 自定义类名 */
  class?: string
  /** 复制成功后的回调，参数为复制的格式化 JSON 文本 */
  onCopy?: (text: string) => void
}

/**
 * 结果页属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Result } from '@h-ai/ui'
 *   import type { ResultProps } from '@h-ai/ui'
 *   const props: ResultProps = { status: 'success', title: '提交完成' }
 * </script>
 * <Result {...props} />
 * ```
 */
export interface ResultProps extends DataAttributes {
  /** 状态 */
  status?: 'success' | 'error' | 'warning' | 'info'
  /** 标题 */
  title?: string
  /** 描述 */
  description?: string
  /** 自定义类名 */
  class?: string
  /** 自定义图标插槽 */
  icon?: Snippet
  /** 操作按钮插槽 */
  actions?: Snippet
  /** 额外内容插槽 */
  children?: Snippet
}

/**
 * 确认对话框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Confirm } from '@h-ai/ui'
 *   import type { ConfirmProps } from '@h-ai/ui'
 *   const props: ConfirmProps = { open: true, title: '删除记录', message: '确定删除这条记录？', variant: 'warning' }
 * </script>
 * <Confirm {...props} />
 * ```
 */
export interface ConfirmProps extends DataAttributes {
  /** 是否打开 */
  open?: boolean
  /** 标题 */
  title?: string
  /** 消息内容 */
  message?: string
  /** 确认按钮文本 */
  confirmText?: string
  /** 取消按钮文本 */
  cancelText?: string
  /** 变体 */
  variant?: 'default' | 'primary' | 'warning' | 'error'
  /** 加载状态 */
  loading?: boolean
  /** 自定义类名 */
  class?: string
  /** 确认事件 */
  onconfirm?: () => void | Promise<void>
  /** 取消事件 */
  oncancel?: () => void
}

/**
 * 标签属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Tag } from '@h-ai/ui'
 *   import type { TagProps } from '@h-ai/ui'
 *   const props: TagProps = { text: '已启用', variant: 'success', closable: true }
 * </script>
 * <Tag {...props} />
 * ```
 */
export interface TagProps extends DataAttributes {
  /** 文本 */
  text?: string
  /** 变体 */
  variant?: Variant
  /** 尺寸 */
  size?: Size
  /** 是否可关闭 */
  closable?: boolean
  /** 是否为轮廓样式 */
  outline?: boolean
  /** 移除按钮的 aria-label */
  removeLabel?: string
  /** 自定义类名 */
  class?: string
  /** 关闭事件 */
  onclose?: () => void
  /** 子内容 */
  children?: Snippet
}

/**
 * 标签输入框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { TagInput } from '@h-ai/ui'
 *   import type { TagInputProps } from '@h-ai/ui'
 *   const props: TagInputProps = { tags: ['Svelte'], maxTags: 5 }
 * </script>
 * <TagInput {...props} />
 * ```
 */
export interface TagInputProps extends DataAttributes {
  /** 标签列表 */
  tags?: string[]
  /** 占位符 */
  placeholder?: string
  /** 最大标签数 */
  maxTags?: number
  /** 是否允许重复 */
  allowDuplicates?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 尺寸 */
  size?: Size
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (tags: string[]) => void
}

/**
 * 步骤项
 *
 * @example
 * ```ts
 * import type { StepItem } from '@h-ai/ui'
 * const example: StepItem = { title: '确认资料', description: '核对后提交' }
 * ```
 */
export interface StepItem {
  /** 标题 */
  title: string
  /** 描述 */
  description?: string
  /** 图标 */
  icon?: string
}

/**
 * 步骤条属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Steps } from '@h-ai/ui'
 *   import type { StepsProps } from '@h-ai/ui'
 *   const props: StepsProps = { items: [{ title: '填写资料' }, { title: '确认' }], current: 0 }
 * </script>
 * <Steps {...props} />
 * ```
 */
export interface StepsProps extends DataAttributes {
  /** 步骤列表 */
  items?: StepItem[]
  /** 当前步骤 */
  current?: number
  /** 方向 */
  direction?: 'horizontal' | 'vertical'
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** 是否可点击 */
  clickable?: boolean
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (index: number) => void
}

/**
 * 图标按钮属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { IconButton } from '@h-ai/ui'
 *   import type { IconButtonProps } from '@h-ai/ui'
 *   const props: IconButtonProps = { label: '关闭', tooltip: '关闭面板' }
 * </script>
 * <IconButton {...props}>×</IconButton>
 * ```
 */
export interface IconButtonProps extends DataAttributes {
  /** 图标（受信任的内联 SVG 字符串或 Snippet） */
  icon?: string | Snippet
  /** 标签（无障碍） */
  label?: string
  /** aria-label（无障碍标签，别名） */
  ariaLabel?: string
  /** 提示文本 */
  tooltip?: string
  /** 变体 */
  variant?: Variant
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否加载中 */
  loading?: boolean
  /** 自定义类名 */
  class?: string
  /** 点击事件 */
  onclick?: (e: MouseEvent) => void
  /** 图标插槽 */
  children?: Snippet
}

/**
 * 弹出层属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Popover } from '@h-ai/ui'
 *   import type { PopoverProps } from '@h-ai/ui'
 *   const props: PopoverProps = { position: 'bottom', portal: true }
 * </script>
 * <Popover {...props}>提示内容</Popover>
 * ```
 */
export interface PopoverProps extends DataAttributes {
  /** 是否打开 */
  open?: boolean
  /** 位置 */
  position?: Position
  /** 触发方式 */
  trigger?: 'click' | 'hover'
  /** 偏移量 */
  offset?: number
  /** 是否将内容挂到 body，以逃逸祖先 overflow 和堆叠上下文。 */
  portal?: boolean
  /** 自定义类名 */
  class?: string
  /** 打开事件 */
  onopen?: () => void
  /** 关闭事件 */
  onclose?: () => void
  /** 触发器插槽 */
  triggerContent?: Snippet
  /** 内容插槽 */
  children?: Snippet
}

// ─── MessageBox 弹框（类似 ElementUI MessageBox） ───

/**
 * MessageBox 类型
 * - confirm: 双按钮（确认 / 取消）
 * - alert: 单按钮（仅确认）
 * - prompt: 带输入框的确认（预留）
 *
 * @example
 * ```ts
 * import type { MessageBoxAction } from '@h-ai/ui'
 * const example: MessageBoxAction = 'confirm'
 * ```
 */
export type MessageBoxAction = 'confirm' | 'cancel' | 'close'

/**
 * MessageBox 图标类型
 *
 * @example
 * ```ts
 * import type { MessageBoxIconType } from '@h-ai/ui'
 * const example: MessageBoxIconType = 'warning'
 * ```
 */
export type MessageBoxIconType = 'info' | 'success' | 'warning' | 'error'

/**
 * MessageBox 配置项
 *
 * @example
 * ```ts
 * import type { MessageBoxOptions } from '@h-ai/ui'
 * const example: MessageBoxOptions = { title: '删除记录', message: '确认删除？', showCancel: true, closeOnClickModal: false }
 * ```
 */
export interface MessageBoxOptions {
  /** 标题 */
  title?: string
  /** 消息纯文本；HTML 标签按文字展示，不作为 HTML 执行。 */
  message: string
  /** 类型：confirm 双按钮 / alert 单按钮 */
  type?: 'confirm' | 'alert'
  /** 图标类型 */
  iconType?: MessageBoxIconType
  /** 确认按钮文本 */
  confirmText?: string
  /** 取消按钮文本 */
  cancelText?: string
  /** 确认按钮变体 */
  confirmVariant?: 'default' | 'primary' | 'warning' | 'error'
  /** 是否显示取消按钮（alert 模式下默认 false） */
  showCancel?: boolean
  /** 点击遮罩是否关闭，默认 true；需要明确确认时显式设置 false。 */
  closeOnClickModal?: boolean
  /** 是否显示右上角关闭按钮，默认 true。 */
  showClose?: boolean
  /** 确认前回调（返回 false 可阻止关闭） */
  beforeClose?: (action: MessageBoxAction, instance: MessageBoxInstance) => boolean | Promise<boolean>
}

/**
 * MessageBox 实例（供 beforeClose 回调使用）
 *
 * @example
 * ```ts
 * import type { MessageBoxInstance } from '@h-ai/ui'
 * const example: MessageBoxInstance = { setLoading: loading => document.body.toggleAttribute('aria-busy', loading) }
 * ```
 */
export interface MessageBoxInstance {
  /** 设置加载态 */
  setLoading: (loading: boolean) => void
}

/**
 * Message 消息提示配置项
 *
 * @example
 * ```ts
 * import type { MessageOptions } from '@h-ai/ui'
 * const example: MessageOptions = { message: '保存完成', type: 'success', duration: 3000 }
 * ```
 */
export interface MessageOptions {
  /** 消息文本 */
  message: string
  /** 类型 */
  type?: 'info' | 'success' | 'warning' | 'error'
  /** 显示时长（毫秒），0 表示不自动关闭 */
  duration?: number
  /** 是否可手动关闭，默认 true；与 Toast 共用队列。 */
  closable?: boolean
}
