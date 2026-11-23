import { createFeedbackBundle, getFeedbackBundleViewerFiles, queryFeedbackBundle, readFeedbackBundle, summarizeFeedbackBundle } from './feedback-bundle-functions.js'

export type * from './feedback-bundle-types.js'

/**
 * 当前环境的 Feedback 操作入口。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback/bundle'
 *
 * // 将示例报告打包；成功 data 为 ZIP 字节，失败读取 error。
 * const bundle = await feedback.createBundle({ report: { id: 'example' }, evidence: [], attachments: [] })
 * if (!bundle.success) throw new Error(bundle.error.message)
 * void bundle.data
 * ```
 */
export const feedback = {
  createBundle: createFeedbackBundle,
  readBundle: readFeedbackBundle,
  summarizeBundle: summarizeFeedbackBundle,
  queryBundle: queryFeedbackBundle,
  getBundleViewerFiles: getFeedbackBundleViewerFiles,
}
