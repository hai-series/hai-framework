/**
 * @h-ai/ui — 场景组件类型定义
 *
 * 场景化组件的 Props 类型
 * @module types
 */

import type { HaiResult } from '@h-ai/core'
import type { Challenge } from 'altcha/lib'
import type { Snippet } from 'svelte'
import type { DataAttributes, FormLayoutOptions, FormText, InputProps, Size } from '../../types.js'

// ─── IAM 相关类型 ───

/**
 * 密码输入框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { PasswordInput } from '@h-ai/ui'
 *   import type { PasswordInputProps } from '@h-ai/ui'
 *   const props: PasswordInputProps = { value: '', autocomplete: 'new-password', showStrength: true, minLength: 12 }
 * </script>
 * <PasswordInput {...props} />
 * ```
 */
export interface PasswordInputProps extends DataAttributes {
  /** 元素 ID */
  id?: string
  /** 值 */
  value?: string
  /** autocomplete */
  autocomplete?: string
  /** 占位符 */
  placeholder?: string
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
  /** 是否显示切换按钮 */
  showToggle?: boolean
  /** 是否显示密码强度 */
  showStrength?: boolean
  /** 最小长度；提供时校验，省略时仅以 8 位为基准计算强度。 */
  minLength?: number
  /** 自定义类名 */
  class?: string
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 变化事件 */
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
}

/**
 * 协议展示配置
 *
 * @example
 * ```ts
 * import type { AgreementDisplay } from '@h-ai/ui'
 * const example: AgreementDisplay = { userAgreementUrl: '/terms', privacyPolicyUrl: '/privacy' }
 * ```
 */
export interface AgreementDisplay {
  /** 用户协议 Markdown 正文；配置时优先于 URL。 */
  userAgreementMarkdown?: string
  /** 隐私协议 Markdown 正文；由内置安全渲染器显示。 */
  privacyPolicyMarkdown?: string
  /** 用户协议 URL */
  userAgreementUrl?: string
  /** 隐私协议 URL */
  privacyPolicyUrl?: string
}

/**
 * 登录表单数据
 *
 * @example
 * ```ts
 * import type { LoginFormData } from '@h-ai/ui'
 * const example: LoginFormData = { username: 'ada', password: 'Example-pass-42!', method: 'password' }
 * ```
 */
export interface LoginFormData {
  /** 当前登录方式；省略时使用密码。 */
  method?: AuthLoginMethod
  /** 邮件/短信验证码 */
  code?: string
  username: string
  password: string
}

/**
 * 登录表单属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { LoginForm } from '@h-ai/ui'
 *   import type { LoginFormProps } from '@h-ai/ui'
 *   const props: LoginFormProps = { methods: ['password'] }
 * </script>
 * <LoginForm {...props} />
 * ```
 */
export interface LoginFormProps extends FormLayoutOptions, DataAttributes {
  /** 实际可用的方式；空数组表示无可用登录方式。 */
  methods?: AuthLoginMethod[]
  /** 验证码长度 */
  otpLength?: number
  /** 重发间隔（秒） */
  resendInterval?: number
  /** 发送验证码；失败信息在表单内显示。 */
  onsendotp?: (identifier: string) => Promise<HaiResult<unknown>>
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 是否显示忘记密码 */
  showForgotPassword?: boolean
  /** 忘记密码链接 */
  forgotPasswordUrl?: string
  /** 是否显示注册链接 */
  showRegisterLink?: boolean
  /** 注册页面链接 */
  registerUrl?: string
  /** 协议展示配置 */
  agreements?: AgreementDisplay
  /** 提交按钮文本 */
  submitText?: string
  /** 自定义类名 */
  class?: string
  /** 错误信息 */
  errors?: Record<string, string>
  /** 提交事件 */
  onsubmit?: (data: LoginFormData) => void | Promise<void>
  /** 忘记密码事件 */
  onforgotpassword?: () => void
  /** 头部插槽 */
  header?: Snippet
  /** 内置字段后、提交按钮前的扩展内容；额外字段值由应用自行绑定与提交。 */
  extraFields?: Snippet
  /** 底部插槽 */
  footer?: Snippet
}

