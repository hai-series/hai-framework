/** 凭据仅驻留当前调用；持久回执占用幂等键，发送不明也不自动重投旧凭据。 */
import type { HaiResult } from '@h-ai/core'
import type { ReachProvider } from './providers/reach-provider-types.js'
import type { ReachMessage, SendResult } from './reach-types.js'
import type { SendLogRepository, StoredSendLog } from './repositories/reach-repository-send-log.js'
import { createHash } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { reachM } from './reach-i18n.js'
import { HaiReachError } from './reach-types.js'

/**
 * 元数据回执与普通发送队列共用唯一键约束，不保存可重建凭据的载荷或摘要。
 * @example 模块内部上下文
 * ```ts
 * function receipt(row: StoredSendLog): HaiResult<SendResult> {
 *   return previousResult(row)
 * }
 * ```
 */
function previousResult(row: StoredSendLog): HaiResult<SendResult> {
  return row.status === 'sent'
    ? ok({ success: true, receiptId: row.queueId ?? undefined })
    : unconfirmed(row.queueId!)
}

function unconfirmed(receiptId: string): HaiResult<SendResult> {
  return { success: false, error: { ...HaiReachError.SEND_FAILED, message: reachM('reach_sensitiveDeliveryUnconfirmed'), ext: { receiptId } } }
}

/**
 * 只允许一个节点进行凭据投递；失败/崩溃只留下无载荷回执，不恢复发送。
 * @example 模块内部上下文
 * ```ts
 * async function deliver(message: ReachMessage, provider: ReachProvider, repository: SendLogRepository) {
 *   const result = await sendSensitive(message, provider, repository, false)
 *   if (!result.success) return result
 *   return result
 * }
 * ```
 */
export async function sendSensitive(message: ReachMessage, provider: ReachProvider, repo: SendLogRepository | null | undefined, blocked: boolean): Promise<HaiResult<SendResult>> {
  if (!repo || !message.idempotencyKey?.trim() || message.idempotencyKey.length > 255 || !Number.isSafeInteger(message.expiresAt))
    return err(HaiReachError.CONFIG_ERROR, reachM('reach_sensitivePolicyRequired'))
  const hash = createHash('sha256').update(JSON.stringify([message.provider, message.to, message.idempotencyKey])).digest('hex')
  // 固定 UUID 保持既有回执查询契约；只散列随机操作键与路由，不散列低熵密码或验证码。
  const queueId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  const find = () => repo.findAll({ where: 'queue_id = ?', params: [queueId], limit: 1 })
  const existing = await find()
  if (!existing.success)
    return existing
  if (existing.data[0])
    return previousResult(existing.data[0])
  const now = Date.now()
  if (message.expiresAt! <= now)
    return err(HaiReachError.MESSAGE_EXPIRED, reachM('reach_messageExpired'))
  const created = await repo.create({
    queueId,
    provider: message.provider,
    toAddr: '[REDACTED]',
    subject: null,
    body: null,
    template: null,
    varsJson: null,
    extraJson: null,
    status: blocked ? 'discarded' : 'sending',
    retrySafe: false,
    createdAt: now,
    updatedAt: now,
    lockedUntil: Math.min(message.expiresAt!, now + 600_000),
    nextAttemptAt: 0,
  })
  if (!created.success || created.data.changes !== 1) {
    const previous = await find()
    if (previous.success && previous.data[0])
      return previousResult(previous.data[0])
    return unconfirmed(queueId)
  }
  if (blocked)
    return err(HaiReachError.DND_BLOCKED, reachM('reach_dndBlocked'))
  if (Date.now() >= message.expiresAt!) {
    await repo.settleSensitive(queueId, 'discarded')
    return err(HaiReachError.MESSAGE_EXPIRED, reachM('reach_messageExpired'))
  }
  let delivered: HaiResult<SendResult>
  try {
    // 允许宿主明确启用的开发 Console 输出，但通知内容不进入任何持久采集观察器。
    delivered = await core.context.run({ suppressLogObservers: true }, () => provider.send(message))
  }
  catch {
    delivered = err(HaiReachError.SEND_FAILED, reachM('reach_sensitiveDeliveryUnconfirmed'))
  }
  const success = delivered.success && delivered.data.success && !delivered.data.deferred
  const settled = await repo.settleSensitive(queueId, success ? 'sent' : 'unknown')
  if (!settled.success || !success)
    return unconfirmed(queueId)
  return ok({ success: true, receiptId: queueId })
}
