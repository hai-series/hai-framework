import { z } from 'zod'
import { feedbackLimits } from './feedback-budget.js'

const maxSubmission = {
  maxBodyLength: 20_000,
  maxFiles: 20,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalFileBytes: 24 * 1024 * 1024,
}
const maxCapture = {
  windowSeconds: 1800,
  maxLogEntries: 5000,
  maxLogBytes: 2 * 1024 * 1024,
  maxReplayBytes: 8 * 1024 * 1024,
  maxReplayEvents: 10_000,
  maxRecordingSeconds: 300,
}

/** 发送上限按原始文件字节数计算。 */
export const FeedbackSubmissionLimitsSchema = z.strictObject({
  maxBodyLength: z.int().min(1).max(maxSubmission.maxBodyLength).default(feedbackLimits.maxBodyLength).describe('每次发送正文的 UTF-16 代码单元上限'),
  maxFiles: z.int().min(1).max(maxSubmission.maxFiles).default(feedbackLimits.maxFiles).describe('每次发送时手动附件的数量上限'),
  maxFileBytes: z.int().min(1).max(maxSubmission.maxFileBytes).default(feedbackLimits.maxFileBytes).describe('单个文件原始字节的上限'),
  maxTotalFileBytes: z.int().min(1).max(maxSubmission.maxTotalFileBytes).default(feedbackLimits.maxTotalFileBytes).describe('单次发送的手动附件与首帖现场合计原始字节上限'),
}).refine(value => value.maxFileBytes <= value.maxTotalFileBytes, {
  path: ['maxTotalFileBytes'],
})

const FeedbackCaptureLimitsSchema = z.strictObject({
  windowSeconds: z.int().min(1).max(maxCapture.windowSeconds).default(feedbackLimits.captureWindowMs / 1000).describe('日志与操作回放的回看秒数'),
  maxLogEntries: z.int().min(1).max(maxCapture.maxLogEntries).default(feedbackLimits.maxLogEntries).describe('每份浏览器或服务端日志的条数上限'),
  maxLogBytes: z.int().min(1).max(maxCapture.maxLogBytes).default(feedbackLimits.maxLogBytes).describe('每份日志的字节上限'),
  maxReplayBytes: z.int().min(1).max(maxCapture.maxReplayBytes).default(feedbackLimits.maxReplayBytes).describe('页面回放文件的字节上限'),
  maxReplayEvents: z.int().min(1).max(maxCapture.maxReplayEvents).default(feedbackLimits.maxReplayEvents).describe('单份页面回放的事件数量上限'),
  maxRecordingSeconds: z.int().min(1).max(maxCapture.maxRecordingSeconds).default(feedbackLimits.maxRecordingSeconds).describe('浏览器录屏的最长秒数'),
})

/** 服务端和界面共用的发送及首帖采集配置。 */
export const FeedbackLimitsSchema = z.strictObject({
  limits: FeedbackSubmissionLimitsSchema.prefault({}).describe('首帖、回复和补充请求的发送上限'),
  capture: FeedbackCaptureLimitsSchema.prefault({}).describe('首帖现场的采集上限'),
})

export type FeedbackLimits = z.output<typeof FeedbackLimitsSchema>

const id = z.uuid().transform(value => value.toLowerCase())
function bodySchema(maxLength: number) {
  return z.string().max(maxLength).trim().refine(value => !value.includes('\0'))
}
const body = bodySchema(maxSubmission.maxBodyLength)
const identity = z.string().min(1).max(128)
const timestamps = z.number().int().nonnegative().safe()
const page = {
  page: z.coerce.number<number | string>().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number<number | string>().int().min(1).max(20).optional(),
}
const maxBase64Length = 4 * Math.ceil(maxSubmission.maxFileBytes / 3)
const fileName = z.string().trim().min(1).max(255).refine(value =>
  ![...value].some(character => character.charCodeAt(0) < 32 || character === '/' || character === '\\'),
)
const mediaType = z.string().min(1).max(128).regex(/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/)

export const FeedbackStatusSchema = z.enum(['pending', 'awaiting_user', 'handled'])
export const FeedbackMessageKindSchema = z.enum(['reply', 'request_info'])
export const FeedbackAttachmentKindSchema = z.enum([
  'file',
  'screenshot',
  'browser_logs',
  'server_logs',
  'replay',
  'recording',
])

/** 单次操作提交的文件，内容以 Base64 编码。 */
export const FeedbackAttachmentInputSchema = z.strictObject({
  name: fileName,
  contentType: mediaType,
  dataBase64: z.base64().min(4).max(maxBase64Length),
})

function decodedBytes({ dataBase64 }: FeedbackAttachmentInput) {
  const padding = dataBase64.endsWith('==')
    ? 2
    : Number(dataBase64.endsWith('='))
  return dataBase64.length / 4 * 3 - padding
}

function captureFile(types: string[], maxBytes: number) {
  return FeedbackAttachmentInputSchema.refine(file => types.includes(file.contentType) && decodedBytes(file) <= maxBytes)
}

function captureSchema({ limits, capture }: FeedbackLimits) {
  return z.strictObject({
    screenshot: captureFile(['image/png', 'image/jpeg', 'image/webp'], limits.maxFileBytes).optional(),
    browserLogs: captureFile(['application/json'], Math.min(limits.maxFileBytes, capture.maxLogBytes)).optional(),
    replay: captureFile(['application/json'], Math.min(limits.maxFileBytes, capture.maxReplayBytes)).optional(),
    recording: captureFile(['video/webm', 'video/mp4'], limits.maxFileBytes).optional(),
    includeServerLogs: z.boolean().optional(),
  })
}