/**
 * 注册表单字段
 *
 * @example
 * ```ts
 * import type { RegisterField } from '@h-ai/ui'
 * const example: RegisterField = 'email'
 * ```
 */
export type RegisterField = 'username' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'nickname'

/**
 * 注册表单数据
 *
 * @example
 * ```ts
 * import type { RegisterFormData } from '@h-ai/ui'
 * const example: RegisterFormData = { username: 'ada', email: 'ada@example.com', password: 'Example-pass-42!', confirmPassword: 'Example-pass-42!' }
 * ```
 */
export interface RegisterFormData {
  username?: string
  email?: string
  phone?: string
  password: string
  confirmPassword?: string
  nickname?: string
}

/**
 * 注册表单属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { RegisterForm } from '@h-ai/ui'
 *   import type { RegisterFormProps } from '@h-ai/ui'
 *   const props: RegisterFormProps = { fields: ['username', 'password'], requireConfirmPassword: true }
 * </script>
 * <RegisterForm {...props} />
 * ```
 */
export interface RegisterFormProps extends FormLayoutOptions, DataAttributes {
  passwordPolicy?: PasswordPolicy
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 是否显示密码强度 */
  showPasswordStrength?: boolean
  /** 是否需要确认密码 */
  requireConfirmPassword?: boolean
  /** 最小密码长度 */
  minPasswordLength?: number
  /** 显示的字段 */
  fields?: RegisterField[]
  /** 是否显示登录链接 */
  showLoginLink?: boolean
  /** 登录页面链接 */
  loginUrl?: string
  /** 协议展示配置 */
  agreements?: AgreementDisplay
  /** 提交按钮文本 */
  submitText?: string
  /** 自定义类名 */
  class?: string
  /** 错误信息 */
  errors?: Record<string, string>
  /** 提交事件 */
  onsubmit?: (data: RegisterFormData) => void | Promise<void>
  /** 头部插槽 */
  header?: Snippet
  /** 内置字段后、提交按钮前的扩展内容；额外字段值由应用自行绑定与提交。 */
  extraFields?: Snippet
  /** 底部插槽 */
  footer?: Snippet
}

/**
 * 修改密码表单数据
 *
 * @example
 * ```ts
 * import type { ChangePasswordFormData } from '@h-ai/ui'
 * const example: ChangePasswordFormData = { oldPassword: 'Old-example-42!', newPassword: 'New-example-42!', confirmPassword: 'New-example-42!' }
 * ```
 */
export interface ChangePasswordFormData {
  oldPassword?: string
  newPassword: string
  confirmPassword: string
}

/**
 * 敏感操作再鉴别对话框属性；宿主只在服务端选定操作前请求密码。
 * @example
 * ```ts
 * import type { ReauthenticationDialogProps } from '@h-ai/ui'
 * const props: ReauthenticationDialogProps = { open: false, onsubmit: async (password) => { void password }, onclose: () => {} }
 * ```
 */
export interface ReauthenticationDialogProps {
  open: boolean
  loading?: boolean
  error?: string
  onsubmit: (password: string) => void | Promise<void>
  onclose: () => void
}

/**
 * 修改密码表单属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ChangePasswordForm } from '@h-ai/ui'
 *   import type { ChangePasswordFormProps } from '@h-ai/ui'
 *   const props: ChangePasswordFormProps = { requireOldPassword: true, minPasswordLength: 12 }
 * </script>
 * <ChangePasswordForm {...props} />
 * ```
 */
export interface ChangePasswordFormProps extends FormLayoutOptions, DataAttributes {
  passwordPolicy?: PasswordPolicy
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否需要旧密码 */
  requireOldPassword?: boolean
  /** 是否显示密码强度 */
  showPasswordStrength?: boolean
  /** 最小密码长度 */
  minPasswordLength?: number
  /** 提交按钮文本 */
  submitText?: string
  /** 自定义类名 */
  class?: string
  /** 错误信息 */
  errors?: Record<string, string>
  /** 提交事件 */
  onsubmit?: (data: ChangePasswordFormData) => void | Promise<void>
}

