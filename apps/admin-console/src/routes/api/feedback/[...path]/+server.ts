import { resolve } from '$app/paths'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'
import { getFeedbackContext } from '#lib/server/feedback.js'

const base = resolve('/').replace(/\/$/, '')
const handler = kit.createFeedbackHandler({ feedback, resolveContext: getFeedbackContext, basePath: `${base}/api/feedback` })

export const GET = handler
export const POST = handler
export const PATCH = handler
