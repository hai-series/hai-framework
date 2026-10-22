/**
 * @h-ai/reach — 类型定义
 *
 * 本文件定义触达模块的核心接口和类型。
 * @module reach-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { ProviderConfig, ReachConfig, ReachConfigInput } from './reach-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const ReachErrorInfo = {
  SEND_FAILED: '001:500',
  TEMPLATE_NOT_FOUND: '002:404',
  TEMPLATE_RENDER_FAILED: '003:500',
  INVALID_RECIPIENT: '004:400',
  PROVIDER_NOT_FOUND: '005:500',
  DND_BLOCKED: '006:403',
  NOT_INITIALIZED: '010:500',
  UNSUPPORTED_TYPE: '011:400',
  CONFIG_ERROR: '012:500',
  DELIVERY_REJECTED: '020:422',
} as const satisfies ErrorInfo

export const HaiReachError = core.error.buildHaiErrorsDef('reach', ReachErrorInfo)

// ─── 渠道类型 ───

/**
 * 触达渠道类型
 *
 * - `email` — 邮件
 * - `sms` — 短信
 * - `api` — API 回调
 */
export type ReachChannel = 'email' | 'sms' | 'api'

// ─── 消息与模板 ───

/**
 * 触达消息（发送请求）
 *
 * 通过 `provider` 字段指定目标 Provider，通过 `template` 字段指定模板。
 *
 * @example
 * ```ts
 * // 使用模板发送邮件
 * const msg: ReachMessage = {
 *   to: 'user@example.com',
 *   template: 'welcome',
 *   vars: { userName: '张三' },
 * }
 *
 * // 使用模板发送短信
 * const msg: ReachMessage = {
 *   to: '13800138000',
 *   template: 'verification_code',
 *   vars: { code: '123456' },
 * }
 * ```
 */
export interface ReachMessage {
  /** 目标 Provider 名称；模板发送可省略，直接发送必须提供。 */
  provider?: string
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
  /** API 接收端幂等键；直接发送可指定，队列投递固定使用持久化 queueId。 */
  idempotencyKey?: string
}

/**
 * 发送或可靠入队结果；deferred 不代表已完成外部投递。
 *
 * @example
 * ```ts
 * const result = await reach.send(message)
 * if (result.success && result.data.deferred) {
 *   trackPendingMessage(result.data.queueId)
 * }
 * ```
 */
export type SendResult = {
  /** 是否已完成 Provider 发送或可靠入队；具体状态同时检查 deferred。 */
  success: boolean
  /** Provider 返回的消息 ID（如有） */
  messageId?: string
} & ({
  /** 已可靠入队，尚未投递。 */
  deferred: true
  /** 持久化回执 UUID，对应 hai_reach_send_log.queue_id。 */
  queueId: string
} | {
  /** Provider 即时发送结果，不含入队回执。 */
  deferred?: false
  queueId?: never
})

/**
 * 队列状态；unknown 表示外部投递可能已经生效，禁止重排；dead 停止自动处理，可条件人工恢复。
 * @example const status: ReachQueueStatus = 'unknown'
 */
export type ReachQueueStatus = 'pending' | 'processing' | 'sending' | 'unknown' | 'sent' | 'discarded' | 'dead'

/**
 * 持久化的失败分类，不含 Provider 响应正文、凭据或收件人。
 * @example const reason: ReachQueueFailure = 'provider_unavailable'
 */
export type ReachQueueFailure = 'provider_unavailable' | 'invalid_message' | 'permanent_rejection' | 'transient_failure' | 'attempts_exhausted'

/**
 * 不包含收件人与正文的队列查询结果。
 * @example const result = await reach.queue.get(queueId)
 */
export interface ReachQueueEntry {
  /** 持久化入队回执。 */
  queueId: string
  /** Provider 配置名称。 */
  provider: string
  /** 当前处理状态。 */
  status: ReachQueueStatus
  /** 最近更新时间（Unix 毫秒）。 */
  updatedAt?: number
  /** 外部 Provider 确认的消息编号。 */
  messageId?: string
  /** 已领取次数；节点崩溃后的重新领取也计数。 */
  attemptCount: number
  /** 此条消息持久保存的自动领取上限。 */
  maxAttempts: number
  /** 下次允许自动领取的 Unix 毫秒时间；终态为 0。 */
  nextAttemptAt: number
  /** 最近失败分类，便于可信运维流程排查与修复。 */
  lastFailure?: ReachQueueFailure
}

/**
 * 有界查询死信或未知结果，应用须先校验服务端运维权限。
 * @example const options: ReachQueueListOptions = { status: 'dead', limit: 50 }
 */
export interface ReachQueueListOptions {
  /** 需要人工处理的状态。 */
  status: 'dead' | 'unknown'
  /** 每页 1–100 条，默认 50。 */
  limit?: number
  /** 跳过条数，默认 0，上限 1000000。 */
  offset?: number
}

