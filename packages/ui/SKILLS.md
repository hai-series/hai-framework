# @h-ai/ui SKILLS（AI 辅助文档）

> 本文件提供详细技术接口信息，供 AI 助手理解和使用 @h-ai/ui 组件。

---

## 模块概述

@h-ai/ui 是基于 **Svelte 5 Runes** 的管理后台 UI 组件库。

- **样式方案**：DaisyUI + TailwindCSS v4，支持 32 个 DaisyUI 内置主题
- **三层架构**：primitives（原子）→ compounds（组合）→ scenes（场景）
- **内置 i18n**：场景组件内置 zh-CN / en-US 翻译，通过 `@h-ai/core` 全局 locale 管理自动同步
- **翻译文件**：`src/lib/messages/{zh-CN,en-US}.json`
- **依赖**：`@h-ai/core`（workspace 依赖）

### 导出入口

| 入口                    | 说明                                 |
| ----------------------- | ------------------------------------ |
| `@h-ai/ui`              | 主入口，导出所有组件、类型、工具函数 |
| `@h-ai/ui/auto-import`  | 自动导入预处理器                     |
| `@h-ai/ui/components/*` | 按路径导入单个组件                   |
| `@h-ai/ui/styles/*`     | 样式文件                             |

---

## 自动导入预处理器

在 Svelte 编译阶段自动注入 `@h-ai/ui` 组件 import，减少页面样板代码。

```ts
// svelte.config.js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'

const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  // ...
}
```

预处理器会扫描 `.svelte` 文件模板，发现使用了已注册的组件名时自动在 `<script>` 中注入对应 import。支持所有三层组件（共 58 个组件名）。

---

## 基础类型

```ts
type Variant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'ghost' | 'link' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type Position = 'top' | 'right' | 'bottom' | 'left'
type Alignment = 'start' | 'center' | 'end'
```

---

## 原子组件接口（Primitives）

### Button

```ts
interface ButtonProps {
  variant?: Variant // 默认 'default'
  size?: Size // 默认 'md'
  class?: string
  ariaLabel?: string
  disabled?: boolean
  loading?: boolean
  outline?: boolean // 轮廓样式
  circle?: boolean // 圆形按钮
  type?: 'button' | 'submit' | 'reset'
  onclick?: (e: MouseEvent) => void
  children?: Snippet
}
```

### IconButton

```ts
interface IconButtonProps {
  icon?: string // HTML/SVG 图标
  label?: string // 无障碍标签
  ariaLabel?: string // 同 label（别名）
  tooltip?: string // 提示文本
  variant?: Variant
  size?: Size
  disabled?: boolean
  loading?: boolean
  class?: string
  onclick?: (e: MouseEvent) => void
  children?: Snippet // 图标插槽
}
```

### BareButton / BareInput

无样式的原生元素封装，用于折叠/抽屉等需要原生元素直系子节点的场景：

```ts
interface BareButtonProps {
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  class?: string
  ariaLabel?: string
  role?: string
  ariaSelected?: boolean
  tabindex?: number
  onclick?: (e: MouseEvent) => void
  onkeydown?: (e: KeyboardEvent) => void
  children?: Snippet
}

interface BareInputProps {
  value?: string
  placeholder?: string
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'file' | 'range'
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  class?: string
  role?: string
  ariaExpanded?: boolean
  ariaControls?: string
  ariaAutocomplete?: 'none' | 'list' | 'inline' | 'both'
  id?: string
  inputRef?: HTMLInputElement
  name?: string
  autocomplete?: string
  pattern?: string
  list?: string
  accept?: string // file 类型
  multiple?: boolean // file 类型
  minlength?: number
  maxlength?: number
  min?: number
  max?: number
  step?: number
  inputmode?: 'text' | 'search' | 'none' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal'
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
  onkeydown?: (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => void
  onblur?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  onfocus?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  oninvalid?: (e: Event & { currentTarget: HTMLInputElement }) => void
}
```

### Input