/**
 * 找回密码表单数据
 *
 * @example
 * ```ts
 * import type { ForgotPasswordFormData } from '@h-ai/ui'
 * const example: ForgotPasswordFormData = { email: 'ada@example.com' }
 * ```
 */
export interface ForgotPasswordFormData {
  email?: string
  phone?: string
}

/**
 * 找回密码表单属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ForgotPasswordForm } from '@h-ai/ui'
 *   import type { ForgotPasswordFormProps } from '@h-ai/ui'
 *   const props: ForgotPasswordFormProps = { mode: 'email' }
 * </script>
 * <ForgotPasswordForm {...props} />
 * ```
 */
export interface ForgotPasswordFormProps extends FormLayoutOptions, DataAttributes {
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 是否显示描述 */
  showDescription?: boolean
  /** 找回方式 */
  mode?: 'email' | 'phone'
  /** 是否显示返回登录链接 */
  showBackLink?: boolean
  /** 登录页面链接 */
  loginUrl?: string
  /** 提交按钮文本 */
  submitText?: string
  /** 自定义类名 */
  class?: string
  /** 错误信息 */
  errors?: Record<string, string>
  /** 提交事件 */
  onsubmit?: (data: ForgotPasswordFormData) => void | Promise<void>
  /** 头部插槽 */
  header?: Snippet
  /** 底部插槽 */
  footer?: Snippet
}

/**
 * 重置密码表单数据
 *
 * @example
 * ```ts
 * import type { ResetPasswordFormData } from '@h-ai/ui'
 * const example: ResetPasswordFormData = { code: '123456', newPassword: 'New-example-42!', confirmPassword: 'New-example-42!' }
 * ```
 */
export interface ResetPasswordFormData {
  code?: string
  newPassword: string
  confirmPassword: string
}

/**
 * 重置密码表单属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ResetPasswordForm } from '@h-ai/ui'
 *   import type { ResetPasswordFormProps } from '@h-ai/ui'
 *   const props: ResetPasswordFormProps = { showCode: true, minPasswordLength: 12 }
 * </script>
 * <ResetPasswordForm {...props} />
 * ```
 */
export interface ResetPasswordFormProps extends FormLayoutOptions, DataAttributes {
  passwordPolicy?: PasswordPolicy
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 是否显示描述 */
  showDescription?: boolean
  /** 是否显示验证码 */
  showCode?: boolean
  /** 是否显示密码强度 */
  showPasswordStrength?: boolean
  /** 最小密码长度 */
  minPasswordLength?: number
  /** 是否显示返回登录链接 */
  showBackLink?: boolean
  /** 登录页面链接 */
  loginUrl?: string
  /** 提交按钮文本 */
  submitText?: string
  /** 自定义类名 */
  class?: string
  /** 错误信息 */
  errors?: Record<string, string>
  /** 提交事件 */
  onsubmit?: (data: ResetPasswordFormData) => void | Promise<void>
}

/**
 * 认证页面直接消费 IAM 白名单配置，无需依赖服务端 IAM 包。
 *
 * @example
 * ```ts
 * import type { AuthLoginMethod } from '@h-ai/ui'
 * const example: AuthLoginMethod = 'password'
 * ```
 */
export type AuthLoginMethod = 'password' | 'ldap' | 'email' | 'sms'
/**
 * 与 IAM 公开密码策略一致；前端提示不能代替服务端校验。
 *
 * @example
 * ```ts
 * import type { PasswordPolicy } from '@h-ai/ui'
 * const example: PasswordPolicy = { minLength: 12, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: true }
 * ```
 */
