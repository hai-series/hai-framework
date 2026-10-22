/**
 * @h-ai/reach — 发送逻辑
 *
 * 本文件封装触达模块的发送逻辑，包括： - 消息预处理（模板渲染 + Provider 路由推导） - DND（免打扰）时间段检查与策略处理（discard / delay） - 通过 SendLogRepository 持久化发送记录 - DND 恢复定时任务（flush pending 消息）
 * @module reach-send
 */

import type { HaiResult } from '@h-ai/core'
import type { ReachProvider } from './providers/reach-provider-types.js'
import type { DndConfig, ReachQueueConfig } from './reach-config.js'
import type { ReachMessage, ReachTemplateRegistry, SendResult } from './reach-types.js'

import type { SendLogRepository } from './repositories/reach-repository-send-log.js'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'

import { ReachQueueConfigSchema } from './reach-config.js'
import { deliverClaimedMessage } from './reach-delivery.js'
import { reachM } from './reach-i18n.js'
import {
  HaiReachError,

} from './reach-types.js'

const logger = core.logger.child({ module: 'reach', scope: 'send' })
const FLUSH_LOCK_KEY = 'hai:reach:flush-pending'
const FLUSH_LOCK_TTL = 300
const FLUSH_BATCH_SIZE = 100
const FLUSH_CLAIM_LOCK_MS = 10 * 60 * 1000

/** 稳定的节点标识，用于分布式锁 owner（进程级别唯一） */
const reachNodeId = `reach:${crypto.randomUUID()}`

// ─── DND（免打扰）检查 ───

/**
 * 解析 HH:mm 时间为当天的分钟数（0~1439）
 *
 * @param time - HH:mm 格式的时间字符串
 * @returns 分钟数
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * 检查当前时间是否处于免打扰时段
 *
 * 支持跨午夜时段（如 22:00 → 08:00）。
 *
 * @param dnd - DND 配置
 * @param now - 当前时间（默认 new Date()）
 * @returns 是否被 DND 拦截
 */
export function isDndBlocked(dnd: DndConfig | undefined, now: Date = new Date()): boolean {
  if (!dnd?.enabled) {
    return false
  }

  const startMin = parseTimeToMinutes(dnd.start)
  const endMin = parseTimeToMinutes(dnd.end)
  const currentMin = now.getHours() * 60 + now.getMinutes()

  if (startMin === endMin) {
    return false
  }

  if (startMin < endMin) {
    return currentMin >= startMin && currentMin < endMin
  }

  return currentMin >= startMin || currentMin < endMin
}

/**
 * 计算距离 DND 结束还有多少毫秒
 *
 * @param dnd - DND 配置
 * @param now - 当前时间
 * @returns 毫秒数
 */
export function msUntilDndEnd(dnd: DndConfig, now: Date = new Date()): number {
  const endMin = parseTimeToMinutes(dnd.end)
  const currentMin = now.getHours() * 60 + now.getMinutes()
  const currentSec = now.getSeconds()

  let diffMin = endMin - currentMin
  if (diffMin <= 0) {
    diffMin += 24 * 60
  }
  return diffMin * 60 * 1000 - currentSec * 1000
}

// ─── 消息预处理 ───

/**
 * 预处理消息：如果指定了模板，渲染模板并填充 subject/body，
 * 同时从模板中推导 Provider 名称。
 */
export async function preprocessMessage(
  message: ReachMessage,
  templateRegistry: ReachTemplateRegistry,
): Promise<HaiResult<ReachMessage>> {
  if (!message.template) {
    return ok(message)
  }

  const rendered = await templateRegistry.render(message.template, message.vars ?? {})
  if (!rendered.success) {
    return rendered
  }

  const template = await templateRegistry.resolve(message.template)

  const processed: ReachMessage = {
    ...message,
    provider: message.provider || (template.success ? template.data.provider : '') || '',
    subject: message.subject ?? rendered.data.subject,
    body: message.body ?? rendered.data.body,
  }
  return ok(processed)
}

