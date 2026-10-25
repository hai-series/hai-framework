/**
 * @h-ai/reach — 类型定义
 *
 * 本文件定义触达模块的核心接口和类型。
 * @module reach-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { ReachConfig, ReachConfigInput } from './reach-config.js'
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
  MESSAGE_EXPIRED: '021:410',
} as const satisfies ErrorInfo

/**
 * Reach标准错误集合；DND拒绝、发送失败与配置错误均通过HaiResult判断，不把失败当已入队。
 *
 * @example
 * ```ts
 * import { reach, HaiReachError } from '@h-ai/reach'
 * const result = await reach.send({ provider: 'webhook', to: 'user@example.com', body: 'hello' })
 * if (!result.success && result.error.code === HaiReachError.NOT_INITIALIZED.code) {
 *   // 先执行依赖初始化，不能把未初始化失败当作触达成功。
 *   const message = result.error.message
 * }
 * ```
 */
export const HaiReachError = core.error.buildHaiErrorsDef('reach', ReachErrorInfo)

// ─── 渠道类型 ───

/**
 * 渠道语义标签email/sms/api；消息路由实际使用配置中的Provider名称。
 *
 * @example
 * ```ts
 * import type { ReachChannel } from '@h-ai/reach'
 * const channel: ReachChannel = 'api'
 * ```
 */
export type ReachChannel = 'email' | 'sms' | 'api'

// ─── 消息与模板 ───

/**
 * 直接发送必须指定Provider名和内容；模板发送可由持久模板推导路由，vars做文本替换。
 * 队列幂等键固定为持久queueId；直接调用的业务重试由应用提供稳定idempotencyKey并核验接收端契约。
 *
 * @example
 * ```ts
 * import type { ReachMessage } from '@h-ai/reach'
 * const message: ReachMessage = { provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } }
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
  /** 凭据通知只在内存中投递；正文、变量、收件人不持久化，不进入延迟或重投队列。 */
  sensitive?: boolean
  /** sensitive=true 时必填的凭据截止时间（Unix 毫秒），不延长业务凭据有效期。 */
  expiresAt?: number
  /** 遇到免打扰时交给 Reach 队列，或返回 DND_BLOCKED 让已有业务 outbox 延后；默认 queue。 */
  deferPolicy?: 'queue' | 'reject'
}

/**
 * 发送或可靠入队结果；deferred=true只证明持久pending写入成功，queueId用于后续查询，不代表已送达。
 *
 * @example
 * ```ts
 * import { reach, type SendResult } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', body: 'hello' })
 *     if (!result.success) throw new Error(result.error.message)
 *     const outcome: SendResult = result.data
 *     if (outcome.deferred) {
 *       const queued = await reach.queue.get(outcome.queueId)
 *       if (!queued.success) throw new Error(queued.error.message)
 *     }
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export type SendResult = {
  /** 无载荷凭据回执，可通过 queue.get 查询；不代表进入延迟队列。 */
  receiptId?: string
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
 * 持久队列状态；sending已开始外部效果，非幂等失败/失租约进unknown禁止自动重发；dead停止自动处理但可条件恢复。
 *
 * @example
 * ```ts
 * import type { ReachQueueStatus } from '@h-ai/reach'
 * const status: ReachQueueStatus = 'unknown'
 * ```
 */
export type ReachQueueStatus = 'pending' | 'processing' | 'sending' | 'unknown' | 'sent' | 'discarded' | 'dead'

/**
 * 有界失败分类，不保存Provider响应正文、凭据或收件人；用于修复根因和处置死信。
 *
 * @example
 * ```ts
 * import type { ReachQueueFailure } from '@h-ai/reach'
 * const failure: ReachQueueFailure = 'provider_unavailable'
 * ```
 */
export type ReachQueueFailure = 'provider_unavailable' | 'invalid_message' | 'permanent_rejection' | 'transient_failure' | 'attempts_exhausted'