```ts
interface InputProps {
  value?: string
  placeholder?: string
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search'
  size?: Size
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  error?: string // 错误消息（显示在输入框下方）
  validationMessage?: string // 覆盖浏览器原生验证提示
  class?: string
  id?: string
  inputRef?: HTMLInputElement
  name?: string
  autocomplete?: string
  pattern?: string
  list?: string
  inputmode?: 'text' | 'search' | 'none' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal'
  minlength?: number
  maxlength?: number
  min?: number
  max?: number
  step?: number
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
  onkeydown?: (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => void
  onblur?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  onfocus?: (e: FocusEvent & { currentTarget: HTMLInputElement }) => void
  oninvalid?: (e: Event & { currentTarget: HTMLInputElement }) => void
}
```

### Textarea

```ts
interface TextareaProps {
  value?: string
  placeholder?: string
  rows?: number
  size?: Size
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  autoResize?: boolean // 自动调整高度
  inputmode?: HTMLInputElement['inputMode']
  error?: string
  validationMessage?: string
  class?: string
  id?: string
  name?: string
  oninput?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void
}
```

### Select

```ts
interface SelectOption<T = string> {
  value: T
  label: string
  disabled?: boolean
}

interface SelectProps<T = string> {
  value?: T
  options?: SelectOption<T>[]
  placeholder?: string
  size?: Size
  disabled?: boolean
  required?: boolean
  error?: string
  validationMessage?: string
  class?: string
  id?: string
  onchange?: (value: T) => void
  children?: Snippet // 原生 option 元素
}
```

### Checkbox / Switch

```ts
interface CheckboxProps {
  checked?: boolean
  label?: string
  size?: Size
  disabled?: boolean
  readonly?: boolean
  indeterminate?: boolean // 不确定状态
  class?: string
  onchange?: (checked: boolean) => void
}

interface SwitchProps {
  checked?: boolean
  label?: string
  size?: Size
  disabled?: boolean
  class?: string
  onchange?: (checked: boolean) => void
}
```

### Radio

```ts
interface RadioProps<T = string> {
  value?: T
  options: SelectOption<T>[]
  name?: string
  size?: Size
  disabled?: boolean
  direction?: 'horizontal' | 'vertical'
  class?: string
  onchange?: (value: T) => void
}
```

### ToggleCheckbox / ToggleInput / ToggleRadio

原生开关/单选输入，用于折叠/抽屉等结构要求 input 直系子元素的场景。
`ToggleInput` 与 `ToggleCheckbox` 共用 `ToggleCheckboxProps` 接口，行为一致：

```ts
interface ToggleCheckboxProps {
  checked?: boolean
  name?: string
  id?: string
  disabled?: boolean
  class?: string
  onchange?: (checked: boolean) => void
}

interface ToggleRadioProps {
  checked?: boolean
  name?: string
  id?: string
  disabled?: boolean
  class?: string
  onchange?: (checked: boolean) => void
}
```

### Badge / Avatar / Tag

```ts
interface BadgeProps {
  variant?: Variant
  size?: Size
  outline?: boolean
  class?: string
  children?: Snippet
}

interface AvatarProps {
  src?: string
  alt?: string
  name?: string // 用于生成首字母
  placeholder?: string // 没有图片时显示
  size?: Size | number // 可传数值（px）
  shape?: 'circle' | 'square'
  ring?: boolean // 显示边框环
  class?: string
}

interface TagProps {
  text?: string
  variant?: Variant
  size?: Size
  closable?: boolean
  outline?: boolean
  removeLabel?: string // 移除按钮的 aria-label
  class?: string
  onclose?: () => void
  children?: Snippet
}
```

### Spinner / Progress

```ts
interface SpinnerProps {
  size?: Size
  variant?: Variant
  class?: string
}

interface ProgressProps {
  value: number // 0-100
  max?: number
  step?: number
  size?: Size
  variant?: Variant
  showLabel?: boolean
  striped?: boolean
  animated?: boolean
  class?: string
}
```

---

## 组合组件接口（Compounds）

### Form / FormField

```ts
interface FormProps {
  class?: string
  loading?: boolean
  disabled?: boolean
  onsubmit?: (data: Record<string, unknown>) => void | Promise<void>
  onreset?: () => void
  onerror?: (error: unknown) => void
  children?: Snippet
}

interface FormFieldProps {
  label?: string
  name?: string
  error?: string
  hint?: string
  required?: boolean
  class?: string
  children?: Snippet
}
```

### TagInput / MultiSelect

