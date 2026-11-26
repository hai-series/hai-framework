import { feedbackTransportRoutes } from './feedback-budget.js'
import { feedbackContract } from './feedback-contract.js'

export { feedbackLimits } from './feedback-budget.js'
export type { FeedbackContract } from './feedback-contract.js'
export * from './feedback-schemas.js'
export type { FeedbackContext, FeedbackHttpOperations } from './feedback-types.js'

/** 仅装配反馈路由的子路径，适用于客户端。 */
export const apiContract = { feedback: feedbackContract, feedbackTransportRoutes }
