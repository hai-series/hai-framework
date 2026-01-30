/**
 * =============================================================================
 * @hai/ui - 场景组件类型定义
 * =============================================================================
 * 场景化组件的 Props 类型
 * =============================================================================
 */

import type { Snippet } from 'svelte'
import type { Size } from '../../types.js'

// =============================================================================
// IAM 相关类型
// =============================================================================

/**
 * 密码输入框属性
 */
export interface PasswordInputProps {
  /** 值 */
  value?: string
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
export interface LoginFormProps {
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示记住我 */
  showRememberMe?: boolean
  /** 是否显示忘记密码 */
  showForgotPassword?: boolean
  /** 忘记密码链接 */
  forgotPasswordUrl?: string
  /** 用户名标签 */
  usernameLabel?: string
  /** 用户名占位符 */
  usernamePlaceholder?: string
  /** 密码标签 */
  passwordLabel?: string
  /** 密码占位符 */
  passwordPlaceholder?: string
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
export interface RegisterFormProps {
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示密码强度 */
  showPasswordStrength?: boolean
  /** 是否需要确认密码 */
  requireConfirmPassword?: boolean
  /** 最小密码长度 */
  minPasswordLength?: number
  /** 显示的字段 */
  fields?: RegisterField[]
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
export interface ChangePasswordFormProps {
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
export interface ForgotPasswordFormProps {
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 找回方式 */
  mode?: 'email' | 'phone'
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
export interface ResetPasswordFormProps {
  /** 加载状态 */
  loading?: boolean
  /** 禁用状态 */
  disabled?: boolean
  /** 是否显示验证码 */
  showCode?: boolean
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
  onsubmit?: (data: ResetPasswordFormData) => void | Promise<void>
}

/**
 * 用户个人信息字段
 */
export type UserProfileField = 'avatar' | 'username' | 'email' | 'nickname' | 'phone' | 'bio'

/**
 * 用户信息
 */
export interface UserProfileData {
  id?: string
  username?: string
  email?: string
  nickname?: string
  phone?: string
  avatar?: string
  bio?: string
}

/**
 * 用户个人信息属性
 */
export interface UserProfileProps {
  /** 用户信息 */
  user?: UserProfileData
  /** 是否可编辑 */
  editable?: boolean
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
  onsubmit?: (data: Record<string, string>) => void | Promise<void>
  /** 头像变更事件 */
  onavatarchange?: (file: File) => void | Promise<void>
}

// =============================================================================
// Storage 相关类型
// =============================================================================

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

/**
 * 文件上传属性
 */
export interface FileUploadProps {
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
  /** 上传地址 */
  uploadUrl?: string
  /** 签名 URL 地址 */
  presignUrl?: string
  /** 请求头 */
  headers?: Record<string, string>
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
export interface FileListProps {
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
export interface ImageUploadProps {
  /** 图片 URL */
  value?: string
  /** 接受的文件类型 */
  accept?: string
  /** 最大文件大小 (bytes) */
  maxSize?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 上传地址 */
  uploadUrl?: string
  /** 签名 URL 地址 */
  presignUrl?: string
  /** 请求头 */
  headers?: Record<string, string>
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
export interface AvatarUploadProps {
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
  /** 上传地址 */
  uploadUrl?: string
  /** 签名 URL 地址 */
  presignUrl?: string
  /** 请求头 */
  headers?: Record<string, string>
  /** 默认文字（没有图片时显示） */
  fallback?: string
  /** 自定义类名 */
  class?: string
  /** 变化事件 */
  onchange?: (url: string) => void
  /** 错误事件 */
  onerror?: (error: string) => void
}

// =============================================================================
// Crypto 相关类型
// =============================================================================

/**
 * 加密输入框属性
 */
export interface EncryptedInputProps {
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
  algorithm?: 'SM2' | 'SM4' | 'AES'
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
export interface HashDisplayProps {
  /** 哈希值 */
  value?: string
  /** 算法 */
  algorithm?: 'SM3' | 'SHA256' | 'MD5'
  /** 标签 */
  label?: string
  /** 是否可复制 */
  copyable?: boolean
  /** 是否截断显示 */
  truncate?: boolean
  /** 截断长度 */
  truncateLength?: number
  /** 自定义类名 */
  class?: string
}

/**
 * 签名展示属性
 */
export interface SignatureDisplayProps {
  /** 签名值 */
  signature?: string
  /** 公钥 */
  publicKey?: string
  /** 算法 */
  algorithm?: 'SM2' | 'RSA' | 'ECDSA'
  /** 验证状态 */
  verified?: boolean
  /** 是否显示公钥 */
  showPublicKey?: boolean
  /** 是否可复制 */
  copyable?: boolean
  /** 自定义类名 */
  class?: string
}
