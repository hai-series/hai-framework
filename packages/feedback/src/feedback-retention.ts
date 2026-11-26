import type { FeedbackReportRepository } from './feedback-repository.js'
import { setImmediate } from 'node:timers/promises'
import { core } from '@h-ai/core'

const batchSize = 200
const intervalMs = 60 * 60 * 1000

/** 清理过程绑定反馈模块生命周期。共享数据库可安全重复删除同一批记录。 */
export function startFeedbackRetention(repository: FeedbackReportRepository): () => Promise<void> {
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void>

  async function sweep() {
    try {
      let more = true
      while (more) {
        if (closed)
          break
        const expired = await repository.deleteExpired(batchSize)
        if (!expired.success) {
          core.logger.warn('Feedback retention cleanup failed', { module: 'feedback', errorCode: expired.error.code, traceId: expired.error.traceId })
          break
        }
        more = expired.data
        if (more)
          await setImmediate()
      }
    }
    catch {
      core.logger.warn('Unexpected feedback retention cleanup failure', { module: 'feedback' })
    }
    finally {
      if (!closed) {
        timer = setTimeout(() => {
          pending = sweep()
        }, intervalMs)
        timer.unref()
      }
    }
  }

  pending = sweep()
  return async () => {
    closed = true
    clearTimeout(timer)
    await pending
  }
}
