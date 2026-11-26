import type {
  FeedbackAddMessageInput,
  FeedbackAttachmentData,
  FeedbackAttachmentQuery,
  FeedbackDetail,
  FeedbackListInput,
  FeedbackMessage,
  FeedbackMessageQuery,
  FeedbackReport,
  FeedbackSetStatusInput,
  FeedbackSubmitInput,
} from '@h-ai/api-contract/feedback'
import type { HaiResult, PaginatedResult } from '@h-ai/core'

/** 反馈视图通过宿主已鉴权的操作访问服务。 */
export interface FeedbackViewActions {
  list: (query: FeedbackListInput) => Promise<HaiResult<PaginatedResult<FeedbackReport>>>
  get: (input: { id: string }) => Promise<HaiResult<FeedbackDetail>>
  listMessages: (query: FeedbackMessageQuery) => Promise<HaiResult<PaginatedResult<FeedbackMessage>>>
  addMessage: (input: FeedbackAddMessageInput) => Promise<HaiResult<FeedbackMessage>>
  getAttachment: (input: FeedbackAttachmentQuery) => Promise<HaiResult<FeedbackAttachmentData>>
  setStatus?: (input: FeedbackSetStatusInput) => Promise<HaiResult<FeedbackReport>>
}

/** 验证并发送本次选中的正文与附件，成功结果可由宿主接收。 */
export type FeedbackSubmitAction = (input: FeedbackSubmitInput) => Promise<HaiResult<unknown>>
