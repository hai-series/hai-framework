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
import type { ProviderConfig, ReachConfig, ReachConfigInput, ReachErrorCodeType } from './reach-config.js'

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
 * - `api` — API 回调
 */
export type ReachChannel = 'email' | 'sms' | 'api'

// =============================================================================
// 消息与模板
// =============================================================================

/**
 * 触达消息（发送请求）
 *
 * 通过 `provider` 字段指定目标 Provider，通过 `template` 字段指定模板。
 *
 * @example
 * ```ts
 * // 使用模板发送邮件
 * const msg: ReachMessage = {
 *   provider: 'email',
 *   to: 'user@example.com',
 *   template: 'welcome',
 *   vars: { userName: '张三' },
 * }
 *
 * // 使用模板发送短信
 * const msg: ReachMessage = {
 *   provider: 'sms',
 *   to: '13800138000',
 *   template: 'verification_code',
 *   vars: { code: '123456' },
 * }
 * ```
 */
export interface ReachMessage {
  /** 目标 Provider 名称（对应 Provider 配置中的 name） */
  provider: string
  /** 接收方（邮箱地址或手机号） */
  to: string
  /** 邮件主题（直接发送时使用） */
  subject?: string
  /** 消息正文（直接发送时使用） */
  body?: string
  /** 模板名称（使用模板发送时指定） */
  template?: string
  /** 模板变量（使用模板发送时传入） */
  vars?: Record<string, string>
  /** Provider 扩展参数（如短信 Provider 的模板编码、签名等） */
  extra?: Record<string, unknown>
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
 * 每个模板绑定到一个 Provider，发送时按模板中的 `provider` 路由。
 *
 * @example
 * ```ts
 * const template: ReachTemplate = {
 *   name: 'verification_code',
 *   provider: 'email',
 *   subject: '验证码: {code}',
 *   body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
 * }
 * ```
 */
export interface ReachTemplate {
  /** 模板名称（唯一标识） */
  name: string
  /** 绑定的 Provider 名称 */
  provider: string
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
   *   provider: 'email',
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
 * // 初始化（同时注册多个 Provider）
 * await reach.init({
 *   providers: [
 *     { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'no-reply@example.com' },
 *     { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '...' },
 *   ],
 * })
 *
 * // 注册模板（绑定到 Provider）
 * reach.template.register({
 *   name: 'welcome',
 *   provider: 'email',
 *   subject: '欢迎 {userName}',
 *   body: '亲爱的 {userName}，欢迎使用我们的服务！',
 * })
 *
 * // 发送（指定 Provider）
 * await reach.send({ provider: 'email', to: 'user@example.com', template: 'welcome', vars: { userName: '张三' } })
 *
 * // 关闭
 * await reach.close()
 * ```
 */
export interface ReachFunctions extends SendOperations {
  /** 初始化触达模块（注册多个 Provider） */
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
 * 由具体实现（console / smtp / aliyun-sms / api）提供。
 */
export interface ReachProvider {
  /** Provider 名称 */
  readonly name: string
  /** 连接/初始化 Provider */
  connect: (config: ProviderConfig) => Promise<Result<void, ReachError>>
  /** 发送消息 */
  send: (message: ReachMessage) => Promise<Result<SendResult, ReachError>>
  /** 关闭连接 */
  close: () => Promise<void>
  /** 是否已连接 */
  isConnected: () => boolean
}
