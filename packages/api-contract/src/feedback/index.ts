import { resolveFeedbackBudget } from './feedback-budget.js'
import { feedbackContract } from './feedback-contract.js'

export { FeedbackBudgetSchema } from './feedback-budget.js'
export type { FeedbackBudget } from './feedback-budget.js'
export * from './feedback-contract.js'
export * from './feedback-schemas.js'

/**
 * 反馈契约子路径只装配反馈所需定义与预算工具。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract/feedback'
 *
 * // 根据 1 MiB 材料上限计算传输预算，无需初始化任何服务。
 * const budget = apiContract.resolveFeedbackBudget({ maxTotalBytes: 1024 * 1024 })
 * void budget.maxTransportBytes
 * ```
 */
export const apiContract = { feedback: feedbackContract, resolveFeedbackBudget }
