import type { FeedbackAttachment, FeedbackListInput, FeedbackMessage, FeedbackReport } from '@h-ai/api-contract/feedback'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { FeedbackReportRepository } from './feedback-repository.js'
import type { FeedbackContext, FeedbackFunctions } from './feedback-types.js'
import {
  FeedbackAddMessageInputSchema,
  FeedbackAttachmentQuerySchema,
  FeedbackIdInputSchema,
  FeedbackListInputSchema,
  FeedbackMessageQuerySchema,
  FeedbackSetStatusInputSchema,
  FeedbackSubmitInputSchema,
} from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { feedbackM } from './feedback-i18n.js'
import { HaiFeedbackError } from './feedback-types.js'

export type FeedbackOperations = Omit<FeedbackFunctions, 'init' | 'close' | 'isInitialized' | 'config'>

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && value.trim().length > 0 && !value.includes('\0')
}

function validContext(context: FeedbackContext) {
  return !!context && validIdentity(context.scopeId) && validIdentity(context.userId)
}

function permitted(context: FeedbackContext, permission: string) {
  return context.permissions?.some(value => value === permission || value === 'feedback:*' || value === '*') ?? false
}

function canProcess(context: FeedbackContext) {
  return permitted(context, 'feedback:read') && permitted(context, 'feedback:process')
}

function forbidden() {
  return core.err(HaiFeedbackError.FORBIDDEN, feedbackM('feedback_forbidden'))
}

function missing() {
  return core.err(HaiFeedbackError.NOT_FOUND, feedbackM('feedback_notFound'))
}

function invalid() {
  return core.err(HaiFeedbackError.INVALID_INPUT, feedbackM('feedback_invalidInput'))
}

function conflict() {
  return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
}

function activityTime(updatedAt: number) {
  return Math.max(Date.now(), updatedAt + 1)
}

