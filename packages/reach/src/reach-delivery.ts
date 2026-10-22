/**
 * 单条队列投递：发送前持久化门闩、在途续租及未知结果隔离。
 * @module reach-delivery
 */
import type { HaiResult } from '@h-ai/core'
import type { ReachProvider } from './providers/reach-provider-types.js'
import type { ReachMessage, SendResult } from './reach-types.js'
import type { SendLogRepository, StoredSendLog } from './repositories/reach-repository-send-log.js'
import { core, err } from '@h-ai/core'
import { reachM } from './reach-i18n.js'
import { HaiReachError } from './reach-types.js'

const logger = core.logger.child({ module: 'reach', scope: 'delivery' })
const DEFAULT_LEASE_MS = 10 * 60 * 1000

/**
 * 内部投递已领取记录；外部调用前原子持久化sending，有效owner条件提交、在途续租。
 * 续租不能撤销副作用：非幂等请求开始后失败/失租约进入unknown；API仅在真实持久去重时以同queueId有限重试。
 * @param row - 当前owner已领取的记录。
 * @param owner - 本次唯一领取凭据。
 * @param provider - 对应已连接Provider。
 * @param repo - 共享数据库仓库。
 * @param leaseMs - 领取期限毫秒数。
 * @returns 已提交或明确失败/unknown；旧owner迟到不能覆盖新状态。
 *
 * @example 模块内部上下文
 * ```ts
 * async function deliverNext(provider: ReachProvider, repository: SendLogRepository) {
 *   const owner = 'worker:' + crypto.randomUUID()
 *   const claimed = await repository.claimPendingBatch(owner, { limit: 1 })
 *   if (!claimed.success) throw new Error(claimed.error.message)
 *   const row = claimed.data[0]
 *   if (!row) return
 *   // 调用方已按row.provider选择匹配的provider；否则应failClaim退避，不能发送到其它通道。
 *   const result = await deliverClaimedMessage(row, owner, provider, repository)
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * ```
 */
export async function deliverClaimedMessage(
  row: StoredSendLog,
  owner: string,
  provider: ReachProvider,
  repo: SendLogRepository,
  leaseMs = DEFAULT_LEASE_MS,
): Promise<HaiResult<void>> {
  const retrySafe = provider.supportsIdempotency
  if (!row.queueId || (row.retrySafe && !retrySafe)) {
    await repo.markUnknown(row.id, owner)
    return err(HaiReachError.SEND_FAILED, reachM('reach_deliveryUnknown'))
  }
  if (!provider.isConnected()) {
    await repo.failClaim(row, owner, 'provider_unavailable')
    return err(HaiReachError.NOT_INITIALIZED, reachM('reach_notInitialized'))
  }

  let message: ReachMessage
  try {
    message = {
      provider: row.provider,
      to: row.toAddr,
      subject: row.subject ?? undefined,
      body: row.body ?? undefined,
      template: row.template ?? undefined,
      vars: row.varsJson ? JSON.parse(row.varsJson) as Record<string, string> : undefined,
      extra: row.extraJson ? JSON.parse(row.extraJson) as Record<string, unknown> : undefined,
      idempotencyKey: row.queueId,
    }
  }
  catch (cause) {
    // 坏持久化载荷不会随重试改善；尚未调用外部服务，直接进入死信。
    await repo.failClaim(row, owner, 'invalid_message', true)
    return err(HaiReachError.SEND_FAILED, reachM('reach_sendRecordSaveFailed'), cause)
  }

  const started = await repo.beginDelivery(row.id, owner, retrySafe, leaseMs)
  if (!started.success)
    return started

  let stopped = false
  let lost = false
  let renewing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const renew = async () => {
    try {
      const result = await repo.renewClaim(row.id, owner, leaseMs)
      lost = !result.success
    }
    catch {
      lost = true
    }
    if (!stopped && !lost) {
      timer = setTimeout(() => {
        renewing = renew()
      }, Math.max(1, Math.floor(leaseMs / 3)))
    }
  }
  timer = setTimeout(() => {
    renewing = renew()
  }, Math.max(1, Math.floor(leaseMs / 3)))

  let outcome: HaiResult<SendResult>
  try {
    outcome = await provider.send(message)
  }
  catch (cause) {
    outcome = err(HaiReachError.SEND_FAILED, reachM('reach_deliveryUnknown'), cause)
  }
  finally {
    stopped = true
    clearTimeout(timer)
    await renewing
  }

  if (lost) {
    if (!retrySafe)
      await repo.markUnknown(row.id, owner)
    return err(HaiReachError.SEND_FAILED, reachM('reach_claimLost'))
  }
  if (outcome.success && outcome.data.success) {
    const marked = await repo.markSent(row.id, owner, outcome.data.messageId)
    if (!marked.success && !retrySafe)
      await repo.markUnknown(row.id, owner)
    return marked
  }
  if (!retrySafe) {
    await repo.markUnknown(row.id, owner)
    logger.warn('Delivery outcome is unknown; automatic redelivery stopped', { queueId: row.queueId, provider: row.provider })
    return err(HaiReachError.SEND_FAILED, reachM('reach_deliveryUnknown'), outcome.success ? undefined : outcome.error)
  }
  // 接收端持久去重时，响应丢失也可以在之后使用同一个 queueId 重试。
  const permanent = !outcome.success && [HaiReachError.DELIVERY_REJECTED.code, HaiReachError.INVALID_RECIPIENT.code].includes(outcome.error.code)
  const released = await repo.failClaim(row, owner, permanent ? 'permanent_rejection' : 'transient_failure', permanent)
  if (!released.success)
    return released
  return err(HaiReachError.SEND_FAILED, reachM('reach_deliveryUnknown'), outcome.success ? undefined : outcome.error)
}
