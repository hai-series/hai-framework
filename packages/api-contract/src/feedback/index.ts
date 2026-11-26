import { feedbackRequestBytes, feedbackTransportRoutes } from './feedback-budget.js'
import { feedbackContract } from './feedback-contract.js'
import { createFeedbackWriteSchemas } from './feedback-schemas.js'

export { feedbackLimits } from './feedback-budget.js'
export type { FeedbackContract } from './feedback-contract.js'
export {
  FeedbackAddMessageInputSchema,
  FeedbackAttachmentDataSchema,
  FeedbackAttachmentInputSchema,
  FeedbackAttachmentKindSchema,
  FeedbackAttachmentQuerySchema,
  FeedbackAttachmentSchema,
  FeedbackCaptureInputSchema,
  FeedbackDetailSchema,
  FeedbackIdInputSchema,
  FeedbackLimitsSchema,
  FeedbackListInputSchema,
  FeedbackMessageKindSchema,
  FeedbackMessageQuerySchema,
  FeedbackMessageSchema,
  FeedbackReportSchema,
  FeedbackSetStatusInputSchema,
  FeedbackStatusSchema,
  FeedbackSubmissionLimitsSchema,
  FeedbackSubmitInputSchema,
} from './feedback-schemas.js'
export type {
  FeedbackAddMessageInput,
  FeedbackAttachment,
  FeedbackAttachmentData,
  FeedbackAttachmentInput,
  FeedbackAttachmentKind,
  FeedbackAttachmentQuery,
  FeedbackCaptureInput,
  FeedbackDetail,
  FeedbackLimits,
  FeedbackListInput,
  FeedbackMessage,
  FeedbackMessageQuery,
  FeedbackReport,
  FeedbackSetStatusInput,
  FeedbackStatus,
  FeedbackSubmitInput,
} from './feedback-schemas.js'
export type { FeedbackContext, FeedbackHttpOperations } from './feedback-types.js'

/** 仅装配反馈路由的子路径，适用于客户端。 */
export const apiContract = {
  feedback: feedbackContract,
  feedbackTransportRoutes,
  feedbackRequestBytes,
  createFeedbackWriteSchemas,
}
