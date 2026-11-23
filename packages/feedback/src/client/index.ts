import { createFeedbackBundle, getFeedbackBundleViewerFiles, queryFeedbackBundle, readFeedbackBundle, summarizeFeedbackBundle } from '../bundle/feedback-bundle-functions.js'
import { configureFeedbackSaving, feedbackDataBytes, saveFeedbackFile } from './feedback-client-files.js'
import { createFeedbackClient, feedbackClient } from './feedback-client-main.js'
import { createFeedbackReview } from './feedback-client-review.js'

export type * from '../bundle/feedback-bundle-types.js'

export type { FeedbackFileSaver, FeedbackSaveResult } from './feedback-client-files.js'
export type { FeedbackReviewActions } from './feedback-client-review.js'
export type * from './feedback-client-types.js'

/**
 * 当前环境的 Feedback 操作入口。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback/client'
 *
 * // 创建独立采集客户端；不再使用时释放观察器和临时状态。
 * const client = feedback.createClient()
 * await client.close()
 * ```
 */
export const feedback = {
  createBundle: createFeedbackBundle,
  getBundleViewerFiles: getFeedbackBundleViewerFiles,
  queryBundle: queryFeedbackBundle,
  readBundle: readFeedbackBundle,
  summarizeBundle: summarizeFeedbackBundle,
  client: feedbackClient,
  configureSaving: configureFeedbackSaving,
  dataBytes: feedbackDataBytes,
  saveFile: saveFeedbackFile,
  createClient: createFeedbackClient,
  createReview: createFeedbackReview,
}
