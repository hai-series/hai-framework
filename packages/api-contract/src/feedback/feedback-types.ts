import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type {
  FeedbackAddMessageInput,
  FeedbackAttachmentData,
  FeedbackAttachmentQuery,
  FeedbackDetail,
  FeedbackLimits,
  FeedbackListInput,
  FeedbackMessage,
  FeedbackMessageQuery,
  FeedbackReport,
  FeedbackSetStatusInput,
  FeedbackSubmitInput,
} from './feedback-schemas.js'

/**
 * 由可信服务端认证与授权策略生成的范围。HTTP 输入不能指定此对象。
 * @example
 * ```ts
 * import type { FeedbackContext } from '@h-ai/api-contract/feedback'
 * const context: FeedbackContext = { scopeId: 'tenant-1', userId: 'user-1', permissions: ['feedback:create'] }
 * void context
 * ```
 */
export interface FeedbackContext {
  scopeId: string
  userId: string
  permissions?: readonly string[]
}

/** HTTP 反馈适配器使用的服务状态及会话操作。 */
export interface FeedbackHttpOperations {
  readonly isInitialized: boolean
  getLimits: (context: FeedbackContext) => Promise<HaiResult<FeedbackLimits>>
  submit: (input: FeedbackSubmitInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  listMine: (input: FeedbackListInput, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackReport>>>
  list: (input: FeedbackListInput, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackReport>>>
  get: (id: string, context: FeedbackContext) => Promise<HaiResult<FeedbackDetail>>
  listMessages: (input: FeedbackMessageQuery, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackMessage>>>
  addMessage: (input: FeedbackAddMessageInput, context: FeedbackContext) => Promise<HaiResult<FeedbackMessage>>
  setStatus: (input: FeedbackSetStatusInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  getAttachment: (input: FeedbackAttachmentQuery, context: FeedbackContext) => Promise<HaiResult<FeedbackAttachmentData>>
}
