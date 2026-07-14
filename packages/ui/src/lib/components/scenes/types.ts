/**
 * @h-ai/ui — 场景组件类型定义
 *
 * 场景化组件的 Props 类型
 * @module types
 */

import type { Snippet } from 'svelte'
import type { DataAttributes, Size } from '../../types.js'

// ─── IAM 相关类型 ───

/**
 * 密码输入框属性
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
  error?: string
  /** 是否显示切换按钮 */
  showToggle?: boolean
  /** 是否显示密码强度 */
  showStrength?: boolean
  /** 最小长度 */
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
 */
export interface AgreementDisplay {
  /** 用户协议 URL */
  userAgreementUrl?: string
  /** 隐私协议 URL */
  privacyPolicyUrl?: string
}

/**
 * 登录表单数据
 */
export interface LoginFormData {
  username: string
  password: string
  rememberMe: boolean
}

/**
 * 登录表单属性
 */
export interface LoginFormProps extends DataAttributes {
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示标题 */
  showTitle?: boolean
  /** 是否显示记住我 */
  showRememberMe?: boolean
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
  /** 底部插槽 */
  footer?: Snippet
}

/**
 * 注册表单字段
 */
export type RegisterField = 'username' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'nickname'

/**
 * 注册表单数据
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
 */
export interface RegisterFormProps extends DataAttributes {
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
  /** 底部插槽 */
  footer?: Snippet
}

/**
 * 修改密码表单数据
 */
export interface ChangePasswordFormData {
  oldPassword?: string
  newPassword: string
  confirmPassword: string
}

/**
 * 修改密码表单属性
 */
export interface ChangePasswordFormProps extends DataAttributes {
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
 */
export interface ForgotPasswordFormData {
  email?: string
  phone?: string
}

/**
 * 找回密码表单属性
 */
export interface ForgotPasswordFormProps extends DataAttributes {
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
 */
export interface ResetPasswordFormData {
  code?: string
  newPassword: string
  confirmPassword: string
}

/**
 * 重置密码表单属性
 */
export interface ResetPasswordFormProps extends DataAttributes {
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
 * 用户个人信息字段
 */
export type UserProfileField = 'avatar' | 'username' | 'email' | 'displayName' | 'nickname' | 'phone' | 'bio'

/**
 * 用户信息
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

export interface UserProfileSubmitData {
  username: string
  email: string
  displayName: string
  phone: string
  bio: string
}

/**
 * 用户个人信息属性
 */
export interface UserProfileProps extends DataAttributes {
  /** 用户信息 */
  user?: UserProfileData
  /** 是否可编辑 */
  editable?: boolean
  alwaysEditable?: boolean
  /** 加载状态 */
  loading?: boolean
  /** 显示的字段 */
  fields?: UserProfileField[]
  /** 头像上传地址 */
  avatarUploadUrl?: string
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
 */
export type UploadState = 'pending' | 'uploading' | 'success' | 'error'

/**
 * 上传文件信息
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

/** 上传处理器上下文 */
export interface UploadHandlerContext {
  /** 组件销毁、文件移除或重试时触发的取消信号 */
  signal: AbortSignal
  /** 汇报 0-100 的上传进度 */
  onProgress: (progress: number) => void
}

/** 上传处理结果 */
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
 */
export type UploadHandler = (file: File, context: UploadHandlerContext) => Promise<UploadHandlerResult>

/**
 * 文件上传属性
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
