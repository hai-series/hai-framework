import type { PageServerLoad } from './$types'
import { FeedbackIdInputSchema } from '@h-ai/api-contract/feedback'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'
import * as m from '#lib/paraglide/messages.js'

export const load: PageServerLoad = (event) => {
  if (!kit.guard.check(event.locals.session, 'feedback:read'))
    error(403, m.feedback_forbidden())
  const feedback = event.url.searchParams.get('feedback')
  if (feedback === null)
    return { feedbackId: undefined }
  const parsed = FeedbackIdInputSchema.safeParse({ id: feedback })
  if (!parsed.success)
    error(400, m.feedback_invalid_query())
  return { feedbackId: parsed.data.id }
}