export interface PasswordPolicy {
  minLength: number
  maxLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumber: boolean
  requireSpecialChar: boolean
  /** 至少满足的字符类别数；0 或未提供时仅应用各项独立要求。 */
  minCharacterClasses?: number
}
/**
 * 仅消费安全公开配置，不能将 iam.config 或连接密钥传入浏览器。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * import type { AuthPanelConfig } from '@h-ai/ui'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.publicConfig()
 *   if (!result.success) throw new Error(result.error.message)
 *   if (!result.data) throw new Error('Public auth configuration unavailable')
 *   const actions = apiClient.createAuthActions(apiClient)
 *   const example: AuthPanelConfig = result.data
 * }
 * finally {
 *   await apiClient.close()
 * }
 * ```
 */
export interface AuthPanelConfig {
  captcha?: { enabled: boolean }
  /** 只有已启用且具备运行时依赖的方式才应为 true。 */
  login: { password: boolean, ldap: boolean, email: boolean, sms: boolean }
  register: { enabled: boolean }
  passwordReset: { enabled: boolean, mode?: 'email' | 'phone' }
  password: PasswordPolicy
  /** 验证码位数和重发间隔（秒），用于输入校验和倒计时。 */
  otp: { length: number, resendInterval: number }
  /** 协议 URL 由服务端校验；弹窗展示开关按当前页面分别生效。 */
  agreements: AgreementDisplay & { showOnLogin: boolean, showOnRegister: boolean }
  ui: { variant: 'card' | 'split', title?: string, subtitle?: string, brandTitle?: string, brandText?: string, logoUrl?: string, illustrationUrl?: string }
}
/**
 * 认证动作可由框架工厂直接创建，也可包装以处理应用自己的扩展数据。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * import type { AuthPanelActions } from '@h-ai/ui'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.publicConfig()
 *   if (!result.success) throw new Error(result.error.message)
 *   if (!result.data) throw new Error('Public auth configuration unavailable')
 *   const actions = apiClient.createAuthActions(apiClient)
 *   const example: AuthPanelActions = actions
 * }
 * finally {
 *   await apiClient.close()
 * }
 * ```
 */
export interface AuthPanelActions {
  /** 仅启用交互挑战时需要；动作返回可公开挑战，签名秘密保留在服务端。 */
  createCaptcha?: (input: { operation: 'login' | 'register' | 'sendOtp' | 'passwordReset' | 'renewPassword' }) => Promise<HaiResult<{ id: string, challenge: Challenge }>>
  /** password/ldap 使用 password，email/sms 使用 code；成功后由工厂保存凭证。 */
  login: (input: { identifier: string, password: string, method?: AuthLoginMethod, code?: string, captcha?: string }) => Promise<HaiResult<unknown>>
  /** 注册并登录；禁用新账户的待启用状态由面板单独提示。 */
  register: (input: { username: string, password: string, email?: string, phone?: string, displayName?: string, captcha?: string }) => Promise<HaiResult<unknown>>
  sendOtp: (identifier: string, options?: { captcha?: string }) => Promise<HaiResult<unknown>>
  requestPasswordReset: (identifier: string, options?: { captcha?: string }) => Promise<HaiResult<unknown>>
  confirmPasswordReset: (token: string, newPassword: string) => Promise<HaiResult<unknown>>
  /** 首次或密码过期时，验证原密码并换新；完成后重新登录。 */
  renewPassword?: (input: { identifier: string, password: string, newPassword: string, captcha?: string }) => Promise<HaiResult<unknown>>
}

/**
 * AuthPanel 的初始页面；未传独立路由时由组件内部导航。
 *
 * @example
 * ```ts
 * import type { AuthPanelMode } from '@h-ai/ui'
 * const example: AuthPanelMode = 'login'
 * ```
 */
export type AuthPanelMode = 'login' | 'register' | 'forgot' | 'reset' | 'renew'

