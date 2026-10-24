/** @h-ai/api-contract — 反馈的受权 HTTP 契约。 */
import { paginatedSchema } from '../common/pagination-schemas.js'
import { haiResultSchema, HaiVoidResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  FeedbackAppendEvidenceInputSchema,
  FeedbackAttachmentDataSchema,
  FeedbackAttachmentQuerySchema,
  FeedbackAttachmentSchema,
  FeedbackCompleteInputSchema,
  FeedbackDetailSchema,
  FeedbackEvidenceAckSchema,
  FeedbackEvidenceQuerySchema,
  FeedbackEvidenceSchema,
  FeedbackExportInputSchema,
  FeedbackExportQuerySchema,
  FeedbackIdInputSchema,
  FeedbackJobSchema,
  FeedbackListInputSchema,
  FeedbackReportSchema,
  FeedbackRetryInputSchema,
  FeedbackSetStatusInputSchema,
  FeedbackSubmitInputSchema,
  FeedbackUploadInputSchema,
} from './feedback-schemas.js'

/**
 * 反馈契约，宿主自行决定是否挂载。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * const contract = apiContract.create({ feedback: apiContract.feedback })
 * const path = apiContract.pathOf(contract.feedback.reports.submit)
 * ```
 */
export const feedbackContract = {
  reports: {
    submit: route({ method: 'POST', path: '/feedback/reports', operationId: 'feedback.reports.submit', summary: 'submit feedback', tags: ['feedback'] })
      .input(FeedbackSubmitInputSchema)
      .output(haiResultSchema(FeedbackReportSchema)),
    list: route({ method: 'GET', path: '/feedback/reports', operationId: 'feedback.reports.list', summary: 'list feedback', tags: ['feedback'] })
      .input(FeedbackListInputSchema)
      .output(haiResultSchema(paginatedSchema(FeedbackReportSchema))),
    get: route({ method: 'GET', path: '/feedback/reports/{id}', operationId: 'feedback.reports.get', summary: 'get feedback', tags: ['feedback'] })
      .input(FeedbackIdInputSchema)
      .output(haiResultSchema(FeedbackDetailSchema)),
    getEvidence: route({ method: 'GET', path: '/feedback/reports/{id}/evidence', operationId: 'feedback.reports.getEvidence', summary: 'getEvidence feedback', tags: ['feedback'] })
      .input(FeedbackEvidenceQuerySchema)
      .output(haiResultSchema(paginatedSchema(FeedbackEvidenceSchema))),
    setStatus: route({ method: 'PATCH', path: '/feedback/reports/{id}/status', operationId: 'feedback.reports.setStatus', summary: 'setStatus feedback', tags: ['feedback'] })
      .input(FeedbackSetStatusInputSchema)
      .output(haiResultSchema(FeedbackReportSchema)),
    retry: route({ method: 'POST', path: '/feedback/reports/{id}/retry', operationId: 'feedback.reports.retry', summary: 'retry feedback', tags: ['feedback'] })
      .input(FeedbackRetryInputSchema)
      .output(HaiVoidResultSchema),
    export: route({ method: 'POST', path: '/feedback/reports/{id}/exports', operationId: 'feedback.reports.export', summary: 'export feedback', tags: ['feedback'] })
      .input(FeedbackExportInputSchema)
      .output(haiResultSchema(FeedbackJobSchema)),
    appendEvidence: route({ method: 'POST', path: '/feedback/reports/{id}/evidence', operationId: 'feedback.reports.appendEvidence', summary: 'appendEvidence feedback', tags: ['feedback'] })
      .input(FeedbackAppendEvidenceInputSchema)
      .output(haiResultSchema(FeedbackEvidenceAckSchema)),
    getExport: route({ method: 'GET', path: '/feedback/reports/{id}/exports/{jobId}', operationId: 'feedback.reports.getExport', summary: 'Download feedback export', tags: ['feedback'] })
      .input(FeedbackExportQuerySchema)
      .output(haiResultSchema(FeedbackAttachmentDataSchema)),
    completeCollection: route({ method: 'POST', path: '/feedback/reports/{id}/complete', operationId: 'feedback.reports.completeCollection', summary: 'completeCollection feedback', tags: ['feedback'] })
      .input(FeedbackCompleteInputSchema)
      .output(haiResultSchema(FeedbackReportSchema)),
  },
  attachments: {
    upload: route({ method: 'POST', path: '/feedback/reports/{id}/attachments/{attachmentId}', operationId: 'feedback.attachments.upload', summary: 'Upload feedback attachment', tags: ['feedback'] })
      .input(FeedbackUploadInputSchema)
      .output(haiResultSchema(FeedbackAttachmentSchema)),
    get: route({ method: 'GET', path: '/feedback/reports/{id}/attachments/{attachmentId}', operationId: 'feedback.attachments.get', summary: 'Read feedback attachment', tags: ['feedback'] })
      .input(FeedbackAttachmentQuerySchema)
      .output(haiResultSchema(FeedbackAttachmentDataSchema)),
  },
}

/**
 * 反馈 typed client 的契约类型。
 * @example
 * ```ts
 * import type { FeedbackContract } from '@h-ai/api-contract'
 * import { apiContract } from '@h-ai/api-contract'
 * const contract: FeedbackContract = apiContract.feedback
 * ```
 */
export type FeedbackContract = typeof feedbackContract
