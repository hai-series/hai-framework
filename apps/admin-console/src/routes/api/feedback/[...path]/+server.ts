import { getFeedbackContext } from '$lib/server/feedback.js'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'

const handler = kit.createFeedbackHandler({ feedback, resolveContext: getFeedbackContext })

export const GET = handler
export const POST = handler
export const PATCH = handler