/**
 * 配置驱动认证场景；网络、通知和令牌存储由应用注入 actions。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * import type { AuthPanelProps } from '@h-ai/ui'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.publicConfig()
 *   if (!result.success) throw new Error(result.error.message)
 *   if (!result.data) throw new Error('Public auth configuration unavailable')
 *   const actions = apiClient.createAuthActions(apiClient)
 *   const example: AuthPanelProps = { config: result.data, actions, initialMode: 'login' }
 * }
 * finally {
 *   await apiClient.close()
 * }
 * ```
 */
export interface AuthPanelProps extends FormLayoutOptions, DataAttributes {
  /** 未取得配置时显示加载状态，只消费 IAM 的公开配置。 */
  config: AuthPanelConfig | null
  /** 由 Kit 或 API client 提供标准动作，组件不处理底层传输。 */
  actions: AuthPanelActions
  initialMode?: AuthPanelMode
  /** 来自重置链接的令牌；未传时显示手动输入框。 */
  resetToken?: string
  loginUrl?: string
  registerUrl?: string
  forgotPasswordUrl?: string
  /** 登录或注册成功后由应用导航或刷新用户资料。 */
  onauthenticated?: () => void | Promise<void>
  /** 公开配置获取失败的提示与重试动作。 */
  error?: string
  onretry?: () => void
  /** 登录表单的头部、扩展字段、底部；底部仍保留内置导航。 */
  loginHeader?: Snippet
  loginFields?: Snippet
  loginFooter?: Snippet
  /** 注册表单的头部、扩展字段、底部；额外字段通过应用状态处理。 */
  registerHeader?: Snippet
  registerFields?: Snippet
  registerFooter?: Snippet
}

/**
 * 用户个人信息字段
 *
 * @example
 * ```ts
 * import type { UserProfileField } from '@h-ai/ui'
 * const example: UserProfileField = 'email'
 * ```
 */
export type UserProfileField = 'avatar' | 'username' | 'email' | 'displayName' | 'nickname' | 'phone' | 'bio'

/**
 * 用户信息
 *
 * @example
 * ```ts
 * import type { UserProfileData } from '@h-ai/ui'
 * const example: UserProfileData = { id: 'u1', username: 'ada', email: 'ada@example.com' }
 * ```
 */
export interface UserProfileData {
  id?: string
  username?: string
  email?: string
  displayName?: string
  nickname?: string
  phone?: string
  avatar?: string
  avatarUrl?: string
  bio?: string
}

/**
 * 个人资料表单的标准提交值；验证和保存由宿主负责。
 *
 * @example
 * ```ts
 * import type { UserProfileSubmitData } from '@h-ai/ui'
 * const example: UserProfileSubmitData = { username: 'ada', email: 'ada@example.com', displayName: 'Ada', phone: '', bio: 'Developer' }
 * ```
 */
export interface UserProfileSubmitData {
  username: string
  email: string
  displayName: string
  phone: string
  bio: string
}

/**
 * 用户个人信息属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { UserProfile } from '@h-ai/ui'
 *   import type { UserProfileProps } from '@h-ai/ui'
 *   const props: UserProfileProps = { user: { id: 'u1', username: 'ada', email: 'ada@example.com' }, fields: ['username', 'email'], editable: true }
 * </script>
 * <UserProfile {...props} />
 * ```
 */
export interface UserProfileProps extends FormLayoutOptions, DataAttributes {
  /** 用户信息 */
  user?: UserProfileData
  /** 是否可编辑 */
  editable?: boolean
  alwaysEditable?: boolean
  /** 加载状态 */
  loading?: boolean
  /** 显示的字段 */
  fields?: UserProfileField[]
  /** 按业务规则声明字段的原生约束，复用控件失焦校验。 */
  fieldConstraints?: Partial<Record<Exclude<UserProfileField, 'avatar'>, Pick<InputProps, 'required' | 'minlength' | 'maxlength' | 'pattern' | 'validationMessage'>>>
  /** 头像上传地址 */
  avatarUploadUrl?: string
  /** 文件选择器允许的头像类型；最终校验由业务上传服务负责。 */
  avatarAccept?: string
  /** 与业务上传限制一致的提示文案。 */
  avatarHint?: string
  /** 自定义类名 */
  class?: string
  /** 错误信息 */
  errors?: Record<string, string>
  /** 保存事件 */
  onsubmit?: (data: UserProfileSubmitData) => void | Promise<void>
  /** 头像变更事件 */
  onavatarchange?: (file: File) => void | Promise<void>
}