```ts
interface TagInputProps {
  tags?: string[]
  placeholder?: string
  maxTags?: number
  allowDuplicates?: boolean
  disabled?: boolean
  size?: Size
  class?: string
  onchange?: (tags: string[]) => void
}
```

### Alert

```ts
interface AlertProps {
  variant?: Variant
  title?: string
  dismissible?: boolean
  class?: string
  onclose?: () => void
  children?: Snippet
}
```

### Toast / ToastContainer

Toast 使用单例模式，导出 `toast` 对象：

```ts
interface ToastProps {
  message: string
  variant?: Variant
  duration?: number // ms，0 为不自动关闭，默认 3000
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
  dismissible?: boolean // 默认 true
  onclose?: () => void
}

interface ToastItem extends ToastProps {
  id: string
}

// toast 单例 API
class ToastState {
  items: ToastItem[] // 响应式（$state）
  add(props: Omit<ToastProps, 'onclose'>): string
  remove(id: string): void
  clear(): void
  success(message: string, duration?: number): string
  error(message: string, duration?: number): string
  warning(message: string, duration?: number): string
  info(message: string, duration?: number): string
}

export const toast: ToastState
```

使用方式：页面中放置 `<ToastContainer />`，然后通过 `toast.success('消息')` 等方法触发。

### Modal

```ts
interface ModalProps {
  open?: boolean
  title?: string
  size?: Size | 'full'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  showClose?: boolean
  class?: string
  onclose?: () => void
  header?: Snippet
  footer?: Snippet
  children?: Snippet
}
```

### Drawer

```ts
interface DrawerProps {
  open?: boolean
  title?: string
  position?: Position // 默认 'right'
  size?: Size
  closeOnBackdrop?: boolean
  showClose?: boolean
  class?: string
  onclose?: () => void
  children?: Snippet
}
```

### Confirm

```ts
interface ConfirmProps {
  open?: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'primary' | 'warning' | 'error'
  loading?: boolean
  class?: string
  onconfirm?: () => void | Promise<void>
  oncancel?: () => void
}
```

### Popover

```ts
interface PopoverProps {
  open?: boolean
  position?: Position
  trigger?: 'click' | 'hover'
  offset?: number
  class?: string
  onopen?: () => void
  onclose?: () => void
  triggerContent?: Snippet
  children?: Snippet
}
```

### Card

```ts
interface CardProps {
  title?: string
  bordered?: boolean
  shadow?: boolean | 'sm' | 'md' | 'lg'
  padding?: Size | 'none'
  class?: string
  header?: Snippet
  footer?: Snippet
  children?: Snippet
}
```

### Table / DataTable

```ts
interface TableColumn<T = unknown> {
  key: string
  title: string
  width?: string | number
  align?: Alignment
  sortable?: boolean
  render?: (row: T, index: number) => string
}

interface TableProps<T = unknown> {
  data: T[]
  columns: TableColumn<T>[]
  bordered?: boolean
  striped?: boolean
  hoverable?: boolean
  compact?: boolean
  loading?: boolean
  class?: string
}
```

DataTable 在 Table 基础上增加 `keyField`、`actions` 插槽等特性。

### Accordion

```ts
interface AccordionItem {
  id: string
  title: string
  content?: string
  disabled?: boolean
  icon?: string
}
```

### Timeline

```ts
interface TimelineItem {
  id: string
  title: string
  description?: string
  time?: string
  icon?: string
  color?: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info'
  completed?: boolean
}
```

### Tabs

```ts
interface TabItem {
  key: string
  label: string
  disabled?: boolean
  icon?: string
}

interface TabsProps {
  items: TabItem[]
  active?: string // 当前激活 tab 的 key
  size?: Size
  type?: 'line' | 'card' | 'pills'
  class?: string
  onchange?: (key: string) => void
  children?: Snippet
}
```

### Pagination

```ts
interface PaginationProps {
  page: number
  total: number
  pageSize?: number
  size?: Size
  showTotal?: boolean
  showJumper?: boolean
  labels?: {
    total?: string // "{count}" 占位符
    jumpTo?: string
    page?: string
  }
  class?: string
  onchange?: (page: number) => void
}
```

### Breadcrumb

