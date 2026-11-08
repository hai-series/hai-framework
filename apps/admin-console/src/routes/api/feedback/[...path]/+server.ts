import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'
import { getFeedbackContext } from '#lib/server/feedback.js'

const handler = kit.createFeedbackHandler({ feedback, resolveContext: getFeedbackContext })

export const GET = handler
export const POST = handler
export const PATCH = handler