// ─── Storage 相关类型 ───

/**
 * 上传状态
 *
 * @example
 * ```ts
 * import type { UploadState } from '@h-ai/ui'
 * const example: UploadState = 'uploading'
 * ```
 */
export type UploadState = 'pending' | 'uploading' | 'success' | 'error'

/**
 * 上传文件信息
 *
 * @example
 * ```ts
 * import type { UploadFile } from '@h-ai/ui'
 * const example: UploadFile = { id: 'upload-1', file: new File(['report'], 'report.txt', { type: 'text/plain' }), name: 'report.txt', size: 6, type: 'text/plain', state: 'pending', progress: 0 }
 * ```
 */
export interface UploadFile {
  /** 唯一 ID */
  id: string
  /** 原始文件 */
  file: File
  /** 文件名 */
  name: string
  /** 文件大小 */
  size: number
  /** 文件类型 */
  type: string
  /** 上传状态 */
  state: UploadState
  /** 上传进度 (0-100) */
  progress: number
  /** 错误信息 */
  error?: string
  /** 上传响应 */
  response?: unknown
}

/**
 * 上传处理器上下文
 *
 * @example
 * ```ts
 * import type { UploadHandlerContext } from '@h-ai/ui'
 * const example: UploadHandlerContext = { signal: new AbortController().signal, onProgress: progress => document.body.setAttribute('data-upload-progress', String(progress)) }
 * ```
 */
export interface UploadHandlerContext {
  /** 组件销毁、文件移除或重试时触发的取消信号 */
  signal: AbortSignal
  /** 汇报 0-100 的上传进度 */
  onProgress: (progress: number) => void
}

/**
 * 上传处理结果
 *
 * @example
 * ```ts
 * import type { UploadHandlerResult } from '@h-ai/ui'
 * const example: UploadHandlerResult = { url: '/files/report.pdf', response: { key: 'reports/report.pdf' } }
 * ```
 */
export interface UploadHandlerResult {
  /** 可展示的最终文件 URL（图片/头像上传必须返回） */
  url?: string
  /** 业务层原始响应（回传到 UploadFile.response） */
  response?: unknown
}

/**
 * 应用层上传处理器。
 *
 * UI 组件只管理选择、校验、进度和预览；签名 URL、认证头与上传协议由应用服务层实现。
 *
 * @example
 * ```ts
 * import type { UploadHandler } from '@h-ai/ui'
 * const upload: UploadHandler = async (file, { signal, onProgress }) => {
 *   const response = await fetch('/api/uploads', { method: 'POST', body: file, signal })
 *   if (!response.ok) throw new Error('Upload failed')
 *   const result: unknown = await response.json()
 *   if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string') throw new Error('Upload response invalid')
 *   onProgress(100)
 *   return { url: result.url }
 * }
 * ```
 */
export type UploadHandler = (file: File, context: UploadHandlerContext) => Promise<UploadHandlerResult>

/**
 * 文件上传属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { FileUpload } from '@h-ai/ui'
 *   import type { FileUploadProps } from '@h-ai/ui'
 *   const props: FileUploadProps = { accept: '.pdf', maxFiles: 3, autoUpload: false }
 * </script>
 * <FileUpload {...props} />
 * ```
 */
export interface FileUploadProps extends DataAttributes {
  /** 接受的文件类型 */
  accept?: string
  /** 最大文件大小 (bytes) */
  maxSize?: number
  /** 最大文件数量 */
  maxFiles?: number
  /** 是否多选 */
  multiple?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 应用层上传处理器；未提供时组件仅选择文件并保持 pending */
  uploadHandler?: UploadHandler
  /** 是否自动上传 */
  autoUpload?: boolean
  /** 是否显示文件列表 */
  showList?: boolean
  /** 是否支持拖拽 */
  dragDrop?: boolean
  /** 自定义类名 */
  class?: string
  /** 文件变化事件 */
  onchange?: (files: UploadFile[]) => void
  /** 上传成功事件 */
  onupload?: (file: UploadFile) => void
  /** 上传失败事件 */
  onerror?: (error: string) => void
  /** 移除文件事件 */
  onremove?: (file: UploadFile) => void
}