// ─── 发送记录持久化（通过 Repository） ───

/**
 * 保存发送记录并传播数据库的失败结果；是否允许忽略失败由发送场景决定。
 */
async function saveSendRecord(
  repo: SendLogRepository,
  message: ReachMessage,
  status: 'sent' | 'pending',
  provider: string,
  messageId?: string,
  queueId?: string,
  queueConfig?: ReachQueueConfig,
): Promise<HaiResult<void>> {
  try {
    const inserted = await repo.create({
      queueId: queueId ?? null,
      provider,
      toAddr: message.to,
      subject: message.subject ?? null,
      body: message.body ?? null,
      template: message.template ?? null,
      varsJson: message.vars ? JSON.stringify(message.vars) : null,
      extraJson: message.extra ? JSON.stringify(message.extra) : null,
      status,
      ...queueConfig,
      messageId: messageId ?? null,
      createdAt: Date.now(),
    })
    if (!inserted.success)
      return inserted
    if (inserted.data.changes !== 1)
      return err(HaiReachError.SEND_FAILED, reachM('reach_sendRecordSaveFailed'))
    return ok(undefined)
  }
  catch (cause) {
    return err(HaiReachError.SEND_FAILED, reachM('reach_sendRecordSaveFailed'), cause)
  }
}

// ─── DND 恢复定时任务 ───

/** 定时器引用 */
let dndTimer: ReturnType<typeof setTimeout> | null = null

/** 保存调度器参数，用于循环调度 */
let schedulerContext: { dndConfig: DndConfig, providers: Map<string, ReachProvider>, repo: SendLogRepository | null } | null = null

/**
 * 启动 DND 恢复定时器
 *
 * 在 DND 结束时自动分批 claim pending 状态记录并逐条发送，
 * 并在 flush 完成后重新调度下一个 DND 周期。
 */
export function startDndScheduler(
  dndConfig: DndConfig,
  providers: Map<string, ReachProvider>,
  repo: SendLogRepository | null,
): void {
  stopDndScheduler()

  if (!dndConfig.enabled || dndConfig.strategy !== 'delay') {
    return
  }

  schedulerContext = { dndConfig, providers, repo }
  const context = schedulerContext

  // 如果当前不在 DND 时段，不需要启动定时器
  if (!isDndBlocked(dndConfig)) {
    // 但仍然尝试 flush 一次（可能上次 DND 结束后有残留 pending）
    flushPendingMessages(providers, repo).catch((error) => {
      logger.warn('Failed to flush pending messages on init', { error })
    }).finally(() => {
      if (schedulerContext === context)
        scheduleDndCheck()
    })
    return
  }

  scheduleFlushAtDndEnd()
}

/**
 * 在 DND 结束时触发 flush 并重新调度
 */
function scheduleFlushAtDndEnd(): void {
  if (!schedulerContext)
    return
  const context = schedulerContext
  const { dndConfig, providers, repo } = context

  const delayMs = msUntilDndEnd(dndConfig)
  logger.info('DND scheduler started', { delayMs, dndEnd: dndConfig.end })

  dndTimer = setTimeout(() => {
    if (schedulerContext !== context)
      return
    logger.info('DND period ended, flushing pending messages')
    flushPendingMessages(providers, repo)
      .catch((error) => {
        logger.error('Failed to flush pending messages', { error })
      })
      .finally(() => {
        // 重新调度：等待下一个 DND 周期
        if (schedulerContext === context)
          scheduleDndCheck()
      })
  }, delayMs)
}

/**
 * 定期检查是否进入 DND 时段，进入后切换到 flush 调度
 */
