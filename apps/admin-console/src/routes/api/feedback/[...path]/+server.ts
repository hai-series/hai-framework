import { resolve } from '$app/paths'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'
import { getFeedbackContext } from '#lib/server/feedback.js'

const basePath = `${resolve('/').replace(/\/$/, '')}/api/feedback`
const handler = kit.createFeedbackHandler({ feedback, resolveContext: getFeedbackContext, basePath })

export const GET = handler
export const POST = handler
export const PATCH = handler