/**
 * 文件项
 *
 * @example
 * ```ts
 * import type { FileItem } from '@h-ai/ui'
 * const example: FileItem = { id: 'file-1', name: 'report.pdf', size: 1024, type: 'application/pdf', url: '/files/report.pdf' }
 * ```
 */
export interface FileItem {
  /** 唯一 ID */
  id: string
  /** 文件名 */
  name: string
  /** 文件大小 */
  size: number
  /** 文件类型 */
  type: string
  /** 文件 URL */
  url?: string
  /** 缩略图 URL */
  thumbnailUrl?: string
  /** 更新时间 */
  updatedAt?: Date | string
}

/**
 * 文件列表属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { FileList } from '@h-ai/ui'
 *   import type { FileListProps } from '@h-ai/ui'
 *   const props: FileListProps = { files: [{ id: 'f1', name: 'report.pdf', size: 1024, type: 'application/pdf' }], showSize: true }
 * </script>
 * <FileList {...props} />
 * ```
 */
export interface FileListProps extends DataAttributes {
  /** 文件列表 */
  files?: FileItem[]
  /** 加载状态 */
  loading?: boolean
  /** 是否显示预览 */
  showPreview?: boolean
  /** 是否显示下载 */
  showDownload?: boolean
  /** 是否显示删除 */
  showDelete?: boolean
  /** 是否显示大小 */
  showSize?: boolean
  /** 是否显示日期 */
  showDate?: boolean
  /** 布局模式 */
  layout?: 'list' | 'grid'
  /** 自定义类名 */
  class?: string
  /** 下载事件 */
  ondownload?: (file: FileItem) => void
  /** 删除事件 */
  ondelete?: (file: FileItem) => void
  /** 预览事件 */
  onpreview?: (file: FileItem) => void
}

/**
 * 图片上传属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ImageUpload } from '@h-ai/ui'
 *   import type { ImageUploadProps } from '@h-ai/ui'
 *   const props: ImageUploadProps = { accept: 'image/png,image/jpeg', maxSize: 5 * 1024 * 1024 }
 * </script>
 * <ImageUpload {...props} />
 * ```
 */
export interface ImageUploadProps extends DataAttributes {
  /** 图片 URL */
  value?: string
  /** 接受的文件类型 */
  accept?: string
  /** 最大文件大小 (bytes) */
  maxSize?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 应用层上传处理器；未提供时仅生成本地预览 */
  uploadHandler?: UploadHandler
  /** 占位文本 */
  placeholder?: string
  /** 宽高比 */
  aspectRatio?: string
  /** 宽度 */
  width?: string
  /** 高度 */
  height?: string
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (url: string) => void
  /** 错误事件 */
  onerror?: (error: string) => void
}

/**
 * 头像上传属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { AvatarUpload } from '@h-ai/ui'
 *   import type { AvatarUploadProps } from '@h-ai/ui'
 *   const props: AvatarUploadProps = { fallback: 'A', size: 'lg' }
 * </script>
 * <AvatarUpload {...props} />
 * ```
 */
export interface AvatarUploadProps extends DataAttributes {
  /** 头像 URL */
  value?: string
  /** 尺寸 */
  size?: Size
  /** 接受的文件类型 */
  accept?: string
  /** 最大文件大小 (bytes) */
  maxSize?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 应用层上传处理器；未提供时仅生成本地预览 */
  uploadHandler?: UploadHandler
  /** 默认文字（没有图片时显示） */
  fallback?: string
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (url: string) => void
  /** 错误事件 */
  onerror?: (error: string) => void
}