function validateContent(value: { body: string, attachments?: FeedbackAttachmentInput[], capture?: FeedbackCaptureInput }, context: z.RefinementCtx, limits: FeedbackLimits['limits']) {
  const { screenshot, browserLogs, replay, recording, includeServerLogs } = value.capture ?? {}
  const captures = [
    screenshot,
    browserLogs,
    replay,
    recording,
  ].filter(file => file !== undefined)
  if (!value.body && !value.attachments?.length && !captures.length && !includeServerLogs) {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Text or an attachment is required.',
    })
  }

  let totalBytes = captures.reduce((total, file) => total + decodedBytes(file), 0)
  for (const [index, file] of (value.attachments ?? []).entries()) {
    const bytes = decodedBytes(file)
    if (bytes > limits.maxFileBytes) {
      context.addIssue({
        code: 'custom',
        path: ['attachments', index, 'dataBase64'],
        message: 'Attachment exceeds the per-file limit.',
      })
    }
    totalBytes += bytes
  }
  if (totalBytes > limits.maxTotalFileBytes) {
    context.addIssue({
      code: 'custom',
      path: ['attachments'],
      message: 'Attachments exceed the combined size limit.',
    })
  }
}

const wireLimits: FeedbackLimits = { limits: maxSubmission, capture: maxCapture }

/** 仅首帖接受的现场材料。服务端日志由服务端按可信身份读取。 */
export const FeedbackCaptureInputSchema = captureSchema(wireLimits)

/**
 * 根据实际部署限额验证首帖和消息。HTTP 契约使用可配置范围的最大值。
 * @example
 * ```ts
 * import { apiContract, FeedbackLimitsSchema } from '@h-ai/api-contract/feedback'
 * const schemas = apiContract.createFeedbackWriteSchemas(FeedbackLimitsSchema.parse({ limits: { maxFiles: 2 } }))
 * ```
 */
export function createFeedbackWriteSchemas(settings: FeedbackLimits) {
  const { limits } = settings
  const messageContent = {
    body: bodySchema(limits.maxBodyLength),
    attachments: z.array(FeedbackAttachmentInputSchema).max(limits.maxFiles).optional(),
  }
  return {
    submit: z.strictObject({
      id,
      ...messageContent,
      capture: captureSchema(settings).optional(),
    }).superRefine((value, context) => validateContent(value, context, limits)),
    addMessage: z.strictObject({
      id,
      messageId: id,
      kind: FeedbackMessageKindSchema,
      ...messageContent,
    }).superRefine((value, context) => validateContent(value, context, limits)),
  }
}

export const FeedbackIdInputSchema = z.strictObject({ id })
export const FeedbackListInputSchema = z.strictObject({
  ...page,
  status: FeedbackStatusSchema.optional(),
})
const wireWrites = createFeedbackWriteSchemas(wireLimits)
export const FeedbackSubmitInputSchema = wireWrites.submit
export const FeedbackMessageQuerySchema = z.strictObject({ id, ...page })
export const FeedbackAddMessageInputSchema = wireWrites.addMessage
export const FeedbackSetStatusInputSchema = z.strictObject({
  id,
  status: z.enum(['pending', 'handled']),
})
export const FeedbackAttachmentQuerySchema = z.strictObject({ id, attachmentId: id })

export const FeedbackReportSchema = z.strictObject({
  id,
  appId: identity,
  scopeId: identity,
  userId: identity,
  body,
  status: FeedbackStatusSchema,
  createdAt: timestamps,
  updatedAt: timestamps,
})
export const FeedbackAttachmentSchema = z.strictObject({
  id,
  kind: FeedbackAttachmentKindSchema,
  name: fileName,
  contentType: mediaType,
  size: z.number().int().min(1).max(maxSubmission.maxFileBytes),
})
export const FeedbackAttachmentDataSchema = FeedbackAttachmentInputSchema
export const FeedbackDetailSchema = z.strictObject({
  report: FeedbackReportSchema,
  attachments: z.array(FeedbackAttachmentSchema),
})
export const FeedbackMessageSchema = z.strictObject({
  id,
  reportId: id,
  authorId: identity,
  authorRole: z.enum(['author', 'staff']),
  kind: FeedbackMessageKindSchema,
  body,
  createdAt: timestamps,
  attachments: z.array(FeedbackAttachmentSchema),
})

export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>
export type FeedbackAttachmentInput = z.infer<typeof FeedbackAttachmentInputSchema>
export type FeedbackAttachmentKind = z.infer<typeof FeedbackAttachmentKindSchema>
export type FeedbackCaptureInput = z.infer<typeof FeedbackCaptureInputSchema>
export type FeedbackSubmitInput = z.infer<typeof FeedbackSubmitInputSchema>
export type FeedbackListInput = z.infer<typeof FeedbackListInputSchema>
export type FeedbackMessageQuery = z.infer<typeof FeedbackMessageQuerySchema>
export type FeedbackAddMessageInput = z.infer<typeof FeedbackAddMessageInputSchema>
export type FeedbackSetStatusInput = z.infer<typeof FeedbackSetStatusInputSchema>
export type FeedbackAttachmentQuery = z.infer<typeof FeedbackAttachmentQuerySchema>
export type FeedbackReport = z.infer<typeof FeedbackReportSchema>
export type FeedbackAttachment = z.infer<typeof FeedbackAttachmentSchema>
export type FeedbackAttachmentData = z.infer<typeof FeedbackAttachmentDataSchema>
export type FeedbackDetail = z.infer<typeof FeedbackDetailSchema>
export type FeedbackMessage = z.infer<typeof FeedbackMessageSchema>