```ts
interface BreadcrumbItem {
  label: string
  href?: string
  icon?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  separator?: string
  class?: string
}
```

### Steps

```ts
interface StepItem {
  title: string
  description?: string
  icon?: string
}

interface StepsProps {
  items?: StepItem[]
  current?: number
  direction?: 'horizontal' | 'vertical'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  clickable?: boolean
  class?: string
  onchange?: (index: number) => void
}
```

### Dropdown

```ts
interface DropdownItem {
  key: string
  label: string
  icon?: string
  disabled?: boolean
  divider?: boolean
}

interface DropdownProps {
  items: DropdownItem[]
  trigger?: 'click' | 'hover'
  position?: Position
  align?: Alignment
  class?: string
  onselect?: (key: string) => void
  children?: Snippet
}
```

### Tooltip

```ts
interface TooltipProps {
  content: string
  position?: Position
  delay?: number // ms
  class?: string
  children?: Snippet
}
```

### Skeleton / Empty / Result

```ts
interface SkeletonProps {
  variant?: 'text' | 'title' | 'avatar' | 'thumbnail' | 'button' | 'input'
  width?: string
  height?: string
  circle?: boolean
  animation?: boolean
  count?: number
  class?: string
}

interface EmptyProps {
  title?: string
  description?: string
  icon?: 'inbox' | 'search' | 'file' | 'error'
  size?: Size
  class?: string
  action?: Snippet
  children?: Snippet
}

interface ResultProps {
  status?: 'success' | 'error' | 'warning' | 'info'
  title?: string
  description?: string
  class?: string
  icon?: Snippet
  actions?: Snippet
  children?: Snippet
}
```

---

## 场景组件接口（Scenes）

### IAM - LoginForm

登录表单，支持用户名/邮箱 + 密码登录。

```ts
interface LoginFormData {
  username: string
  password: string
  rememberMe: boolean
}

interface LoginFormProps {
  loading?: boolean
  disabled?: boolean
  showTitle?: boolean // 默认 false
  showRememberMe?: boolean // 默认 true
  showForgotPassword?: boolean // 默认 true
  forgotPasswordUrl?: string // 默认 '/forgot-password'
  showRegisterLink?: boolean // 默认 false
  registerUrl?: string // 默认 '/register'
  submitText?: string // 覆盖内置翻译
  class?: string
  errors?: Record<string, string> // { general?: string, username?: string, ... }
  onsubmit?: (data: LoginFormData) => void | Promise<void>
  onforgotpassword?: () => void
  header?: Snippet
  footer?: Snippet
}
```

### IAM - RegisterForm

```ts
type RegisterField = 'username' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'nickname'

interface RegisterFormData {
  username?: string
  email?: string
  phone?: string
  password: string
  confirmPassword?: string
  nickname?: string
}

interface RegisterFormProps {
  loading?: boolean
  disabled?: boolean
  showTitle?: boolean // 默认 false
  showPasswordStrength?: boolean // 默认 true
  requireConfirmPassword?: boolean // 默认 true
  minPasswordLength?: number // 默认 8
  fields?: RegisterField[] // 默认 ['username', 'email', 'password']
  showLoginLink?: boolean // 默认 false
  loginUrl?: string // 默认 '/login'
  submitText?: string
  class?: string
  errors?: Record<string, string>
  onsubmit?: (data: RegisterFormData) => void | Promise<void>
  header?: Snippet
  footer?: Snippet
}
```

### IAM - ForgotPasswordForm

```ts
interface ForgotPasswordFormData {
  email?: string
  phone?: string
}

interface ForgotPasswordFormProps {
  loading?: boolean
  disabled?: boolean
  showTitle?: boolean // 默认 false
  showDescription?: boolean // 默认 false
  mode?: 'email' | 'phone' // 默认 'email'
  showBackLink?: boolean // 默认 false
  loginUrl?: string // 默认 '/login'
  submitText?: string
  class?: string
  errors?: Record<string, string>
  onsubmit?: (data: ForgotPasswordFormData) => void | Promise<void>
  header?: Snippet
  footer?: Snippet
}
```

### IAM - ResetPasswordForm

