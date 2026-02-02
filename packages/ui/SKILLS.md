# @hai/ui SKILLS（AI 辅助文档）

> 本文件提供详细技术接口信息，供 AI 助手理解和使用 @hai/ui 组件。

## 模块概述

@hai/ui 是基于 Svelte 5 Runes 的 UI 组件库，采用**组件内置翻译**模式：

- 场景组件（`scenes/`）内置中英文翻译，自动响应全局 locale
- 翻译文件：`packages/ui/src/lib/messages/{zh-CN,en-US}.json`
- 通过 `@hai/core` 的 `localeManager` 订阅 locale 变化

---

## 自动导入预处理器

用于在 Svelte 编译阶段自动注入 `@hai/ui` 组件 import，减少页面样板代码：

```ts
import { autoImportHaiUi } from '@hai/ui/auto-import'

const preprocessors = [autoImportHaiUi()]
```

---

## 原子组件补充（Bare / Toggle）

用于需要原生元素直系子节点或完全自定义样式的场景：

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
}

interface BareInputProps {
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'file' | 'range'
  class?: string
  accept?: string
  multiple?: boolean
  oninput?: (e: Event) => void
  onchange?: (e: Event) => void
}

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

---

## 国际化机制

### 内部实现

组件内部使用 `m(key)` 函数获取翻译文本：

```ts
// packages/ui/src/lib/messages.ts（内部模块，不导出）
import { core } from '@hai/core'
import enUS from './messages/en-US.json'
import zhCN from './messages/zh-CN.json'

const messages = { 'zh-CN': zhCN, 'en-US': enUS }
export const m = core.i18n.createMessageGetter(messages)
```

### 使用方式

**应用层只需管理页面级文本**，组件内部文本由 @hai/ui 统一管理：

```svelte
<!-- 正确：无需传入翻译 props -->
<LoginForm onsubmit={handleLogin} />

<!-- 可选：覆盖提交按钮文本 -->
<LoginForm submitText={m.auth_login()} onsubmit={handleLogin} />
```

### locale 切换

```svelte
<script>
  import { createLocaleStore, setGlobalLocale } from '@hai/ui'
  import { setLocale } from '$lib/paraglide/runtime'

  const localeStore = createLocaleStore()

  function changeLocale(code: string) {
    localeStore.set(code)           // 更新 UI store
    setGlobalLocale(code)           // 同步到 @hai/core
    setLocale(code)                 // 同步到 Paraglide（应用层）
  }
</script>
```

---

## 场景组件接口

### LoginForm

登录表单，支持用户名/邮箱 + 密码登录。

```ts
interface LoginFormProps {
  loading?: boolean // 加载状态
  errors?: Record<string, string> // 错误信息 { general?: string }
  showTitle?: boolean // 显示标题，默认 false
  showRememberMe?: boolean // 显示"记住我"，默认 true
  showForgotPassword?: boolean // 显示忘记密码链接，默认 true
  forgotPasswordUrl?: string // 忘记密码链接，默认 '/forgot-password'
  showRegisterLink?: boolean // 显示注册链接，默认 false
  registerUrl?: string // 注册页面链接，默认 '/register'
  submitText?: string // 提交按钮文本，默认使用内置翻译
  onsubmit?: (data: LoginFormData) => void // 提交回调
}

interface LoginFormData {
  username: string
  password: string
  rememberMe: boolean
}
```

### RegisterForm

注册表单，支持用户名、邮箱、手机号、密码等字段。

```ts
interface RegisterFormProps {
  loading?: boolean
  errors?: Record<string, string>
  showTitle?: boolean // 显示标题，默认 false
  fields?: RegisterFormField[] // 默认 ['username', 'email', 'password']
  requireConfirmPassword?: boolean // 需要确认密码，默认 true
  showPasswordStrength?: boolean // 显示密码强度，默认 true
  minPasswordLength?: number // 最小密码长度，默认 8
  showLoginLink?: boolean // 显示登录链接，默认 false
  loginUrl?: string // 登录页面链接，默认 '/login'
  submitText?: string
  onsubmit?: (data: RegisterFormData) => void
}

interface RegisterFormData {
  username?: string
  email?: string
  phone?: string
  nickname?: string
  password: string
  confirmPassword?: string
}

type RegisterFormField = 'username' | 'email' | 'phone' | 'nickname' | 'password'
```

### ForgotPasswordForm

忘记密码表单，支持邮箱或手机号模式。

```ts
interface ForgotPasswordFormProps {
  loading?: boolean
  errors?: Record<string, string>
  showTitle?: boolean // 显示标题，默认 false
  showDescription?: boolean // 显示描述，默认 false
  mode?: 'email' | 'phone' // 模式，默认 'email'
  showBackLink?: boolean // 显示返回登录链接，默认 false
  loginUrl?: string // 登录页面链接，默认 '/login'
  submitText?: string
  onsubmit?: (data: ForgotPasswordFormData) => void
}

interface ForgotPasswordFormData {
  email?: string
  phone?: string
}
```

### ResetPasswordForm

重置密码表单，输入验证码和新密码。

```ts
interface ResetPasswordFormProps {
  loading?: boolean
  errors?: Record<string, string>
  showTitle?: boolean // 显示标题，默认 false
  showDescription?: boolean // 显示描述，默认 false
  showCode?: boolean // 显示验证码输入，默认 true
  showPasswordStrength?: boolean // 显示密码强度，默认 true
  minPasswordLength?: number // 最小密码长度，默认 8
  showBackLink?: boolean // 显示返回登录链接，默认 false
  loginUrl?: string // 登录页面链接，默认 '/login'
  submitText?: string
  onsubmit?: (data: ResetPasswordFormData) => void
}

interface ResetPasswordFormData {
  code?: string
  newPassword: string
  confirmPassword: string
}
```

