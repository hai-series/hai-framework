/**
 * @h-ai/reach — 发送逻辑
 *
 * 本文件封装触达模块的发送逻辑，包括： - 消息预处理（模板渲染 + Provider 路由推导） - DND（免打扰）时间段检查与策略处理（discard / delay） - 通过 SendLogRepository 持久化发送记录 - DND 恢复定时任务（flush pending 消息）
 * @module reach-send
 */

import type { HaiResult } from '@h-ai/core'
import type { DndConfig } from './reach-config.js'
import type { ReachMessage, ReachProvider, ReachTemplateRegistry, SendResult } from './reach-types.js'

import type { SendLogRepository } from './repositories/reach-repository-send-log.js'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'

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
 * 保存发送记录到数据库
 */
async function saveSendRecord(
  repo: SendLogRepository | null,
  message: ReachMessage,
  status: 'sent' | 'pending',
  provider: string,
  messageId?: string,
): Promise<void> {
  if (!repo) {
    return
  }
  try {
    await repo.create({
      provider,
      toAddr: message.to,
      subject: message.subject ?? null,
      body: message.body ?? null,
      template: message.template ?? null,
      varsJson: message.vars ? JSON.stringify(message.vars) : null,
      extraJson: message.extra ? JSON.stringify(message.extra) : null,
      status,
      messageId: messageId ?? null,
      createdAt: Date.now(),
    })
  }
  catch {
    logger.debug('Send record not saved (db module unavailable)')
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

  // 如果当前不在 DND 时段，不需要启动定时器
  if (!isDndBlocked(dndConfig)) {
    // 但仍然尝试 flush 一次（可能上次 DND 结束后有残留 pending）
    flushPendingMessages(providers, repo).catch((error) => {
      logger.warn('Failed to flush pending messages on init', { error })
    })
    scheduleDndCheck()
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
  const { dndConfig, providers, repo } = schedulerContext

  const delayMs = msUntilDndEnd(dndConfig)
  logger.info('DND scheduler started', { delayMs, dndEnd: dndConfig.end })

  dndTimer = setTimeout(() => {
    logger.info('DND period ended, flushing pending messages')
    flushPendingMessages(providers, repo)
      .catch((error) => {
        logger.error('Failed to flush pending messages', { error })
      })
      .finally(() => {
        // 重新调度：等待下一个 DND 周期
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
  const { dndConfig } = schedulerContext

  // 每分钟检查一次是否进入 DND
  const CHECK_INTERVAL = 60 * 1000
  dndTimer = setTimeout(() => {
    if (!schedulerContext)
      return
    if (isDndBlocked(dndConfig)) {
      scheduleFlushAtDndEnd()
    }
    else {
      scheduleDndCheck()
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
 * 多节点部署时通过分布式锁确保同一时刻只有一个节点执行 flush。
 * 分布式锁基于 @h-ai/cache 模块实现，运行时通过 cache.isInitialized 动态检测可用性。
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
  let lockAcquired = false
  // flushOwner 是本轮 flush 的短期 lease owner。
  // 同一进程后续再次 flush 会生成新的 owner，避免旧批次在 lease 失效后误释放/误提交新批次的记录。
  const flushOwner = `${reachNodeId}:${Date.now()}`
  if (cache.isInitialized) {
    const lockResult = await cache.lock.acquire(FLUSH_LOCK_KEY, { ttl: FLUSH_LOCK_TTL, owner: reachNodeId })
    if (!lockResult.success) {
      logger.warn('Failed to acquire flush lock, continuing with row claims only', { error: lockResult.error.message })
    }
    else if (!lockResult.data) {
      logger.info('Skipping flush, another node holds the lock')
      return
    }
    else {
      lockAcquired = true
    }
  }

  try {
    while (true) {
      // 每轮只 claim 一小批：
      // 1) 控制单次 flush 持有的数据量
      // 2) 让其它节点能尽快接手未处理的记录
      // 3) 避免一次性拉全表 pending 造成长事务和大扫描
      const claimResult = await repo.claimPendingBatch(flushOwner, {
        limit: FLUSH_BATCH_SIZE,
        lockMs: FLUSH_CLAIM_LOCK_MS,
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
        // Provider 缺失属于可恢复问题：释放 claim，让后续配置修复后还能继续重试。
        const provider = providers.get(row.provider)
        if (!provider) {
          logger.warn('Provider not found for pending message, releasing claim', { provider: row.provider, id: row.id })
          const releaseResult = await repo.releaseClaim(row.id, flushOwner)
          if (!releaseResult.success) {
            logger.warn('Failed to release pending message claim', { id: row.id, error: releaseResult.error.message })
          }
          continue
        }

        let vars: Record<string, string> | undefined
        let extra: Record<string, unknown> | undefined
        try {
          // JSON 解析失败时同样不吞掉记录，而是把它重新放回 pending，交给后续人工修复/补偿。
          vars = row.varsJson ? JSON.parse(row.varsJson) as Record<string, string> : undefined
          extra = row.extraJson ? JSON.parse(row.extraJson) as Record<string, unknown> : undefined
        }
        catch {
          logger.warn('Failed to parse pending message JSON, releasing claim', { id: row.id })
          const releaseResult = await repo.releaseClaim(row.id, flushOwner)
          if (!releaseResult.success) {
            logger.warn('Failed to release pending message claim', { id: row.id, error: releaseResult.error.message })
          }
          continue
        }

        const message: ReachMessage = {
          provider: row.provider,
          to: row.toAddr,
          subject: row.subject ?? undefined,
          body: row.body ?? undefined,
          template: row.template ?? undefined,
          vars,
          extra,
        }

        // 外部 provider.send 不能放进数据库事务里：
        // - 否则会把行锁/事务持有到网络调用结束，影响吞吐和故障恢复
        // - 因此这里使用“先 claim lease，再按 owner 提交结果”的模式
        // - 若 lease 已失效，markSent/releaseClaim 会因 owner 不匹配而失败，避免旧节点覆盖新节点状态
        const sendResult = await provider.send(message)
        if (sendResult.success) {
          // markSent 带 owner 条件：只有当前 lease owner 才能把记录提交为 sent。
          const markResult = await repo.markSent(row.id, sendResult.data.messageId, undefined, flushOwner)
          if (!markResult.success) {
            logger.warn('Failed to mark pending message as sent', { id: row.id, error: markResult.error.message })
            continue
          }
          logger.debug('Pending message sent', { id: row.id, to: row.toAddr, provider: row.provider })
          continue
        }

        // 发送失败时只释放当前 owner 的 claim；如果 lease 已被别的节点接管，这里会显式失败并打日志。
        const releaseResult = await repo.releaseClaim(row.id, flushOwner)
        if (!releaseResult.success) {
          logger.warn('Failed to release pending message claim after send failure', { id: row.id, error: releaseResult.error.message })
        }
        logger.warn('Pending message send failed', { id: row.id, to: row.toAddr, error: sendResult.error.code })
      }

      if (claimResult.data.length < FLUSH_BATCH_SIZE) {
        return
      }
    }
  }
  finally {
    // 释放锁
    if (lockAcquired) {
      await cache.lock.release(FLUSH_LOCK_KEY, reachNodeId).catch((error: unknown) => {
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
 *    - delay 策略：暂存到 DB（pending），返回 deferred 结果
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
      // delay 策略：暂存消息到 DB
      logger.info('Message deferred by DND (delay strategy)', { provider: providerName, to: message.to })
      try {
        await saveSendRecord(repo ?? null, preprocessed.data, 'pending', providerName)
      }
      catch (error) {
        logger.warn('Failed to save deferred message to DB', { provider: providerName, to: message.to, error })
        return err(
          HaiReachError.SEND_FAILED,
          reachM('reach_dndDeferred'),
          error,
        )
      }
      return ok({ success: true, deferred: true })
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

  // 异步保存发送记录（sent 状态）
  saveSendRecord(repo ?? null, preprocessed.data, 'sent', providerName, result.data.messageId).catch((error) => {
    logger.warn('Failed to save send record', { provider: providerName, to: message.to, error })
  })

  return result
}