```ts
interface ResetPasswordFormData {
  code?: string
  newPassword: string
  confirmPassword: string
}

interface ResetPasswordFormProps {
  loading?: boolean
  disabled?: boolean
  showTitle?: boolean // 默认 false
  showDescription?: boolean // 默认 false
  showCode?: boolean // 默认 true
  showPasswordStrength?: boolean // 默认 true
  minPasswordLength?: number // 默认 8
  showBackLink?: boolean // 默认 false
  loginUrl?: string // 默认 '/login'
  submitText?: string
  class?: string
  errors?: Record<string, string>
  onsubmit?: (data: ResetPasswordFormData) => void | Promise<void>
}
```

### IAM - ChangePasswordForm

```ts
interface ChangePasswordFormData {
  oldPassword?: string
  newPassword: string
  confirmPassword: string
}

interface ChangePasswordFormProps {
  loading?: boolean
  disabled?: boolean
  requireOldPassword?: boolean // 是否需要旧密码
  showPasswordStrength?: boolean
  minPasswordLength?: number
  submitText?: string
  class?: string
  errors?: Record<string, string>
  onsubmit?: (data: ChangePasswordFormData) => void | Promise<void>
}
```

### IAM - PasswordInput

带密码显示切换和强度指示器的密码输入框。**推荐受控模式**（`value` + `oninput`）。

```ts
interface PasswordInputProps {
  id?: string
  value?: string
  placeholder?: string
  size?: Size
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  error?: string
  showToggle?: boolean // 显示/隐藏切换，默认 true
  showStrength?: boolean // 密码强度指示，默认 false
  minLength?: number // 用于强度计算
  class?: string
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
}
```

### IAM - UserProfile

```ts
type UserProfileField = 'avatar' | 'username' | 'email' | 'nickname' | 'phone' | 'bio'

interface UserProfileData {
  id?: string
  username?: string
  email?: string
  nickname?: string
  phone?: string
  avatar?: string
  bio?: string
}

interface UserProfileProps {
  user?: UserProfileData
  editable?: boolean // 默认 true
  loading?: boolean
  fields?: UserProfileField[]
  avatarUploadUrl?: string
  class?: string
  errors?: Record<string, string>
  onsubmit?: (data: Record<string, string>) => void | Promise<void>
  onavatarchange?: (file: File) => void | Promise<void>
}
```

### Storage - FileUpload

```ts
type UploadState = 'pending' | 'uploading' | 'success' | 'error'

interface UploadFile {
  id: string
  file: File
  name: string
  size: number
  type: string
  state: UploadState
  progress: number // 0-100
  error?: string
  response?: unknown
}

interface FileUploadProps {
  accept?: string
  maxSize?: number // bytes
  maxFiles?: number
  multiple?: boolean // 默认 false
  disabled?: boolean
  uploadUrl?: string
  presignUrl?: string // 预签名 URL 地址
  headers?: Record<string, string>
  autoUpload?: boolean
  showList?: boolean
  dragDrop?: boolean
  class?: string
  onchange?: (files: UploadFile[]) => void
  onupload?: (file: UploadFile) => void
  onerror?: (error: string) => void
  onremove?: (file: UploadFile) => void
}
```

### Storage - ImageUpload

```ts
interface ImageUploadProps {
  value?: string // 图片 URL
  accept?: string // 默认 'image/*'
  maxSize?: number // bytes
  disabled?: boolean
  uploadUrl?: string
  presignUrl?: string
  headers?: Record<string, string>
  placeholder?: string
  aspectRatio?: string // 宽高比，如 '16/9'
  width?: string
  height?: string
  class?: string
  onchange?: (url: string) => void
  onerror?: (error: string) => void
}
```

### Storage - AvatarUpload

```ts
interface AvatarUploadProps {
  value?: string // 头像 URL
  size?: Size
  accept?: string
  maxSize?: number // bytes
  disabled?: boolean
  uploadUrl?: string
  presignUrl?: string
  headers?: Record<string, string>
  fallback?: string // 没有图片时显示的文字
  class?: string
  onchange?: (url: string) => void
  onerror?: (error: string) => void
}
```

### Storage - FileList

