/** 详情接入统一处理导出轮询、回放分页和取消，不依赖 UI 或平台 SDK。 */
import type { FeedbackAttachmentData, FeedbackDetail, FeedbackEvidence, FeedbackEvidenceQuery, FeedbackExportInput, FeedbackJob } from '@h-ai/api-contract/feedback'
import type { HaiResult, PaginatedResult } from '@h-ai/core'
import { err, ok } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'
import { feedbackDataBytes, saveFeedbackFile } from './feedback-client-files.js'

/**
 * 管理接口可直接传入 typedClient.feedback.reports；授权由服务端再次核验。
 * @example
 * ```ts
 * import type { FeedbackReviewActions } from '@h-ai/feedback/client'
 * function load(actions: FeedbackReviewActions) { return actions.get({ id: 'report-id' }) }
 * ```
 */
export interface FeedbackReviewActions {
  get: (input: { id: string }) => Promise<HaiResult<FeedbackDetail>>
  getEvidence: (input: FeedbackEvidenceQuery) => Promise<HaiResult<PaginatedResult<FeedbackEvidence>>>
  export: (input: FeedbackExportInput) => Promise<HaiResult<FeedbackJob>>
  getExport: (input: { id: string, jobId: string }) => Promise<HaiResult<FeedbackAttachmentData>>
}

/**
 * 创建可取消的详情动作；退出账号调用 close，旧轮询不能继续下载到新会话。
 * @example
 * ```ts
 * import { createFeedbackReview, type FeedbackReviewActions } from '@h-ai/feedback/client'
 * async function exportReport(actions: FeedbackReviewActions) {
 *   const review = createFeedbackReview(actions)
 *   const result = await review.exportReport('report-id')
 *   review.close()
 *   return result
 * }
 * ```
 */
export function createFeedbackReview(actions: FeedbackReviewActions) {
  let controller = new AbortController()
  const failed = () => err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
  return {
    close() {
      controller.abort()
      controller = new AbortController()
    },
    async loadReplay(id: string): Promise<HaiResult<FeedbackEvidence[]>> {
      const signal = controller.signal
      const events: FeedbackEvidence[] = []
      try {
        for (let page = 1; page <= 100; page++) {
          const result = await actions.getEvidence({ id, kind: 'replay', page, pageSize: 100 })
          if (signal.aborted)
            return failed()
          if (!result.success)
            return result
          events.push(...result.data.items)
          if (events.length >= result.data.total || !result.data.items.length)
            return ok(events)
        }
      }
      catch {
        return failed()
      }
      return failed()
    },
    async exportReport(id: string) {
      const signal = controller.signal
      try {
        const started = await actions.export({ id })
        if (!started.success)
          return started
        for (let attempt = 0; attempt < 120; attempt++) {
          if (signal.aborted)
            return failed()
          const detail = await actions.get({ id })
          if (!detail.success)
            return detail
          if (signal.aborted)
            return failed()
          const job = detail.data.jobs.find(job => job.id === started.data.id)
          if (!job || job.status === 'failed')
            return failed()
          if (job.status === 'succeeded') {
            const file = await actions.getExport({ id, jobId: job.id })
            if (signal.aborted)
              return failed()
            return file.success ? saveFeedbackFile(feedbackDataBytes(file.data), file.data.name, file.data.contentType, signal) : file
          }
          await new Promise<void>((resolve) => {
            let timer: ReturnType<typeof setTimeout>
            const done = () => {
              clearTimeout(timer)
              signal.removeEventListener('abort', done)
              resolve()
            }
            timer = setTimeout(done, 500)
            signal.addEventListener('abort', done, { once: true })
          })
        }
      }
      catch {
        return failed()
      }
      return failed()
    },
  }
}