/**
 * 不含消息正文/收件人的队列运维快照；时间为安全整数Unix毫秒，计数/策略来自持久消息。
 *
 * @example
 * ```ts
 * import { reach, type ReachQueueEntry } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const listed = await reach.queue.list({ status: 'dead', limit: 10 })
 *     if (!listed.success) throw new Error(listed.error.message)
 *     const entry: ReachQueueEntry | undefined = listed.data[0]
 *     if (entry) { const attempts = entry.attemptCount }
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
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
 * 仅列出需人工处理的dead/unknown；分页有界，不提供凭据或替代运维权限。
 *
 * @example
 * ```ts
 * import { reach, type ReachQueueListOptions } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const options: ReachQueueListOptions = { status: 'unknown', limit: 10, offset: 0 }
 *     const listed = await reach.queue.list(options)
 *     if (!listed.success) throw new Error(listed.error.message)
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
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
 * dead条件恢复输入；expectedUpdatedAt必须来自最近快照，不能用本机当前时间冒充版本。
 * 先修根因并确认旧执行与接收端幂等边界，unknown不能重排。
 *
 * @example
 * ```ts
 * import { reach, type ReachDeadRequeue } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const listed = await reach.queue.list({ status: 'dead', limit: 10 })
 *     if (!listed.success) throw new Error(listed.error.message)
 *     const entry = listed.data[0]
 *     if (entry && entry.updatedAt !== undefined) {
 *       const options: ReachDeadRequeue = { expectedUpdatedAt: entry.updatedAt }
 *       // 此调用仅在受信运维流程核验完成后执行。
 *       const restored = await reach.queue.requeueDead(entry.queueId, options)
 *       if (!restored.success) throw new Error(restored.error.message)
 *     }
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface ReachDeadRequeue {
  /** 必须等于最近查询的更新时间，阻止并发及过时请求。 */
  expectedUpdatedAt: number
}

/**
 * unknown人工裁定，不提供自动重发；先校验运维权限、停止/隔离旧worker并核对Provider实际记录。
 * discarded只终止后续处理，不能撤销已开始的外部请求或已发送消息。
 *
 * @example
 * ```ts
 * import { reach, type ReachUnknownResolution } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const listed = await reach.queue.list({ status: 'unknown', limit: 10 })
 *     if (!listed.success) throw new Error(listed.error.message)
 *     const entry = listed.data[0]
 *     if (entry) {
 *       // 可信运维前置：旧worker已隔离且外部投递记录已核对。
 *       const resolution: ReachUnknownResolution = { status: 'discarded' }
 *       const resolved = await reach.queue.resolveUnknown(entry.queueId, resolution)
 *       if (!resolved.success) throw new Error(resolved.error.message)
 *     }
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface ReachUnknownResolution {
  /** 经外部核对确认已投递，或终止后续处理。discarded 不撤销已经开始的外部请求。 */
  status: 'sent' | 'discarded'
  /** 确认已投递时，可记录 Provider 消息编号，最多 255 个字符。 */
  messageId?: string
}