```ts
interface FileItem {
  id: string
  name: string
  size: number
  type: string
  url?: string
  thumbnailUrl?: string
  updatedAt?: Date | string
}

interface FileListProps {
  files?: FileItem[]
  loading?: boolean
  showPreview?: boolean
  showDownload?: boolean
  showDelete?: boolean
  showSize?: boolean
  showDate?: boolean
  layout?: 'list' | 'grid' // 默认 'list'
  class?: string
  ondownload?: (file: FileItem) => void
  ondelete?: (file: FileItem) => void
  onpreview?: (file: FileItem) => void
}
```

### Crypto - EncryptedInput

```ts
interface EncryptedInputProps {
  value?: string // 原始值
  encryptedValue?: string // 加密后的值
  placeholder?: string
  size?: Size
  disabled?: boolean
  readonly?: boolean
  showEncrypted?: boolean // 显示加密结果
  algorithm?: 'SM2' | 'SM4' | 'AES'
  onencrypt?: (value: string) => Promise<string> // 加密函数
  class?: string
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
}
```

### Crypto - HashDisplay

```ts
interface HashDisplayProps {
  value?: string // 哈希值
  algorithm?: 'SM3' | 'SHA256' | 'MD5'
  label?: string
  copyable?: boolean
  truncate?: boolean
  truncateLength?: number
  labels?: { copyHash?: string } // i18n 覆盖
  class?: string
}
```

### Crypto - SignatureDisplay

```ts
interface SignatureDisplayProps {
  signature?: string
  publicKey?: string
  algorithm?: 'SM2' | 'RSA' | 'ECDSA'
  verified?: boolean
  showPublicKey?: boolean
  copyable?: boolean
  labels?: { // i18n 覆盖
    signature?: string
    publicKey?: string
    verified?: string
    verifyFailed?: string
    notVerified?: string
    noSignature?: string
    copySignature?: string
    copyPublicKey?: string
  }
  class?: string
}
```

---

## 国际化机制

### 内部实现

组件内部使用 `m(key)` 函数获取翻译文本（不导出到公共 API）：

```ts
// src/lib/messages.ts（内部模块）
import { core } from '@h-ai/core'
import messagesEnUS from './messages/en-US.json'
import messagesZhCN from './messages/zh-CN.json'

type UIMessageKey = keyof typeof messagesZhCN

const getMessage = core.i18n.createMessageGetter({
  'zh-CN': messagesZhCN as Record<string, string>,
  'en-US': messagesEnUS as Record<string, string>,
})

// m('password_show') => '显示密码' (zh-CN) / 'Show password' (en-US)
export function m(key: UIMessageKey, params?: Record<string, string | number | boolean>): string {
  return getMessage(key, params ? { params } : undefined)
}

export function getUILocale(): string // 获取当前 locale
export function setUILocale(locale: string): void // 手动设置（通常不需要）
```

### locale 切换

```svelte
<script>
  import { createLocaleStore, setGlobalLocale } from '@h-ai/ui'
  import { setLocale } from '$lib/paraglide/runtime'

  const localeStore = createLocaleStore()

  function changeLocale(code: string) {
    localeStore.set(code)           // 更新 UI store + 同步 @h-ai/core
    setGlobalLocale(code)           // 显式同步到 @h-ai/core（可选，set 内部已同步）
    setLocale(code)                 // 同步到 Paraglide（应用层 i18n）
  }
</script>
```

### createLocaleStore 详细参数

```ts
function createLocaleStore(options?: {
  defaultLocale?: Locale // 默认 'zh-CN'
  supportedLocales?: LocaleInfo[] // 默认 DEFAULT_LOCALES
  detectBrowser?: boolean // 默认 true，自动检测浏览器语言
  persistKey?: string // localStorage key，默认 'hai-locale'
}): {
  current: Locale // 响应式，当前语言
  supported: LocaleInfo[] // 支持的语言列表
  set: (locale: Locale) => void // 设置语言（自动同步 @h-ai/core + 持久化）
  isSupported: (locale: Locale) => boolean
}
```

初始化优先级：localStorage > 浏览器语言检测 > defaultLocale。

### 导出的 i18n 工具

