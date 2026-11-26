import { z } from 'zod'
import { feedbackLimits } from './feedback-budget.js'

const id = z.uuid().transform(value => value.toLowerCase())
const body = z.string().max(feedbackLimits.maxBodyLength).trim().refine(value => !value.includes('\0'))
const identity = z.string().min(1).max(128)
const timestamps = z.number().int().nonnegative().safe()
const page = {
  page: z.coerce.number<number | string>().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number<number | string>().int().min(1).max(20).optional(),
}
const maxBase64Length = 4 * Math.ceil(feedbackLimits.maxFileBytes / 3)
const fileName = z.string().trim().min(1).max(255).refine(value =>
  ![...value].some(character => character.charCodeAt(0) < 32 || character === '/' || character === '\\'),
)
const mediaType = z.string().min(1).max(128).regex(/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/)

export const FeedbackStatusSchema = z.enum(['pending', 'awaiting_user', 'handled'])
export const FeedbackMessageKindSchema = z.enum(['reply', 'request_info'])

/** 单次操作提交的文件，内容以 Base64 编码。 */
export const FeedbackAttachmentInputSchema = z.strictObject({
  name: fileName,
  contentType: mediaType,
  dataBase64: z.base64().min(4).max(maxBase64Length),
})

const messageContent = {
  body,
  attachments: z.array(FeedbackAttachmentInputSchema).max(feedbackLimits.maxFiles).optional(),
}

function validateContent(value: { body: string, attachments?: FeedbackAttachmentInput[] }, context: z.RefinementCtx) {
  if (!value.body && !value.attachments?.length) {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Text or an attachment is required.',
    })
  }

  let totalBytes = 0
  for (const [index, file] of (value.attachments ?? []).entries()) {
    const padding = file.dataBase64.endsWith('==')
      ? 2
      : Number(file.dataBase64.endsWith('='))
    const bytes = file.dataBase64.length / 4 * 3 - padding
    if (bytes > feedbackLimits.maxFileBytes) {
      context.addIssue({
        code: 'custom',
        path: ['attachments', index, 'dataBase64'],
        message: 'Attachment exceeds the per-file limit.',
      })
    }
    totalBytes += bytes
  }
  if (totalBytes > feedbackLimits.maxTotalFileBytes) {
    context.addIssue({
      code: 'custom',
      path: ['attachments'],
      message: 'Attachments exceed the combined size limit.',
    })
  }
}

export const FeedbackIdInputSchema = z.strictObject({ id })
export const FeedbackListInputSchema = z.strictObject({
  ...page,
  status: FeedbackStatusSchema.optional(),
})
export const FeedbackSubmitInputSchema = z.strictObject({ id, ...messageContent }).superRefine(validateContent)
export const FeedbackMessageQuerySchema = z.strictObject({ id, ...page })
export const FeedbackAddMessageInputSchema = z.strictObject({
  id,
  messageId: id,
  kind: FeedbackMessageKindSchema,
  ...messageContent,
}).superRefine(validateContent)
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
  name: fileName,
  contentType: mediaType,
  size: z.number().int().min(1).max(feedbackLimits.maxFileBytes),
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
