import type { HaiResult } from '@h-ai/core'
import type { ReachQueueEntry, ReachQueueOperations } from './reach-types.js'
import type { SendLogRepository, StoredSendLog } from './repositories/reach-repository-send-log.js'
import { core } from '@h-ai/core'
import { ReachDeadRequeueSchema, ReachQueueIdSchema, ReachQueueListSchema, ReachUnknownResolutionSchema } from './reach-config.js'
import { reachM } from './reach-i18n.js'
import { HaiReachError } from './reach-types.js'

/**
 * 把敏感日志实体投影成运维元数据，排除收件人、正文、vars/extra和owner凭据。
 * @param row - 已确认queueId非空且字段规范化的队列行。
 * @returns 对外可查询的元数据；不能据此替代运维授权。
 *
 * @example 模块内部上下文
 * ```ts
 * function safeEntry(row: StoredSendLog): ReachQueueEntry | null {
 *   if (!row.queueId) return null
 *   return queueEntry(row)
 * }
 * ```
 */
function queueEntry(row: StoredSendLog): ReachQueueEntry {
  return {
    queueId: row.queueId!,
    provider: row.provider,
    status: row.status,
    updatedAt: row.updatedAt,
    messageId: row.messageId ?? undefined,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    lastFailure: row.lastFailure ?? undefined,
  }
}

/**
 * 组装发送队列的查询与人工处置，调用时检查当前模块和仓库是否可用。
 * @param isInitialized - 判断当前运行期是否已发布供应商。
 * @param getRepository - 取当前运行期的发送日志仓库。
 * @param unavailable - 构造未初始化失败结果。
 * @returns 稳定的队列操作对象；成功查询只返回运维所需的字段。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function inspectQueue(queue: ReachQueueOperations, queueId: string) {
 *   const result = await queue.get(queueId)
 *   if (!result.success) return result
 *   return result.data?.status
 * }
 * ```
 */
export function createReachQueueOperations(
  isInitialized: () => boolean,
  getRepository: () => SendLogRepository | null,
  unavailable: <T>() => HaiResult<T>,
): ReachQueueOperations {
  return {
    async get(queueId) {
      if (!isInitialized())
        return unavailable()
      if (!getRepository())
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_dndPersistenceRequired'))
      if (!ReachQueueIdSchema.safeParse(queueId).success)
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_queueInputInvalid'))
      const rows = await getRepository()!.findAll({
        where: 'queue_id = ?',
        params: [queueId],
        limit: 1,
      })
      if (!rows.success)
        return rows
      const row = rows.data[0]
      return core.ok(row
        ? queueEntry(row)
        : null)
    },
    async list(options) {
      if (!isInitialized())
        return unavailable()
      if (!getRepository())
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_dndPersistenceRequired'))
      const parsed = ReachQueueListSchema.safeParse(options)
      if (!parsed.success)
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_queueInputInvalid'))
      const rows = await getRepository()!.findAll({
        where: 'status = ? AND queue_id IS NOT NULL',
        params: [parsed.data.status],
        orderBy: 'created_at ASC, id ASC',
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      })
      return rows.success
        ? core.ok(rows.data.map(queueEntry))
        : rows
    },
    async requeueDead(queueId, options) {
      if (!isInitialized())
        return unavailable()
      if (!getRepository())
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_dndPersistenceRequired'))
      const parsed = ReachDeadRequeueSchema.safeParse(options)
      if (!ReachQueueIdSchema.safeParse(queueId).success || !parsed.success)
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_queueInputInvalid'))
      return getRepository()!.requeueDead(queueId, parsed.data.expectedUpdatedAt)
    },
    async resolveUnknown(queueId, resolution) {
      if (!isInitialized())
        return unavailable()
      if (!getRepository())
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_dndPersistenceRequired'))
      const parsed = ReachUnknownResolutionSchema.safeParse(resolution)
      if (!ReachQueueIdSchema.safeParse(queueId).success || !parsed.success)
        return core.err(HaiReachError.CONFIG_ERROR, reachM('reach_queueInputInvalid'))
      return getRepository()!.resolveUnknown(queueId, parsed.data)
    },
  }
}