export function createFeedbackOperations(repo: FeedbackReportRepository, appId: string): FeedbackOperations {
  async function access(id: string, context: FeedbackContext, tx?: DmlWithTxOperations) {
    if (!validContext(context))
      return forbidden()
    const result = await repo.find(appId, context.scopeId, id, tx)
    if (!result.success)
      return result
    if (!result.data)
      return missing()
    if (result.data.user_id !== context.userId && !permitted(context, 'feedback:read'))
      return forbidden()
    return core.ok(repo.report(result.data))
  }

  async function listReports(input: FeedbackListInput, context: FeedbackContext, mine: boolean) {
    if (!validContext(context) || (!mine && !permitted(context, 'feedback:read')))
      return forbidden()
    const query = FeedbackListInputSchema.safeParse(input)
    if (!query.success)
      return invalid()
    const result = await repo.list(appId, context.scopeId, query.data, mine ? context.userId : undefined)
    return result.success
      ? core.ok({
          ...result.data,
          items: result.data.items.map(row => repo.report(row)),
        })
      : result
  }

  return {
    async submit(input, context) {
      if (!validContext(context) || !permitted(context, 'feedback:create'))
        return forbidden()
      const parsed = FeedbackSubmitInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const { id, body, attachments = [] } = parsed.data
      const saved = await repo.find(appId, context.scopeId, id)
      if (!saved.success)
        return saved
      if (saved.data) {
        return saved.data.user_id === context.userId
          ? core.ok(repo.report(saved.data))
          : conflict()
      }

      const time = Date.now()
      const report = {
        id,
        app_id: appId,
        scope_id: context.scopeId,
        user_id: context.userId,
        body,
        status: 'pending' as const,
        created_at: time,
        updated_at: time,
      }
      const stored = await reldb.tx.wrapResult(async (tx) => {
        const created = await repo.create(report, tx)
        if (!created.success)
          return created
        const files = await repo.addFiles(id, null, attachments, tx)
        return files.success
          ? core.ok(repo.report(report))
          : files
      })
      if (stored.success)
        return stored

      // 同一个 UUID 的并发请求可能已经写入，读回该作者已保存的记录。
      const concurrent = await repo.find(appId, context.scopeId, id)
      if (concurrent.success && concurrent.data) {
        return concurrent.data.user_id === context.userId
          ? core.ok(repo.report(concurrent.data))
          : conflict()
      }
      return stored
    },

    list(input, context) {
      return listReports(input, context, false)
    },

    listMine(input, context) {
      return listReports(input, context, true)
    },

    async get(id, context) {
      const parsed = FeedbackIdInputSchema.safeParse({ id })
      if (!parsed.success)
        return invalid()
      const report = await access(parsed.data.id, context)
      if (!report.success)
        return report
      const files = await repo.files(report.data.id, null)
      return files.success
        ? core.ok({
            report: report.data,
            attachments: files.data.map(({ file }) => file),
          })
        : files
    },

    async listMessages(input, context) {
      const query = FeedbackMessageQuerySchema.safeParse(input)
      if (!query.success)
        return invalid()
      const report = await access(query.data.id, context)
      if (!report.success)
        return report
      const page = await repo.listMessages(query.data)
      if (!page.success)
        return page
      if (!page.data.items.length)
        return core.ok({ ...page.data, items: [] })
      const files = await repo.files(report.data.id, page.data.items.map(item => item.id))
      if (!files.success)
        return files
      const grouped = new Map<string, FeedbackAttachment[]>()
      for (const { messageId, file } of files.data) {
        if (!messageId)
          continue
        const existing = grouped.get(messageId)
        if (existing)
          existing.push(file)
        else
          grouped.set(messageId, [file])
      }
      return core.ok({
        ...page.data,
        items: page.data.items.map(item => repo.message(item, grouped.get(item.id) ?? [])),
      })
    },

    async addMessage(input, context) {
      const parsed = FeedbackAddMessageInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const message = parsed.data
      return reldb.tx.wrapResult(async (tx) => {
        const report = await access(message.id, context, tx)
        if (!report.success)
          return report
        const isAuthor = report.data.userId === context.userId
        const requestsInfo = message.kind === 'request_info'
        if ((requestsInfo || !isAuthor) && !canProcess(context))
          return forbidden()
        const role: FeedbackMessage['authorRole'] = isAuthor && !requestsInfo
          ? 'author'
          : 'staff'

        const existing = await repo.findMessage(message.messageId, tx)
        if (!existing.success)
          return existing
        if (existing.data) {
          if (existing.data.report_id !== message.id || existing.data.author_id !== context.userId || existing.data.kind !== message.kind)
            return conflict()
          const files = await repo.files(message.id, [message.messageId], tx)
          return files.success
            ? core.ok(repo.message(existing.data, files.data.map(({ file }) => file)))
            : files
        }

        const now = activityTime(report.data.updatedAt)
        const saved = await repo.addMessage(message, context.userId, role, now, tx)
        if (!saved.success)
          return saved
        const files = await repo.addFiles(message.id, message.messageId, message.attachments ?? [], tx)
        if (!files.success)
          return files
        let status: FeedbackReport['status'] = report.data.status
        if (requestsInfo)
          status = 'awaiting_user'
        else if (isAuthor && status === 'awaiting_user')
          status = 'pending'
        const updated = await repo.updateActivity(message.id, status, now, tx)
        if (!updated.success)
          return updated
        return core.ok({
          id: message.messageId,
          reportId: message.id,
          authorId: context.userId,
          authorRole: role,
          kind: message.kind,
          body: message.body,
          createdAt: now,
          attachments: files.data,
        })
      })
    },

    async setStatus(input, context) {
      if (!validContext(context) || !canProcess(context))
        return forbidden()
      const parsed = FeedbackSetStatusInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const { id, status } = parsed.data
      return reldb.tx.wrapResult(async (tx) => {
        const report = await access(id, context, tx)
        if (!report.success || report.data.status === status)
          return report
        const updatedAt = activityTime(report.data.updatedAt)
        const result = await repo.updateActivity(id, status, updatedAt, tx)
        return result.success
          ? core.ok({ ...report.data, status, updatedAt })
          : result
      })
    },

    async getAttachment(input, context) {
      const query = FeedbackAttachmentQuerySchema.safeParse(input)
      if (!query.success)
        return invalid()
      const { id, attachmentId } = query.data
      const report = await access(id, context)
      if (!report.success)
        return report
      const file = await repo.file(id, attachmentId)
      if (!file.success)
        return file
      return file.data
        ? core.ok(file.data)
        : missing()
    },
  }
}
