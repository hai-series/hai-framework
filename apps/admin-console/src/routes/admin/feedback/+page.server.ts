import type { PageServerLoad } from './$types'
import { FeedbackIdInputSchema, FeedbackListInputSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'
import * as m from '#lib/paraglide/messages.js'
import { getFeedbackContext } from '#lib/server/feedback.js'

export const load: PageServerLoad = async (event) => {
  if (!kit.guard.check(event.locals.session, 'feedback:read'))
    error(403, m.feedback_forbidden())
  const context = getFeedbackContext(event)
  if (!context)
    error(401, m.feedback_forbidden())
  const { feedback: feedbackId, ...listQuery } = Object.fromEntries(event.url.searchParams)
  if (feedbackId !== undefined && !FeedbackIdInputSchema.safeParse({ id: feedbackId }).success)
    error(400, m.feedback_invalid_query())
  const parsed = FeedbackListInputSchema.safeParse(listQuery)
  if (!parsed.success)
    error(400, m.feedback_invalid_query())
  const reports = await feedback.list(parsed.data, context)
  if (!reports.success) {
    const safe = core.error.toPublic(reports.error)
    core.logger.error('Feedback page loading failed', { traceId: safe.traceId, error: reports.error })
    error(safe.httpStatus ?? 500, { message: safe.message })
  }
  return {
    reports: reports.data,
    query: { ...parsed.data, page: reports.data.page, pageSize: reports.data.pageSize },
    feedbackId,
  }
}