function scheduleDndCheck(): void {
  if (!schedulerContext)
    return
  const context = schedulerContext
  const { dndConfig, providers, repo } = context

  // 每分钟检查一次是否进入 DND
  const CHECK_INTERVAL = 60 * 1000
  dndTimer = setTimeout(() => {
    if (schedulerContext !== context)
      return
    if (isDndBlocked(dndConfig)) {
      scheduleFlushAtDndEnd()
    }
    else {
      // DND 时段外持续恢复遗留任务，避免节点启动时租约未过期就要等到下一天。
      flushPendingMessages(providers, repo)
        .catch(error => logger.warn('Failed to recover pending messages', { error }))
        .finally(() => {
          if (schedulerContext === context)
            scheduleDndCheck()
        })
    }
  }, CHECK_INTERVAL)
}

/**
 * 停止 DND 恢复定时器
 */
export function stopDndScheduler(): void {
  if (dndTimer !== null) {
    clearTimeout(dndTimer)
    dndTimer = null
  }
}

/**
 * 重置内部状态（close 时调用）
 */
export function resetSendState(): void {
  stopDndScheduler()
  schedulerContext = null
}

/**
 * 从数据库分批 claim pending 记录并逐条发送
 *
 * 分布式锁仅减少重复扫描；投递权由逐条领取、sending 门闩及有效 owner 约束。
 * 外部副作用依赖接收端幂等；不支持幂等的在途请求不会自动接管重发。
 */
async function flushPendingMessages(
  providers: Map<string, ReachProvider>,
  repo: SendLogRepository | null,
): Promise<void> {
  if (!repo) {
    return
  }

  // 分布式锁：防止多节点同时 flush
  // 注意：这里的锁主要用于减少惊群和重复扫描；真正的行级正确性由 repo.claimPendingBatch 的 claim 事务保证。
  let lockOwner: string | null = null
  // flushOwner 是本轮 flush 的短期 lease owner。
  // 同一进程后续再次 flush 会生成新的 owner，避免旧批次在 lease 失效后误释放/误提交新批次的记录。
  const flushOwner = `${reachNodeId}:${crypto.randomUUID()}`
  if (cache.isInitialized) {
    const lockResult = await cache.lock.acquire(FLUSH_LOCK_KEY, { ttl: FLUSH_LOCK_TTL })
    if (!lockResult.success) {
      logger.warn('Failed to acquire flush lock, continuing with row claims only', { error: lockResult.error.message })
    }
    else if (!lockResult.data) {
      logger.info('Skipping flush, another node holds the lock')
      return
    }
    else {
      lockOwner = lockResult.data
    }
  }

  try {
    // 固定本轮资格截止点，耗时发送期间到期的重试留到下一轮，避免毒消息重复占用预算。
    const eligibleBefore = Date.now()
    for (let processed = 0; processed < FLUSH_BATCH_SIZE; processed += 1) {
      // 按实际执行逐条领取，避免后排消息排队等待时耗尽租约；单轮处理数量有界。
      const claimResult = await repo.claimPendingBatch(flushOwner, {
        limit: 1,
        lockMs: FLUSH_CLAIM_LOCK_MS,
        eligibleBefore,
      })
      if (!claimResult.success) {
        logger.warn('Failed to claim pending messages', { error: claimResult.error.message })
        return
      }

      if (claimResult.data.length === 0) {
        return
      }

      logger.debug('Flushing pending messages', { count: claimResult.data.length })

      for (const row of claimResult.data) {
        // 缺少 Provider 可由配置修复，但也必须消耗重试预算并退避，不能原地自旋。
        const provider = providers.get(row.provider)
        if (!provider) {
          logger.warn('Provider not found for pending message, releasing claim', { provider: row.provider, id: row.id })
          const releaseResult = await repo.failClaim(row, flushOwner, 'provider_unavailable')
          if (!releaseResult.success) {
            logger.warn('Failed to release pending message claim', { id: row.id, error: releaseResult.error.message })
          }
          continue
        }

        const sent = await deliverClaimedMessage(row, flushOwner, provider, repo, FLUSH_CLAIM_LOCK_MS)
        if (!sent.success)
          logger.warn('Pending message delivery did not commit', { id: row.id, code: sent.error.code })
      }
    }
  }
  finally {
    // 释放锁
    if (lockOwner) {
      await cache.lock.release(FLUSH_LOCK_KEY, lockOwner).catch((error: unknown) => {
        logger.warn('Failed to release flush lock', { error })
      })
    }
  }
}

