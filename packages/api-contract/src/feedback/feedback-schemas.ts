/**
 * @h-ai/api-contract — 反馈的跨端数据契约。
 * 身份、租户、存储 key 和通知收件人只由可信服务端确定，不接受客户端覆盖。
 */
import { z } from 'zod'
import { PaginationQuerySchema } from '../common/pagination-schemas.js'

const id = z.string().min(1).max(128)
// 附件标识须可无损编码为 Unicode；正常代理对（如 emoji）不受限。
const attachmentId = id.regex(/^[^\uD800-\uDFFF]*$/u)
const timestamp = z.number().int().nonnegative().safe()
const jsonObject = z.record(z.string(), z.json())

/**
 * 反馈处理状态。
 * @example
 * ```ts
 * import { FeedbackStatusSchema } from '@h-ai/api-contract'
 * FeedbackStatusSchema.parse('pending')
 * ```
 */
export const FeedbackStatusSchema = z.enum(['pending', 'handled'])
/**
 * 材料状态。
 * @example
 * ```ts
 * import { FeedbackCollectionStatusSchema } from '@h-ai/api-contract'
 * FeedbackCollectionStatusSchema.parse('collecting')
 * ```
 */
export const FeedbackCollectionStatusSchema = z.enum(['collecting', 'complete', 'partial', 'failed'])
/**
 * 通知状态，sent 仅表示邮件服务受理。
 * @example
 * ```ts
 * import { FeedbackNotificationStatusSchema } from '@h-ai/api-contract'
 * FeedbackNotificationStatusSchema.parse('pending')
 * ```
 */
export const FeedbackNotificationStatusSchema = z.enum(['disabled', 'pending', 'sending', 'sent', 'deferred', 'failed'])

/**
 * 单条有界、JSON 可序列化的诊断证据。
 * @example
 * ```ts
 * import { FeedbackEvidenceInputSchema } from '@h-ai/api-contract'
 * FeedbackEvidenceInputSchema.parse({ id: 'event-1', source: 'browser', sequence: 1, kind: 'log', timestamp: 1, data: { message: 'Failed' } })
 * ```
 */
export const FeedbackEvidenceInputSchema = z.strictObject({
  id,
  source: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative().safe(),
  kind: z.enum(['log', 'error', 'request', 'interaction', 'environment', 'snapshot', 'replay', 'business', 'missing']),
  timestamp,
  requestId: id.optional(),
  errorId: id.optional(),
  data: jsonObject,
  missingReason: z.string().max(2000).optional(),
})
/**
 * 已保存证据及所属修订。
 * @example
 * ```ts
 * import { FeedbackEvidenceSchema } from '@h-ai/api-contract'
 * FeedbackEvidenceSchema.parse({ id: 'event-1', feedbackId: 'report-1', revision: 1, source: 'browser', sequence: 1, kind: 'log', timestamp: 1, data: {} })
 * ```
 */
export const FeedbackEvidenceSchema = FeedbackEvidenceInputSchema.extend({ feedbackId: id, revision: z.number().int().min(1) })

/**
 * 附件声明，不含可指定的 S3 key。
 * @example
 * ```ts
 * import { FeedbackAttachmentInputSchema } from '@h-ai/api-contract'
 * FeedbackAttachmentInputSchema.parse({ id: 'image-1', name: 'screen.png', contentType: 'image/png', size: 4, checksum: '0'.repeat(64) })
 * ```
 */
export const FeedbackAttachmentInputSchema = z.strictObject({
  id: attachmentId,
  name: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  size: z.number().int().min(0).max(5 * 1024 * 1024),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
})
/**
 * 附件的受权元数据。
 * @example
 * ```ts
 * import { FeedbackAttachmentSchema } from '@h-ai/api-contract'
 * FeedbackAttachmentSchema.parse({ id: 'image-1', feedbackId: 'report-1', name: 'screen.png', contentType: 'image/png', size: 4, checksum: '0'.repeat(64), status: 'pending' })
 * ```
 */
