/**
 * @h-ai/reach — 发送逻辑
 *
 * 本文件封装触达模块的发送逻辑，包括： - 消息预处理（模板渲染 + Provider 路由推导） - DND（免打扰）时间段检查与策略处理（discard / delay） - 通过 SendLogRepository 持久化发送记录 - DND 恢复定时任务（flush pending 消息）
 * @module reach-send
 */

import type { Result } from '@h-ai/core'
import type { DndConfig } from './reach-config.js'
import type { SendLogRepository } from './reach-repository-send-log.js'
import type {
  ReachError,
  ReachMessage,
  ReachProvider,
  ReachTemplateRegistry,
  SendResult,
} from './reach-types.js'

import { core, err, ok } from '@h-ai/core'

import { ReachErrorCode } from './reach-config.js'
import { reachM } from './reach-i18n.js'

const logger = core.logger.child({ module: 'reach', scope: 'send' })

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
export function preprocessMessage(
  message: ReachMessage,
  templateRegistry: ReachTemplateRegistry,
): Result<ReachMessage, ReachError> {
  if (!message.template) {
    return ok(message)
  }

  const rendered = templateRegistry.render(message.template, message.vars ?? {})
  if (!rendered.success) {
    return rendered
  }

  const template = templateRegistry.get(message.template)

  const processed: ReachMessage = {
    ...message,
    provider: message.provider || template?.provider || '',
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

/**
 * 启动 DND 恢复定时器
 *
 * 在 DND 结束时自动获取所有 pending 状态记录并逐条发送。
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

  // 如果当前不在 DND 时段，不需要启动定时器
  if (!isDndBlocked(dndConfig)) {
    // 但仍然尝试 flush 一次（可能上次 DND 结束后有残留 pending）
    flushPendingMessages(providers, repo).catch((error) => {
      logger.warn('Failed to flush pending messages on init', { error })
    })
    return
  }

  const delayMs = msUntilDndEnd(dndConfig)
  logger.info('DND scheduler started', { delayMs, dndEnd: dndConfig.end })

  dndTimer = setTimeout(() => {
    logger.info('DND period ended, flushing pending messages')
    flushPendingMessages(providers, repo).catch((error) => {
      logger.error('Failed to flush pending messages', { error })
    })
  }, delayMs)
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
}

/**
 * 从数据库获取所有 pending 记录并逐条发送
 */
async function flushPendingMessages(
  providers: Map<string, ReachProvider>,
  repo: SendLogRepository | null,
): Promise<void> {
  if (!repo) {
    return
  }

  const result = await repo.findPending()
  if (!result.success || !result.data.length) {
    return
  }

  logger.info('Flushing pending messages', { count: result.data.length })

  for (const row of result.data) {
    const provider = providers.get(row.provider)
    if (!provider) {
      logger.warn('Provider not found for pending message, skipping', { provider: row.provider, id: row.id })
      continue
    }

    let vars: Record<string, string> | undefined
    let extra: Record<string, unknown> | undefined
    try {
      vars = row.varsJson ? JSON.parse(row.varsJson) as Record<string, string> : undefined
      extra = row.extraJson ? JSON.parse(row.extraJson) as Record<string, unknown> : undefined
    }
    catch {
      logger.warn('Failed to parse pending message JSON, skipping', { id: row.id })
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

    const sendResult = await provider.send(message)
    if (sendResult.success) {
      await repo.markSent(row.id, sendResult.data.messageId)
      logger.info('Pending message sent', { id: row.id, to: row.toAddr, provider: row.provider })
    }
    else {
      logger.warn('Pending message send failed', { id: row.id, to: row.toAddr, error: sendResult.error.code })
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
): Promise<Result<SendResult, ReachError>> {
  if (!message.to) {
    return err({
      code: ReachErrorCode.INVALID_RECIPIENT,
      message: reachM('reach_invalidRecipient', { params: { recipient: '' } }),
    })
  }

  const preprocessed = preprocessMessage(message, templateRegistry)
  if (!preprocessed.success) {
    return preprocessed
  }

  // 校验 Provider 存在性（在 DND 检查前，确保 delay 也能正确路由）
  const providerName = preprocessed.data.provider
  if (!providerName) {
    return err({
      code: ReachErrorCode.PROVIDER_NOT_FOUND,
      message: reachM('reach_providerRequired'),
    })
  }

  if (!providers.has(providerName)) {
    return err({
      code: ReachErrorCode.PROVIDER_NOT_FOUND,
      message: reachM('reach_providerNotFound', { params: { provider: providerName } }),
    })
  }

  // DND 检查
  if (isDndBlocked(dndConfig)) {
    const strategy = dndConfig?.strategy ?? 'discard'

    if (strategy === 'delay') {
      // delay 策略：暂存消息到 DB
      logger.info('Message deferred by DND (delay strategy)', { provider: providerName, to: message.to })
      saveSendRecord(repo ?? null, preprocessed.data, 'pending', providerName).catch((error) => {
        logger.warn('Failed to save deferred message to DB', { provider: providerName, to: message.to, error })
      })
      return ok({ success: true, deferred: true })
    }

    // discard 策略：直接拒绝
    logger.info('Message blocked by DND (discard strategy)', { provider: providerName, to: message.to })
    return err({
      code: ReachErrorCode.DND_BLOCKED,
      message: reachM('reach_dndBlocked'),
    })
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