/**
 * 受信服务端队列运维入口，需应用先授权；只查询安全元数据，恢复/裁定均由数据库条件提交。
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const listed = await reach.queue.list({ status: 'unknown', limit: 10 })
 *     if (!listed.success) throw new Error(listed.error.message)
 *     const count = listed.data.length
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface ReachQueueOperations {
  /**
   * 按回执查询队列状态。
   * @param queueId - 持久UUID回执，不代替运维权限。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.queue.get('00000000-0000-4000-8000-000000000001')
   *     if (!result.success) throw new Error(result.error.message)
   *     if (result.data) { const status = result.data.status }
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  get: (queueId: string) => Promise<HaiResult<ReachQueueEntry | null>>
  /**
   * 分页查询死信或未知结果，仅返回运维元数据。
   * @param options - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const listed = await reach.queue.list({ status: 'unknown', limit: 10 })
   *     if (!listed.success) throw new Error(listed.error.message)
   *     const count = listed.data.length
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  list: (options: ReachQueueListOptions) => Promise<HaiResult<ReachQueueEntry[]>>
  /**
   * 修复根因并确认接收端幂等契约后恢复 dead；重置计数，保留 queueId/策略。unknown 不能重排。
   * @param queueId - 持久UUID回执，不代替运维权限。
   * @param options - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach, type ReachDeadRequeue } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const listed = await reach.queue.list({ status: 'dead', limit: 10 })
   *     if (!listed.success) throw new Error(listed.error.message)
   *     const entry = listed.data[0]
   *     if (entry && entry.updatedAt !== undefined) {
   *       const options: ReachDeadRequeue = { expectedUpdatedAt: entry.updatedAt }
   *       // 此调用仅在受信运维流程核验完成后执行。
   *       const restored = await reach.queue.requeueDead(entry.queueId, options)
   *       if (!restored.success) throw new Error(restored.error.message)
   *     }
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  requeueDead: (queueId: string, options: ReachDeadRequeue) => Promise<HaiResult<void>>
  /**
   * 停止/隔离旧 worker 并核对外部投递记录后，裁定 unknown；不重新发送。
   * @param queueId - 持久UUID回执，不代替运维权限。
   * @param resolution - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach, type ReachUnknownResolution } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const listed = await reach.queue.list({ status: 'unknown', limit: 10 })
   *     if (!listed.success) throw new Error(listed.error.message)
   *     const entry = listed.data[0]
   *     if (entry) {
   *       // 可信运维前置：旧worker已隔离且外部投递记录已核对。
   *       const resolution: ReachUnknownResolution = { status: 'discarded' }
   *       const resolved = await reach.queue.resolveUnknown(entry.queueId, resolution)
   *       if (!resolved.success) throw new Error(resolved.error.message)
   *     }
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  resolveUnknown: (queueId: string, resolution: ReachUnknownResolution) => Promise<HaiResult<void>>
}

/**
 * 持久文本模板，provider是配置名称，subject/body支持{key}替换；未提供的占位符保留原文。
 * 不提供HTML转义或消毒，渲染结果的最终安全上下文由使用方处理。
 *
 * @example
 * ```ts
 * import { reach, type ReachTemplate } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const template: ReachTemplate = { name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }
 *     const saved = await reach.template.save(template)
 *     if (!saved.success) throw new Error(saved.error.message)
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
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
 * 渲染后的主题/正文；文本替换不等于HTML安全，可选subject按原模板保留。
 *
 * @example
 * ```ts
 * import { reach, type RenderedTemplate } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const rendered = await reach.template.render('welcome', { userName: 'Alice' })
 *     if (!rendered.success) throw new Error(rendered.error.message)
 *     const value: RenderedTemplate = rendered.data
 *     const body = value.body
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface RenderedTemplate {
  /** 渲染后的主题 */
  subject?: string
  /** 渲染后的正文 */
  body: string
}

// ─── 操作接口 ───