export const FeedbackAttachmentSchema = FeedbackAttachmentInputSchema.extend({
  feedbackId: id,
  status: z.enum(['pending', 'available', 'failed']),
  missingReason: z.string().max(2000).optional(),
})

/**
 * 幂等反馈提交；所有补充输入均可选。
 * @example
 * ```ts
 * import { FeedbackSubmitInputSchema } from '@h-ai/api-contract'
 * FeedbackSubmitInputSchema.parse({ submissionId: 'submit-1', appId: 'orders' })
 * ```
 */
export const FeedbackSubmitInputSchema = z.strictObject({
  submissionId: id,
  appId: id,
  description: z.string().max(10000).optional(),
  category: z.string().max(64).optional(),
  contact: z.string().max(320).optional(),
  url: z.string().max(2048).optional(),
  appVersion: z.string().max(128).optional(),
  buildId: z.string().max(128).optional(),
  commit: z.string().max(128).optional(),
  anchor: z.strictObject({ kind: z.enum(['error', 'feedback']), timestamp, errorId: id.optional() }).optional(),
  evidence: z.array(FeedbackEvidenceInputSchema).max(1000).optional(),
  attachments: z.array(FeedbackAttachmentInputSchema).max(20).optional(),
})

/**
 * 反馈摘要，应用版本与乐观锁 version 分开。
 * @example
 * ```ts
 * import { FeedbackReportSchema } from '@h-ai/api-contract'
 * FeedbackReportSchema.parse({ id: 'report-1', number: 'FB-1', appId: 'orders', scopeId: 'tenant-1', userId: 'user-1', status: 'pending', collectionStatus: 'collecting', notificationStatus: 'pending', createdAt: 1, updatedAt: 1, version: 1, evidenceRevision: 1 })
 * ```
 */
export const FeedbackReportSchema = z.object({
  id,
  number: z.string(),
  appId: id,
  scopeId: id,
  userId: id,
  status: FeedbackStatusSchema,
  collectionStatus: FeedbackCollectionStatusSchema,
  notificationStatus: FeedbackNotificationStatusSchema,
  description: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),
  contact: z.string().optional(),
  url: z.string().optional(),
  appVersion: z.string().optional(),
  buildId: z.string().optional(),
  commit: z.string().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  version: z.number().int().min(1),
  evidenceRevision: z.number().int().min(1),
})

/**
 * 列表筛选和受限分页。
 * @example
 * ```ts
 * import { FeedbackListInputSchema } from '@h-ai/api-contract'
 * FeedbackListInputSchema.parse({ page: 1, pageSize: 20 })
 * ```
 */
export const FeedbackListInputSchema = PaginationQuerySchema.extend({
  sortDirection: z.enum(['asc', 'desc']).optional(),
  status: FeedbackStatusSchema.optional(),
  collectionStatus: FeedbackCollectionStatusSchema.optional(),
  notificationStatus: FeedbackNotificationStatusSchema.optional(),
  appId: id.optional(),
  appVersion: z.string().max(128).optional(),
  search: z.string().max(200).optional(),
  from: z.coerce.number().int().nonnegative().safe().optional(),
  to: z.coerce.number().int().nonnegative().safe().optional(),
}).strict()
/**
 * 受权记录定位。
 * @example
 * ```ts
 * import { FeedbackIdInputSchema } from '@h-ai/api-contract'
 * FeedbackIdInputSchema.parse({ id: 'report-1' })
 * ```
 */
export const FeedbackIdInputSchema = z.strictObject({ id })
/**
 * 证据索引查询。
 * @example
 * ```ts
 * import { FeedbackEvidenceQuerySchema } from '@h-ai/api-contract'
 * FeedbackEvidenceQuerySchema.parse({ id: 'report-1', pageSize: 20 })
 * ```
 */
