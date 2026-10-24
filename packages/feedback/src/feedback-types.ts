import type {
  FeedbackAppendEvidenceInput,
  FeedbackAttachment,
  FeedbackAttachmentData,
  FeedbackCompleteInput,
  FeedbackDetail,
  FeedbackEvidence,
  FeedbackEvidenceQuery,
  FeedbackExportInput,
  FeedbackJob,
  FeedbackListInput,
  FeedbackReport,
  FeedbackRetryInput,
  FeedbackSetStatusInput,
  FeedbackSubmitInput,
  FeedbackUploadInput,
} from '@h-ai/api-contract/feedback'
import type { ErrorInfo, HaiResult, PaginatedResult } from '@h-ai/core'
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
  LIMIT_EXCEEDED: '024:413',
  INVALID_INPUT: '025:400',
  CHECKSUM_MISMATCH: '026:422',
} satisfies ErrorInfo

/**
 * Feedback 错误定义。
 * @example
 * ```ts
 * import { HaiFeedbackError } from '@h-ai/feedback'
 * const code = HaiFeedbackError.NOT_FOUND.code
 * void code
 * ```
 */
export const HaiFeedbackError = core.error.buildHaiErrorsDef('feedback', FeedbackErrorInfo)

/**
 * 由可信服务端认证与授权策略生成的范围；HTTP 输入不能指定此对象。
 * @example
 * ```ts
 * import type { FeedbackContext } from '@h-ai/feedback'
 * const context: FeedbackContext = { scopeId: 'tenant-1', userId: 'user-1', permissions: ['feedback:create'] }
 * void context
 * ```
 */
export interface FeedbackContext {
  scopeId: string
  userId: string
  permissions?: readonly string[]
}

/**
 * 反馈服务对象；领域操作返回 HaiResult，close 不释放宿主依赖连接。
 * @example
 * ```ts
 * import type { FeedbackContext, FeedbackFunctions } from '@h-ai/feedback'
 * async function submit(service: FeedbackFunctions, context: FeedbackContext) {
 *   const result = await service.submit({ appId: 'orders', submissionId: 'stable-operation-id' }, context)
 *   return result.success ? result.data.id : result.error.code
 * }
 * void submit
 * ```
 */
export interface FeedbackFunctions {
  init: (config: FeedbackConfigInput) => Promise<HaiResult<void>>
  close: () => Promise<HaiResult<void>>
  readonly isInitialized: boolean
  readonly config: FeedbackConfig | null
  submit: (input: FeedbackSubmitInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  list: (input: FeedbackListInput, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackReport>>>
  get: (id: string, context: FeedbackContext) => Promise<HaiResult<FeedbackDetail>>
  getEvidence: (input: FeedbackEvidenceQuery, context: FeedbackContext) => Promise<HaiResult<PaginatedResult<FeedbackEvidence>>>
  setStatus: (input: FeedbackSetStatusInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  appendEvidence: (input: FeedbackAppendEvidenceInput, context: FeedbackContext) => Promise<HaiResult<{ acknowledged: string[], evidenceRevision: number }>>
  completeCollection: (input: FeedbackCompleteInput, context: FeedbackContext) => Promise<HaiResult<FeedbackReport>>
  uploadAttachment: (input: FeedbackUploadInput, context: FeedbackContext) => Promise<HaiResult<FeedbackAttachment>>
  getAttachment: (input: { id: string, attachmentId: string }, context: FeedbackContext) => Promise<HaiResult<FeedbackAttachmentData>>
  retry: (input: FeedbackRetryInput, context: FeedbackContext) => Promise<HaiResult<void>>
  export: (input: FeedbackExportInput, context: FeedbackContext) => Promise<HaiResult<FeedbackJob>>
  getExport: (input: { id: string, jobId: string }, context: FeedbackContext) => Promise<HaiResult<FeedbackAttachmentData>>
  runJobs: () => Promise<HaiResult<{ processed: number }>>
}

export type {
  FeedbackAppendEvidenceInput,
  FeedbackAttachment,
  FeedbackAttachmentData,
  FeedbackCompleteInput,
  FeedbackDetail,
  FeedbackEvidence,
  FeedbackEvidenceQuery,
  FeedbackExportInput,
  FeedbackJob,
  FeedbackListInput,
  FeedbackReport,
  FeedbackRetryInput,
  FeedbackSetStatusInput,
  FeedbackSubmitInput,
  FeedbackUploadInput,
} from '@h-ai/api-contract/feedback'