/**
 * 统一发送操作；失败HaiResult不表示已发送，成功结果仍检查内部success与deferred。
 * 即时外部发送成功不因可选日志失败而转失败，防调用方重复发送；延迟入队必须确认持久写入。
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } })
 *     if (!result.success) throw new Error(result.error.message)
 *     if (!result.data.success) throw new Error('Delivery was not accepted')
 *     if (result.data.deferred) {
 *       const queueId = result.data.queueId
 *       // 持久入队成功，尚未证明接收端已完成外部投递。
 *     }
 *     else { const providerMessageId = result.data.messageId }
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
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
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } })
   *     if (!result.success) throw new Error(result.error.message)
   *     if (!result.data.success) throw new Error('Delivery was not accepted')
   *     if (result.data.deferred) {
   *       const queueId = result.data.queueId
   *       // 持久入队成功，尚未证明接收端已完成外部投递。
   *     }
   *     else { const providerMessageId = result.data.messageId }
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  send: (message: ReachMessage) => Promise<HaiResult<SendResult>>
}

// ─── 模板注册表接口 ───

/**
 * 数据库模板操作；无数据库时不回退进程模板缓存，resolve失败、list为空，保存/删除返回失败。
 * saveBatch并发逐条upsert，失败时不承诺其它项回滚；需要原子业务批次时由受控事务流程实现。
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const saved = await reach.template.save({ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' })
 *     if (!saved.success) throw new Error(saved.error.message)
 *     const rendered = await reach.template.render('welcome', { userName: 'Alice' })
 *     if (!rendered.success) throw new Error(rendered.error.message)
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface ReachTemplateRegistry {
  /**
   * 按名称解析模板
   * @param name - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.template.resolve('welcome')
   *     if (!result.success) throw new Error(result.error.message)
   *     const providerName = result.data.provider
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  resolve: (name: string) => Promise<HaiResult<ReachTemplate>>
  /**
   * 保存模板到数据库（upsert）
   * @param template - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach, type ReachTemplate } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const template: ReachTemplate = { name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }
   *     const saved = await reach.template.save(template)
   *     if (!saved.success) throw new Error(saved.error.message)
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  save: (template: ReachTemplate) => Promise<HaiResult<void>>
  /**
   * 批量保存模板到数据库
   * @param templates - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.template.saveBatch([{ name: 'receipt', provider: 'webhook', body: 'Receipt {orderId}' }, { name: 'reminder', provider: 'webhook', body: 'Reminder {orderId}' }])
   *     if (!result.success) throw new Error(result.error.message)
   *     // 非原子批次；失败时应核对已保存条目，不假定整体回滚。
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  saveBatch: (templates: ReachTemplate[]) => Promise<HaiResult<void>>
  /**
   * 从数据库删除模板
   * @param name - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.template.remove('welcome')
   *     if (!result.success) throw new Error(result.error.message)
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  remove: (name: string) => Promise<HaiResult<void>>
  /**
   * 列出所有模板
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.template.list()
   *     if (!result.success) throw new Error(result.error.message)
   *     const count = result.data.length
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  list: () => Promise<HaiResult<ReachTemplate[]>>
  /**
   * 渲染模板（从数据库解析后渲染）
   * @param name - 实际操作输入，按本方法约束校验。
   * @param vars - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach, type RenderedTemplate } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const rendered = await reach.template.render('welcome', { userName: 'Alice' })
   *     if (!rendered.success) throw new Error(rendered.error.message)
   *     const value: RenderedTemplate = rendered.data
   *     const body = value.body
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  render: (name: string, vars: Record<string, string>) => Promise<HaiResult<RenderedTemplate>>
}

// ─── 函数接口 ───

/**
 * Reach生命周期、模板、发送及受信队列运维能力；先初始化数据库，再检查reach.init结果，反序close。
 * API Provider init只建立适配器配置，不探测远端可用性；实际send结果才能判断本次投递。
 *
 * @example
 * ```ts
 * import { reach } from '@h-ai/reach'
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   try {
 *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } })
 *     if (!result.success) throw new Error(result.error.message)
 *     if (!result.data.success) throw new Error('Delivery was not accepted')
 *     if (result.data.deferred) {
 *       const queueId = result.data.queueId
 *       // 持久入队成功，尚未证明接收端已完成外部投递。
 *     }
 *     else { const providerMessageId = result.data.messageId }
 *   }
 *   finally { await reach.close() }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface ReachFunctions extends SendOperations {
  /** 持久化队列查询、死信恢复与未知结果人工裁定。 */
  readonly queue: ReachQueueOperations
  /**
   * 初始化触达模块（注册多个 Provider）
   * @param config - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } })
   *     if (!result.success) throw new Error(result.error.message)
   *     if (!result.data.success) throw new Error('Delivery was not accepted')
   *     if (result.data.deferred) {
   *       const queueId = result.data.queueId
   *       // 持久入队成功，尚未证明接收端已完成外部投递。
   *     }
   *     else { const providerMessageId = result.data.messageId }
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  init: (config: ReachConfigInput) => Promise<HaiResult<void>>
  /** 当前脱敏后的配置快照（未初始化时为 null） */
  readonly config: ReachConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 模板注册表 */
  readonly template: ReachTemplateRegistry
  /**
   * 关闭连接并释放资源
   *
   * @example
   * ```ts
   * import { reach } from '@h-ai/reach'
   * const { reldb } = await import('@h-ai/reldb')
   * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
   * if (!connected.success) throw new Error(connected.error.message)
   * try {
   *   const initialized = await reach.init({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
   *   if (!initialized.success) throw new Error(initialized.error.message)
   *   try {
   *     const result = await reach.send({ provider: 'webhook', to: 'user@example.com', template: 'welcome', vars: { userName: 'Alice' } })
   *     if (!result.success) throw new Error(result.error.message)
   *     if (!result.data.success) throw new Error('Delivery was not accepted')
   *     if (result.data.deferred) {
   *       const queueId = result.data.queueId
   *       // 持久入队成功，尚未证明接收端已完成外部投递。
   *     }
   *     else { const providerMessageId = result.data.messageId }
   *   }
   *   finally { await reach.close() }
   * }
   * finally {
   *   const closed = await reldb.close()
   *   if (!closed.success) throw new Error(closed.error.message)
   * }
   * ```
   */
  close: () => Promise<void>
}