// ─── Crypto 相关类型 ───

/**
 * 加密输入框属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { EncryptedInput } from '@h-ai/ui'
 *   import type { EncryptedInputProps } from '@h-ai/ui'
 *   const props: EncryptedInputProps = { value: '', algorithm: 'SM2', showEncrypted: false }
 * </script>
 * <EncryptedInput {...props} />
 * ```
 */
export interface EncryptedInputProps extends DataAttributes {
  /** 原始值 */
  value?: string
  /** 加密后的值 */
  encryptedValue?: string
  /** 占位符 */
  placeholder?: string
  /** 尺寸 */
  size?: Size
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readonly?: boolean
  /** 是否显示加密结果 */
  showEncrypted?: boolean
  /** 加密算法 */
  algorithm?: 'SM2' | 'SM4'
  /** 加密函数 */
  onencrypt?: (value: string) => Promise<string>
  /** 自定义类名 */
  class?: string
  /** 输入事件 */
  oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
  /** 变化事件 */
  onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
}

/**
 * 哈希展示属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { HashDisplay } from '@h-ai/ui'
 *   import type { HashDisplayProps } from '@h-ai/ui'
 *   const props: HashDisplayProps = { value: 'example-digest', algorithm: 'SM3', copyable: true }
 * </script>
 * <HashDisplay {...props} />
 * ```
 */
export interface HashDisplayProps extends DataAttributes {
  /** 哈希值 */
  value?: string
  /** 算法 */
  algorithm?: 'SM3'
  /** 标签 */
  label?: string
  /** 是否可复制 */
  copyable?: boolean
  /** 是否截断显示 */
  truncate?: boolean
  /** 截断长度 */
  truncateLength?: number
  /** i18n 文案配置 */
  labels?: {
    copyHash?: string
  }
  /** 自定义类名 */
  class?: string
}

// ─── AI 相关类型 ───

/**
 * Markdown 渲染器属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { MarkdownRenderer } from '@h-ai/ui'
 *   import type { MarkdownRendererProps } from '@h-ai/ui'
 *   const props: MarkdownRendererProps = { content: '# 标题\n正文', allowHtmlTags: false }
 * </script>
 * <MarkdownRenderer {...props} />
 * ```
 */
export interface MarkdownRendererProps extends DataAttributes {
  /** Markdown 源文本 */
  content?: string
  /** 文本字号，支持 number（按 px）或任意 CSS 长度字符串 */
  fontSize?: string | number
  /** 自定义类名 */
  class?: string
  /** 是否显示代码块复制按钮（默认 true） */
  showCopyButton?: boolean
  /** 是否启用代码语法高亮（默认 true） */
  enableHighlight?: boolean
  /** 是否将换行符转换为 <br>（默认 true，适合 AI 输出） */
  breaks?: boolean
  /** 是否按安全白名单解析原始 HTML 标签（默认 false） */
  allowHtmlTags?: boolean
}
/**
 * 签名展示属性
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { SignatureDisplay } from '@h-ai/ui'
 *   import type { SignatureDisplayProps } from '@h-ai/ui'
 *   const props: SignatureDisplayProps = { signature: 'example-signature', verified: false, showPublicKey: false }
 * </script>
 * <SignatureDisplay {...props} />
 * ```
 */
export interface SignatureDisplayProps extends DataAttributes {
  /** 签名值 */
  signature?: string
  /** 公钥 */
  publicKey?: string
  /** 算法 */
  algorithm?: 'SM2'
  /** 验证状态 */
  verified?: boolean
  /** 是否显示公钥 */
  showPublicKey?: boolean
  /** 是否可复制 */
  copyable?: boolean
  /** i18n 文案配置 */
  labels?: {
    signature?: string
    publicKey?: string
    verified?: string
    verifyFailed?: string
    notVerified?: string
    noSignature?: string
    copySignature?: string
    copyPublicKey?: string
  }
  /** 自定义类名 */
  class?: string
}
