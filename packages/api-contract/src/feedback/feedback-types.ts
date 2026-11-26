import type { HaiResult, PaginatedResult } from '@h-ai/core'
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
} from './feedback-schemas.js'

/** 由宿主根据可信会话确定的反馈身份、数据范围及权限。 */
export interface FeedbackContext {
  scopeId: string
  userId: string
  permissions?: readonly string[]
}

/** HTTP 反馈适配器使用的服务状态及会话操作。 */
export interface FeedbackHttpOperations {
  readonly isInitialized: boolean
  submit: (input: FeedbackSubmitInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  listMine: (input: FeedbackListInput, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackReport>>>
  list: (input: FeedbackListInput, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackReport>>>
  get: (id: string, context: FeedbackContext) => Promise<HaiResult<FeedbackDetail>>
  listMessages: (input: FeedbackMessageQuery, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackMessage>>>
  addMessage: (input: FeedbackAddMessageInput, context: FeedbackContext) => Promise<HaiResult<FeedbackMessage>>
  setStatus: (input: FeedbackSetStatusInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  getAttachment: (input: FeedbackAttachmentQuery, context: FeedbackContext) => Promise<HaiResult<FeedbackAttachmentData>>
}
