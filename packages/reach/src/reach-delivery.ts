/**
 * 单条队列投递：发送前持久化门闩、在途续租及未知结果隔离。
 * @module reach-delivery
 */
import type { HaiResult } from '@h-ai/core'
import type { ReachMessage, ReachProvider, SendResult } from './reach-types.js'
import type { SendLogRepository, StoredSendLog } from './repositories/reach-repository-send-log.js'
import { core, err } from '@h-ai/core'
import { reachM } from './reach-i18n.js'
import { HaiReachError } from './reach-types.js'

const logger = core.logger.child({ module: 'reach', scope: 'delivery' })
const DEFAULT_LEASE_MS = 10 * 60 * 1000

/**
 * 投递已领取的一条消息；仅接收端幂等的在途请求允许自动恢复。
 *
 * 非幂等请求一旦开始，失败或失去租约均进入 unknown。续租只是减少接管，
 * 不能撤销已经产生的外部副作用；暂停后恢复的旧 API 请求仍须由接收端按同键去重。
 *
 * @param row - 当前 owner 已领取的持久化消息
 * @param owner - 本次领取独有的凭据
 * @param provider - 已连接的 Provider
 * @param repo - 共享数据库队列仓库
 * @param leaseMs - 租约毫秒数，测试可指定较短时间
 * @returns 已提交投递结果，或明确失败/未知状态
 * @example await deliverClaimedMessage(row, owner, provider, repository)
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
    await repo.releaseClaim(row.id, owner)
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
    // 此时尚未进入 sending，没有开始外部投递，可以安全释放。
    await repo.releaseClaim(row.id, owner)
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
  const released = await repo.releaseClaim(row.id, owner)
  if (!released.success)
    return released
  return err(HaiReachError.SEND_FAILED, reachM('reach_deliveryUnknown'), outcome.success ? undefined : outcome.error)
}
