/**
 * =============================================================================
 * @h-ai/reach - 类型定义
 * =============================================================================
 *
 * 本文件定义触达模块的核心接口和类型。
 *
 * 包含：
 * - 错误类型（ReachError）
 * - 消息与模板（ReachMessage、ReachTemplate、RenderedTemplate）
 * - 发送操作接口（SendOperations）
 * - 模板注册表接口（ReachTemplateRegistry）
 * - 服务函数接口（ReachFunctions）
 * - Provider 接口（ReachProvider）
 *
 * @module reach-types
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ReachConfig, ReachConfigInput, ReachErrorCodeType } from './reach-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 触达模块错误接口
 */
export interface ReachError {
  /** 错误码（参见 ReachErrorCode） */
  code: ReachErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// 渠道类型
// =============================================================================

/**
 * 触达渠道类型
 *
 * - `email` — 邮件
 * - `sms` — 短信
 */
export type ReachChannel = 'email' | 'sms'

// =============================================================================
// 消息与模板
// =============================================================================

/**
 * 触达消息（发送请求）
 *
 * @example
 * ```ts
 * // 直接指定内容
 * const msg: ReachMessage = {
 *   channel: 'email',
 *   to: 'user@example.com',
 *   subject: '欢迎',
 *   body: '欢迎使用我们的服务！',
 * }
 *
 * // 使用模板
 * const msg: ReachMessage = {
 *   channel: 'sms',
 *   to: '13800138000',
 *   template: 'verification_code',
 *   vars: { code: '123456' },
 * }
 * ```
 */
export interface ReachMessage {
  /** 触达渠道 */
  channel: ReachChannel
  /** 接收方（邮箱地址或手机号） */
  to: string
  /** 邮件主题（仅 email 渠道，直接发送时使用） */
  subject?: string
  /** 消息正文（直接发送时使用） */
  body?: string
  /** 模板名称（使用模板发送时指定） */
  template?: string
  /** 模板变量（使用模板发送时传入） */
  vars?: Record<string, string>
  /** 阿里云短信模板编码（仅 aliyun-sms 使用） */
  templateCode?: string
}

/**
 * 发送结果
 */
export interface SendResult {
  /** 是否发送成功 */
  success: boolean
  /** Provider 返回的消息 ID（如有） */
  messageId?: string
}

/**
 * 触达模板定义
 *
 * @example
 * ```ts
 * const template: ReachTemplate = {
 *   name: 'verification_code',
 *   subject: '验证码: {code}',
 *   body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
 * }
 * ```
 */
export interface ReachTemplate {
  /** 模板名称（唯一标识） */
  name: string
  /** 邮件主题模板（支持 `{var}` 占位符，仅 email） */
  subject?: string
  /** 消息正文模板（支持 `{var}` 占位符） */
  body: string
}

/**
 * 渲染后的模板
 */
export interface RenderedTemplate {
  /** 渲染后的主题 */
  subject?: string
  /** 渲染后的正文 */
  body: string
}

// =============================================================================
// 操作接口
// =============================================================================

/**
 * 发送操作接口
 */
export interface SendOperations {
  /**
   * 发送触达消息
   *
   * @param message - 触达消息
   * @returns 发送结果
   *
   * @example
   * ```ts
   * const result = await reach.send({
   *   channel: 'email',
   *   to: 'user@example.com',
   *   template: 'welcome',
   *   vars: { userName: '张三' },
   * })
   * ```
   */
  send: (message: ReachMessage) => Promise<Result<SendResult, ReachError>>
}

// =============================================================================
// 模板注册表接口
// =============================================================================

/**
 * 模板注册表接口
 */
export interface ReachTemplateRegistry {
  /** 注册单个模板 */
  register: (template: ReachTemplate) => void
  /** 批量注册模板 */
  registerMany: (templates: ReachTemplate[]) => void
  /** 获取模板（不存在返回 undefined） */
  get: (name: string) => ReachTemplate | undefined
  /** 检查模板是否存在 */
  has: (name: string) => boolean
  /** 列出所有已注册的模板 */
  list: () => ReachTemplate[]
  /** 渲染模板 */
  render: (name: string, vars: Record<string, string>) => Result<RenderedTemplate, ReachError>
}

// =============================================================================
// 函数接口
// =============================================================================

/**
 * 触达模块函数接口
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 *
 * // 初始化
 * await reach.init({ type: 'smtp', host: 'smtp.example.com', from: 'no-reply@example.com' })
 *
 * // 注册模板
 * reach.template.register({
 *   name: 'welcome',
 *   subject: '欢迎 {userName}',
 *   body: '亲爱的 {userName}，欢迎使用我们的服务！',
 * })
 *
 * // 发送
 * await reach.send({ channel: 'email', to: 'user@example.com', template: 'welcome', vars: { userName: '张三' } })
 *
 * // 关闭
 * await reach.close()
 * ```
 */
export interface ReachFunctions extends SendOperations {
  /** 初始化触达模块 */
  init: (config: ReachConfigInput) => Promise<Result<void, ReachError>>
  /** 当前配置（未初始化时为 null） */
  readonly config: ReachConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 模板注册表 */
  readonly template: ReachTemplateRegistry
  /** 关闭连接并释放资源 */
  close: () => Promise<void>
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 触达 Provider 接口
 *
 * 由具体实现（console / smtp / aliyun-sms）提供。
 */
export interface ReachProvider extends SendOperations {
  /** Provider 名称 */
  readonly name: string
  /** 连接/初始化 Provider */
  connect: (config: ReachConfig) => Promise<Result<void, ReachError>>
  /** 关闭连接 */
  close: () => Promise<void>
  /** 是否已连接 */
  isConnected: () => boolean
}