```ts
export { createLocaleStore } // Svelte 响应式 locale store
export { DEFAULT_LOCALE } // 'zh-CN'
export { DEFAULT_LOCALES } // LocaleInfo[]
export { detectBrowserLocale } // (locales: LocaleInfo[]) => string | undefined
export { getGlobalLocale } // () => string
export { interpolate } // (template: string, params: Record<string, ...>) => string
export { isLocaleSupported } // (locale: string, locales: LocaleInfo[]) => boolean
export { resolveLocale } // (locale: string, locales: LocaleInfo[], fallback: string) => string
export { setGlobalLocale } // (locale: string) => void

export type { InterpolationParams, Locale, LocaleInfo }
```

---

## 主题配置

### 数据结构

```ts
interface ThemeInfo {
  id: string // 'light', 'dark', 'cupcake', ...
  name: string // 显示名称
  dark: boolean // 是否暗色
  primaryColor: string // 主题色（用于预览）
  bgColor: string // 背景色（用于预览）
}

interface ThemeGroup {
  id: string
  name: string
  themes: ThemeInfo[]
}
```

### 导出的主题工具

```ts
export const THEMES: ThemeInfo[] // 32 个主题
export const THEME_GROUPS: ThemeGroup[] // 亮色/暗色分组
export const DARK_THEMES: string[] // 暗色主题 id 列表
export const DEFAULT_THEME: string // 'light'
export const THEME_STORAGE_KEY: string // 'theme'
export const DAISYUI_THEMES_CONFIG: string // CSS 声明字符串

export function getThemeInfo(themeId: string): ThemeInfo | undefined
export function isDarkTheme(themeId: string): boolean
export function applyTheme(theme: string, persist?: boolean): void // 应用主题
export function getCurrentTheme(): string
export function getSavedTheme(): string
export function getThemeInitScript(): string // 防闪烁脚本
```

### 32 个主题

**亮色（19 个）**：light, cupcake, bumblebee, emerald, corporate, retro, valentine, garden, aqua, lofi, pastel, fantasy, wireframe, cmyk, autumn, acid, lemonade, winter, nord

**暗色（13 个）**：dark, synthwave, cyberpunk, halloween, forest, black, luxury, dracula, business, night, coffee, dim, sunset

---

## 样式工具

```ts
// 合并类名
export function cn(...classes: (string | boolean | undefined | null)[]): string

// 变体 -> CSS class
export const variantClasses: Record<Variant, string> // { default: 'btn-neutral', ... }
export function getVariantClass(variant: Variant, prefix?: string): string
export function getSizeClass(size: Size, prefix?: string): string
export function getInputSizeClass(size: Size): string
export function getBadgeVariantClass(variant: Variant): string
export function getBadgeSizeClass(size: Size): string
export function getAlertVariantClass(variant: Variant): string
export function getProgressVariantClass(variant: Variant): string
export function generateId(prefix?: string): string
```

---

## 常见模式与注意事项

1. **密码比较使用 NFKC 规范化**：注册/重置/修改密码表单在比较两次密码时会执行 Unicode NFKC 规范化，避免兼容字符导致的误判。

2. **PasswordInput 推荐受控模式**：使用 `value` + `oninput` 保证父组件状态同步。

3. **上传组件需要配置 uploadUrl**：可以是静态 URL，也支持 `presignUrl` 获取预签名 URL。

4. **不要修改内部翻译文件**：如需自定义文本，通过 `submitText`、`labels` 等 props 覆盖。

5. **组件依赖 @h-ai/core**：确保项目已安装 `@h-ai/core`。

6. **Snippet 插槽**：Svelte 5 使用 `{#snippet name()}...{/snippet}` 语法传递插槽内容，不再使用 `<slot>`。

7. **三层架构红线**：
   - primitives 不依赖 compounds 或 scenes
   - compounds 只依赖 primitives
   - scenes 可依赖 primitives 和 compounds
   - 所有层可依赖 `types.ts`、`utils.ts`、`messages.ts`

8. **errors prop 约定**：场景表单组件的 `errors` 为 `Record<string, string>`，key 为字段名，`general` 表示全局错误。

9. **Svelte 5 Runes**：所有组件使用 Svelte 5 Runes（`$state`、`$derived`、`$effect`），不使用 Svelte 4 的 stores 或 `$:` 语法。

10. **bind: 双向绑定**：支持 `bind:open`（Modal/Drawer/Confirm）、`bind:value`（Input/Select/Textarea）等 Svelte 5 双向绑定。