### ChangePasswordForm

修改密码表单，输入当前密码和新密码。

```ts
interface ChangePasswordFormProps {
  loading?: boolean
  errors?: Record<string, string>
  showPasswordStrength?: boolean
  minPasswordLength?: number
  submitText?: string
  onsubmit?: (data: ChangePasswordFormData) => void
}

interface ChangePasswordFormData {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}
```

### PasswordInput

带密码显示切换和强度指示器的密码输入框。

```ts
interface PasswordInputProps {
  id?: string
  value?: string
  placeholder?: string
  disabled?: boolean
  showToggle?: boolean // 显示/隐藏切换按钮，默认 true
  showStrength?: boolean // 显示密码强度，默认 false
  minLength?: number // 最小长度（用于强度计算）
  autocomplete?: string
  oninput?: (e: Event) => void
  onblur?: (e: Event) => void
  onfocus?: (e: Event) => void
}
```

### UserProfile

用户资料编辑组件。

```ts
interface UserProfileProps {
  user?: UserData
  editable?: boolean // 是否可编辑，默认 true
  fields?: UserProfileField[] // 显示字段
  loading?: boolean
  avatarUploadUrl?: string | (() => Promise<string>)
  onsubmit?: (data: UserData) => void
  oncancel?: () => void
}

interface UserData {
  avatar?: string
  username?: string
  email?: string
  nickname?: string
  phone?: string
  bio?: string
}

type UserProfileField = 'avatar' | 'username' | 'email' | 'nickname' | 'phone' | 'bio'
```

---

## Storage 组件接口

### FileUpload

通用文件上传组件。

```ts
interface FileUploadProps {
  accept?: string // 接受的文件类型
  maxSize?: number // 最大文件大小（字节）
  maxFiles?: number // 最大文件数
  multiple?: boolean // 允许多选，默认 false
  disabled?: boolean
  uploadUrl?: string | (() => Promise<string>)
  onupload?: (files: UploadedFile[]) => void
  onerror?: (error: string) => void
}

interface UploadedFile {
  name: string
  size: number
  type: string
  url: string
}
```

### ImageUpload

图片上传组件，支持预览。

```ts
interface ImageUploadProps {
  value?: string // 当前图片 URL
  accept?: string // 默认 'image/*'
  maxSize?: number // 默认 5MB
  aspectRatio?: number // 宽高比
  disabled?: boolean
  uploadUrl?: string | (() => Promise<string>)
  onchange?: (url: string | null) => void
  onerror?: (error: string) => void
}
```

### AvatarUpload

头像上传组件，圆形裁剪。

```ts
interface AvatarUploadProps {
  value?: string // 当前头像 URL
  size?: 'sm' | 'md' | 'lg' | 'xl' // 尺寸，默认 'lg'
  maxSize?: number // 默认 2MB
  ring?: string // 边框颜色 class
  placeholder?: string // 占位符文本
  disabled?: boolean
  uploadUrl?: string | (() => Promise<string>)
  onchange?: (url: string | null) => void
  onerror?: (error: string) => void
}
```

### FileList

文件列表展示组件。

```ts
interface FileListProps {
  files: FileItem[]
  layout?: 'list' | 'grid' // 布局，默认 'list'
  deletable?: boolean // 可删除，默认 false
  downloadable?: boolean // 可下载，默认 true
  previewable?: boolean // 可预览，默认 true
  ondelete?: (file: FileItem) => void
}

interface FileItem {
  id: string
  name: string
  size: number
  type: string
  url: string
  createdAt?: Date
}
```

---

## Crypto 组件接口

### EncryptedInput

加密输入框，输入后自动加密并显示结果。

```ts
interface EncryptedInputProps {
  value?: string // 输入值
  encrypted?: string // 加密结果
  placeholder?: string
  showToggle?: boolean // 显示/隐藏切换
  copyable?: boolean // 可复制加密结果
  encrypt?: (value: string) => string | Promise<string>
  oninput?: (e: Event) => void
}
```

---

## 导出的 i18n 工具

```ts
import {
  createLocaleStore, // Svelte 响应式 locale store
  DEFAULT_LOCALE, // 默认 locale: 'zh-CN'
  DEFAULT_LOCALES, // 支持的 locale 列表
  detectBrowserLocale, // 检测浏览器语言
  getGlobalLocale, // 获取当前全局 locale
  interpolate, // 字符串插值（如 "Hello {name}"）
  isLocaleSupported, // 检查 locale 是否支持
  resolveLocale, // 解析 locale（支持回退）
  setGlobalLocale, // 设置全局 locale（同步 @hai/core）
} from '@hai/ui'
```

---

## 注意事项

1. **密码比较使用 NFKC 规范化**：注册/重置/修改密码表单在比较两次密码时会执行 Unicode NFKC 规范化，避免兼容字符导致的误判。

2. **PasswordInput 推荐受控模式**：使用 `value` + `oninput` 保证父组件状态同步。

3. **上传组件需要配置 uploadUrl**：可以是静态 URL 或返回 Promise 的函数（用于获取预签名 URL）。

4. **不要修改内部翻译文件**：如需自定义文本，通过 `submitText` 等 props 覆盖。

5. **组件依赖 @hai/core**：确保项目已安装并初始化 `@hai/core`。