export const FeedbackEvidenceQuerySchema = PaginationQuerySchema.extend({
  id,
  source: z.string().max(128).optional(),
  kind: FeedbackEvidenceInputSchema.shape.kind.optional(),
  requestId: id.optional(),
  errorId: id.optional(),
  from: z.coerce.number().int().nonnegative().safe().optional(),
  to: z.coerce.number().int().nonnegative().safe().optional(),
}).strict()
/**
 * 状态更新必须携带已读版本。
 * @example
 * ```ts
 * import { FeedbackSetStatusInputSchema } from '@h-ai/api-contract'
 * FeedbackSetStatusInputSchema.parse({ id: 'report-1', status: 'handled', expectedVersion: 1 })
 * ```
 */
export const FeedbackSetStatusInputSchema = z.strictObject({ id, status: FeedbackStatusSchema, expectedVersion: z.number().int().min(1), note: z.string().max(10000).optional() })
/**
 * 提交后补采分块，服务端按来源序号幂等确认。
 * @example
 * ```ts
 * import { FeedbackAppendEvidenceInputSchema } from '@h-ai/api-contract'
 * FeedbackAppendEvidenceInputSchema.parse({ id: 'report-1', evidence: [] })
 * ```
 */
export const FeedbackAppendEvidenceInputSchema = z.strictObject({ id, evidence: z.array(FeedbackEvidenceInputSchema).max(1000) })
/**
 * 已可靠入库的证据确认。
 * @example
 * ```ts
 * import { FeedbackEvidenceAckSchema } from '@h-ai/api-contract'
 * FeedbackEvidenceAckSchema.parse({ acknowledged: ['event-1'], evidenceRevision: 1 })
 * ```
 */
export const FeedbackEvidenceAckSchema = z.object({ acknowledged: z.array(id), evidenceRevision: z.number().int().min(1) })
/**
 * 采集结束或部分缺失。
 * @example
 * ```ts
 * import { FeedbackCompleteInputSchema } from '@h-ai/api-contract'
 * FeedbackCompleteInputSchema.parse({ id: 'report-1', missing: [] })
 * ```
 */
export const FeedbackCompleteInputSchema = z.strictObject({ id, missing: z.array(z.string().max(2000)).max(100).optional() })
/**
 * 按任务类别重试。
 * @example
 * ```ts
 * import { FeedbackRetryInputSchema } from '@h-ai/api-contract'
 * FeedbackRetryInputSchema.parse({ id: 'report-1', target: 'notify' })
 * ```
 */
export const FeedbackRetryInputSchema = z.strictObject({ id, target: z.enum(['collect', 'notify', 'export', 'attachment']), targetId: z.string().max(128).optional() })
/**
 * 固定证据修订的导出请求。
 * @example
 * ```ts
 * import { FeedbackExportInputSchema } from '@h-ai/api-contract'
 * FeedbackExportInputSchema.parse({ id: 'report-1' })
 * ```
 */
export const FeedbackExportInputSchema = z.strictObject({ id, evidenceRevision: z.number().int().min(1).optional() })
/**
 * 已生成问题包的受权下载定位。
 * @example
 * ```ts
 * import { FeedbackExportQuerySchema } from '@h-ai/api-contract'
 * FeedbackExportQuerySchema.parse({ id: 'report-1', jobId: 'job-1' })
 * ```
 */
export const FeedbackExportQuerySchema = z.strictObject({ id, jobId: id })

/**
 * 后台任务的安全状态，不暴露邮件正文、租约和存储 key。
 * @example
 * ```ts
 * import { FeedbackJobSchema } from '@h-ai/api-contract'
 * FeedbackJobSchema.parse({ id: 'job-1', feedbackId: 'report-1', type: 'export', status: 'pending', attempts: 0, createdAt: 1, updatedAt: 1 })
 * ```
 */
export const FeedbackJobSchema = z.object({
  id,
  feedbackId: id,
  type: z.enum(['collect', 'notify', 'export', 'cleanup']),
  status: z.enum(['pending', 'running', 'succeeded', 'failed']),
  attempts: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
  nextRunAt: timestamp.optional(),
  lastError: z.string().optional(),
  result: jsonObject.optional(),
})
/**
 * 处理变更历史。
 * @example
 * ```ts
 * import { FeedbackHistorySchema } from '@h-ai/api-contract'
 * FeedbackHistorySchema.parse({ id: 'history-1', feedbackId: 'report-1', userId: 'user-1', from: 'pending', to: 'handled', timestamp: 1 })
 * ```
 */
