import type { FeedbackHttpOperations } from '@h-ai/api-contract/feedback'
import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { FeedbackConfig, FeedbackConfigInput } from './feedback-config.js'
import { core } from '@h-ai/core'

const FeedbackErrorInfo = {
  NOT_INITIALIZED: '010:503',
  INIT_IN_PROGRESS: '011:409',
  CONFIG_ERROR: '013:500',
  OPERATION_FAILED: '020:500',
  NOT_FOUND: '021:404',
  FORBIDDEN: '022:403',
  CONFLICT: '023:409',
  INVALID_INPUT: '025:400',
} satisfies ErrorInfo

/** 反馈服务公开错误定义。 */
export const HaiFeedbackError = core.error.buildHaiErrorsDef('feedback', FeedbackErrorInfo)

/** 使用 RelDB 保存反馈、对话和私有附件的服务。 */
export interface FeedbackFunctions extends FeedbackHttpOperations {
  init: (config: FeedbackConfigInput) => Promise<HaiResult<void>>
  close: () => Promise<HaiResult<void>>
  readonly config: FeedbackConfig | null
}

export type {
  FeedbackAddMessageInput,
  FeedbackAttachment,
  FeedbackAttachmentData,
  FeedbackAttachmentInput,
  FeedbackAttachmentQuery,
  FeedbackContext,
  FeedbackDetail,
  FeedbackListInput,
  FeedbackMessage,
  FeedbackMessageQuery,
  FeedbackReport,
  FeedbackSetStatusInput,
  FeedbackStatus,
  FeedbackSubmitInput,
} from '@h-ai/api-contract/feedback'