/**
 * 修复根因后恢复死信的条件输入；unknown 不允许使用此操作。
 * @example await reach.queue.requeueDead(queueId, { expectedUpdatedAt: entry.updatedAt! })
 */
export interface ReachDeadRequeue {
  /** 必须等于最近查询的更新时间，阻止并发及过时请求。 */
  expectedUpdatedAt: number
}

/**
 * 对未知投递结果的人工裁定；不提供自动重发选项。
 * @example await reach.queue.resolveUnknown(queueId, { status: 'sent', messageId: verifiedId })
 */
export interface ReachUnknownResolution {
  /** 经外部核对确认已投递，或终止后续处理。discarded 不撤销已经开始的外部请求。 */
  status: 'sent' | 'discarded'
  /** 确认已投递时，可记录 Provider 消息编号，最多 255 个字符。 */
  messageId?: string
}

/**
 * 队列运维操作；应用应在受权限保护的服务端流程中调用。
 * @example const state = await reach.queue.get(queueId)
 */
export interface ReachQueueOperations {
  /**
   * 按回执查询队列状态。
   * @example const result = await reach.queue.get(queueId)
   */
  get: (queueId: string) => Promise<HaiResult<ReachQueueEntry | null>>
  /**
   * 分页查询死信或未知结果，仅返回运维元数据。
   * @example const page = await reach.queue.list({ status: 'dead', limit: 50 })
   */
  list: (options: ReachQueueListOptions) => Promise<HaiResult<ReachQueueEntry[]>>
  /**
   * 修复根因并确认接收端幂等契约后恢复 dead；重置计数，保留 queueId/策略。unknown 不能重排。
   * @example await reach.queue.requeueDead(queueId, { expectedUpdatedAt: entry.updatedAt! })
   */
  requeueDead: (queueId: string, options: ReachDeadRequeue) => Promise<HaiResult<void>>
  /**
   * 停止/隔离旧 worker 并核对外部投递记录后，裁定 unknown；不重新发送。
   * @example await reach.queue.resolveUnknown(queueId, { status: 'discarded' })
   */
  resolveUnknown: (queueId: string, resolution: ReachUnknownResolution) => Promise<HaiResult<void>>
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

// ─── 操作接口 ───

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
  send: (message: ReachMessage) => Promise<HaiResult<SendResult>>
}

// ─── 模板注册表接口 ───

/**
 * 模板注册表接口
 *
 * 所有模板通过数据库持久化存储，避免节点间状态不一致。
 * 配置文件中的模板在 init 时写入数据库。
 */
export interface ReachTemplateRegistry {
  /** 按名称解析模板 */
  resolve: (name: string) => Promise<HaiResult<ReachTemplate>>
  /** 保存模板到数据库（upsert） */
  save: (template: ReachTemplate) => Promise<HaiResult<void>>
  /** 批量保存模板到数据库 */
  saveBatch: (templates: ReachTemplate[]) => Promise<HaiResult<void>>
  /** 从数据库删除模板 */
  remove: (name: string) => Promise<HaiResult<void>>
  /** 列出所有模板 */
  list: () => Promise<HaiResult<ReachTemplate[]>>
  /** 渲染模板（从数据库解析后渲染） */
  render: (name: string, vars: Record<string, string>) => Promise<HaiResult<RenderedTemplate>>
}

// ─── 函数接口 ───

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
 * // 保存模板（绑定到 Provider）
 * await reach.template.save({
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
  /** 持久化队列查询、死信恢复与未知结果人工裁定。 */
  readonly queue: ReachQueueOperations
  /** 初始化触达模块（注册多个 Provider） */
  init: (config: ReachConfigInput) => Promise<HaiResult<void>>
  /** 当前脱敏后的配置快照（未初始化时为 null） */
  readonly config: ReachConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 模板注册表 */
  readonly template: ReachTemplateRegistry
  /** 关闭连接并释放资源 */
  close: () => Promise<void>
}

// ─── Provider 接口 ───

/**
 * 触达 Provider 接口
 *
 * 由具体实现（console / smtp / aliyun-sms / api）提供。
 */
export interface ReachProvider {
  /** Provider 名称 */
  readonly name: string
  /** 是否具备接收端幂等保障；true 时必须按 message.idempotencyKey 对副作用持久化去重。 */
  readonly supportsIdempotency: boolean
  /** 连接/初始化 Provider */
  connect: (config: ProviderConfig) => Promise<HaiResult<void>>
  /** 发送消息 */
  send: (message: ReachMessage) => Promise<HaiResult<SendResult>>
  /** 关闭连接 */
  close: () => Promise<void>
  /** 是否已连接 */
  isConnected: () => boolean
}