export const FeedbackHistorySchema = z.object({ id, feedbackId: id, userId: id, from: FeedbackStatusSchema, to: FeedbackStatusSchema, timestamp, note: z.string().optional() })
/**
 * 详情按需加载，完整日志通过单独分页接口查询。
 * @example
 * ```ts
 * import type { FeedbackDetail } from '@h-ai/api-contract'
 * function numberOfAttachments(detail: FeedbackDetail) { return detail.attachments.length }
 * ```
 */
export const FeedbackDetailSchema = z.object({ report: FeedbackReportSchema, attachments: z.array(FeedbackAttachmentSchema), history: z.array(FeedbackHistorySchema), jobs: z.array(FeedbackJobSchema) })
/**
 * 有界附件上传，解码前后均须检查长度和 checksum。
 * @example
 * ```ts
 * import { FeedbackUploadInputSchema } from '@h-ai/api-contract'
 * FeedbackUploadInputSchema.parse({ id: 'report-1', attachmentId: 'image-1', dataBase64: 'iVBORw==' })
 * ```
 */
export const FeedbackUploadInputSchema = z.strictObject({ id, attachmentId, dataBase64: z.string().max(4 * Math.ceil(5 * 1024 * 1024 / 3)).refine(value => value.length % 4 === 0 && /^[A-Z0-9+/]*={0,2}$/i.test(value)) })
/**
 * 附件受权读取定位。
 * @example
 * ```ts
 * import { FeedbackAttachmentQuerySchema } from '@h-ai/api-contract'
 * FeedbackAttachmentQuerySchema.parse({ id: 'report-1', attachmentId: 'image-1' })
 * ```
 */
export const FeedbackAttachmentQuerySchema = z.strictObject({ id, attachmentId })
/**
 * 受权附件内容，不暴露 S3 凭据或公网链接。
 * @example
 * ```ts
 * import { FeedbackAttachmentDataSchema } from '@h-ai/api-contract'
 * FeedbackAttachmentDataSchema.parse({ name: 'screen.png', contentType: 'image/png', dataBase64: 'iVBORw==' })
 * ```
 */
export const FeedbackAttachmentDataSchema = z.object({ name: z.string(), contentType: z.string(), dataBase64: z.string() })

/**
 * FeedbackStatus 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackStatus } from '@h-ai/api-contract'
 * const value: FeedbackStatus = 'pending'
 * ```
 */
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>
/**
 * FeedbackCollectionStatus 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackCollectionStatus } from '@h-ai/api-contract'
 * const value: FeedbackCollectionStatus = 'collecting'
 * ```
 */
export type FeedbackCollectionStatus = z.infer<typeof FeedbackCollectionStatusSchema>
/**
 * FeedbackNotificationStatus 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackNotificationStatus } from '@h-ai/api-contract'
 * const value: FeedbackNotificationStatus = 'pending'
 * ```
 */
export type FeedbackNotificationStatus = z.infer<typeof FeedbackNotificationStatusSchema>
/**
 * FeedbackEvidenceInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackEvidenceInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackEvidenceInput) { return value.id }
 * ```
 */
export type FeedbackEvidenceInput = z.infer<typeof FeedbackEvidenceInputSchema>
/**
 * FeedbackEvidence 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackEvidence } from '@h-ai/api-contract'
 * function inspect(value: FeedbackEvidence) { return value.id }
 * ```
 */
export type FeedbackEvidence = z.infer<typeof FeedbackEvidenceSchema>
/**
 * FeedbackAttachmentInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackAttachmentInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackAttachmentInput) { return value.id }
 * ```
 */
export type FeedbackAttachmentInput = z.infer<typeof FeedbackAttachmentInputSchema>
/**
 * FeedbackAttachment 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackAttachment } from '@h-ai/api-contract'
 * function inspect(value: FeedbackAttachment) { return value.id }
 * ```
 */