// ─── 发送入口 ───

/**
 * 执行消息发送
 *
 * 包含完整的发送流程：
 * 1. 校验接收方
 * 2. 预处理消息（模板渲染）
 * 3. 检查 DND 免打扰：
 *    - discard 策略：返回 DND_BLOCKED 错误
 *    - delay 策略：等待 DB 写入 pending 成功后返回 deferred 与 queueId；失败不视为入队
 * 4. 路由到目标 Provider
 * 5. 发送消息
 * 6. 保存发送记录（sent 状态）
 */
export async function executeSend(
  message: ReachMessage,
  providers: Map<string, ReachProvider>,
  templateRegistry: ReachTemplateRegistry,
  dndConfig?: DndConfig,
  repo?: SendLogRepository | null,
  queueConfig: ReachQueueConfig = ReachQueueConfigSchema.parse({}),
): Promise<HaiResult<SendResult>> {
  if (!message.to) {
    return err(
      HaiReachError.INVALID_RECIPIENT,
      reachM('reach_invalidRecipient', { params: { recipient: '' } }),
    )
  }

  const preprocessed = await preprocessMessage(message, templateRegistry)
  if (!preprocessed.success) {
    return preprocessed
  }

  // 校验 Provider 存在性（在 DND 检查前，确保 delay 也能正确路由）
  const providerName = preprocessed.data.provider
  if (!providerName) {
    return err(
      HaiReachError.PROVIDER_NOT_FOUND,
      reachM('reach_providerRequired'),
    )
  }

  if (!providers.has(providerName)) {
    return err(
      HaiReachError.PROVIDER_NOT_FOUND,
      reachM('reach_providerNotFound', { params: { provider: providerName } }),
    )
  }

  // DND 检查
  if (isDndBlocked(dndConfig)) {
    const strategy = dndConfig?.strategy ?? 'discard'

    if (strategy === 'delay') {
      if (!repo)
        return err(HaiReachError.SEND_FAILED, reachM('reach_dndPersistenceRequired'))

      // 预先生成并随消息落盘，避免依赖不同数据库的自增 ID 返回约定。
      const queueId = crypto.randomUUID()
      const saved = await saveSendRecord(repo, preprocessed.data, 'pending', providerName, undefined, queueId, queueConfig)
      if (!saved.success) {
        logger.warn('Failed to persist deferred message', { provider: providerName, code: saved.error.code })
        return err(
          HaiReachError.SEND_FAILED,
          reachM('reach_dndEnqueueFailed'),
          saved.error,
        )
      }
      logger.info('Message persisted for DND delivery', { provider: providerName, queueId })
      return ok({ success: true, deferred: true, queueId })
    }

    // discard 策略：直接拒绝
    logger.info('Message blocked by DND (discard strategy)', { provider: providerName, to: message.to })
    return err(
      HaiReachError.DND_BLOCKED,
      reachM('reach_dndBlocked'),
    )
  }

  const provider = providers.get(providerName)!

  logger.debug('Sending message', {
    provider: providerName,
    to: preprocessed.data.to,
    template: message.template,
  })

  const result = await provider.send(preprocessed.data)
  if (!result.success) {
    logger.warn('Message send failed', {
      provider: providerName,
      to: message.to,
      error: result.error.code,
    })
    return result
  }

  // 已完成的外部发送不因可选日志失败而返回失败，避免调用方重发；仍记录持久化失败。
  if (repo) {
    void saveSendRecord(repo, preprocessed.data, 'sent', providerName, result.data.messageId).then((saved) => {
      if (!saved.success)
        logger.warn('Failed to persist sent message log', { provider: providerName, code: saved.error.code })
    })
  }

  return result
}