export type FeedbackAttachment = z.infer<typeof FeedbackAttachmentSchema>
/**
 * FeedbackSubmitInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackSubmitInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackSubmitInput) { return value.submissionId }
 * ```
 */
export type FeedbackSubmitInput = z.infer<typeof FeedbackSubmitInputSchema>
/**
 * FeedbackReport 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackReport } from '@h-ai/api-contract'
 * function inspect(value: FeedbackReport) { return value.id }
 * ```
 */
export type FeedbackReport = z.infer<typeof FeedbackReportSchema>
/**
 * FeedbackListInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackListInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackListInput) { return value.pageSize }
 * ```
 */
export type FeedbackListInput = z.infer<typeof FeedbackListInputSchema>
/**
 * FeedbackEvidenceQuery 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackEvidenceQuery } from '@h-ai/api-contract'
 * function inspect(value: FeedbackEvidenceQuery) { return value.id }
 * ```
 */
export type FeedbackEvidenceQuery = z.infer<typeof FeedbackEvidenceQuerySchema>
/**
 * FeedbackSetStatusInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackSetStatusInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackSetStatusInput) { return value.id }
 * ```
 */
export type FeedbackSetStatusInput = z.infer<typeof FeedbackSetStatusInputSchema>
/**
 * FeedbackAppendEvidenceInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackAppendEvidenceInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackAppendEvidenceInput) { return value.id }
 * ```
 */
export type FeedbackAppendEvidenceInput = z.infer<typeof FeedbackAppendEvidenceInputSchema>
/**
 * FeedbackEvidenceAck 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackEvidenceAck } from '@h-ai/api-contract'
 * function inspect(value: FeedbackEvidenceAck) { return value.acknowledged.length }
 * ```
 */
export type FeedbackEvidenceAck = z.infer<typeof FeedbackEvidenceAckSchema>
/**
 * FeedbackCompleteInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackCompleteInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackCompleteInput) { return value.id }
 * ```
 */
export type FeedbackCompleteInput = z.infer<typeof FeedbackCompleteInputSchema>
/**
 * FeedbackRetryInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackRetryInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackRetryInput) { return value.id }
 * ```
 */
export type FeedbackRetryInput = z.infer<typeof FeedbackRetryInputSchema>
/**
 * FeedbackExportInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackExportInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackExportInput) { return value.id }
 * ```
 */
export type FeedbackExportInput = z.infer<typeof FeedbackExportInputSchema>
/**
 * FeedbackJob 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackJob } from '@h-ai/api-contract'
 * function inspect(value: FeedbackJob) { return value.id }
 * ```
 */
export type FeedbackJob = z.infer<typeof FeedbackJobSchema>
/**
 * FeedbackHistory 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackHistory } from '@h-ai/api-contract'
 * function inspect(value: FeedbackHistory) { return value.id }
 * ```
 */
export type FeedbackHistory = z.infer<typeof FeedbackHistorySchema>
/**
 * FeedbackDetail 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackDetail } from '@h-ai/api-contract'
 * function inspect(value: FeedbackDetail) { return value.report.number }
 * ```
 */
export type FeedbackDetail = z.infer<typeof FeedbackDetailSchema>
/**
 * FeedbackUploadInput 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackUploadInput } from '@h-ai/api-contract'
 * function inspect(value: FeedbackUploadInput) { return value.id }
 * ```
 */
export type FeedbackUploadInput = z.infer<typeof FeedbackUploadInputSchema>
/**
 * FeedbackAttachmentData 的共享类型，由对应 schema 推导。
 * @example
 * ```ts
 * import type { FeedbackAttachmentData } from '@h-ai/api-contract'
 * function inspect(value: FeedbackAttachmentData) { return value.contentType }
 * ```
 */
export type FeedbackAttachmentData = z.infer<typeof FeedbackAttachmentDataSchema>
