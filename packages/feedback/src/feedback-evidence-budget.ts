import type { FeedbackBudget } from '@h-ai/api-contract/feedback'

/**
 * 为服务端环境、缺失报告和业务证据预留共享容量。
 * @example 模块内部上下文
 * ```ts
 * function countClientEvidence(budget: FeedbackBudget) { return feedbackClientEvidenceLimits(budget).events }
 * ```
 */
export function feedbackClientEvidenceLimits(budget: FeedbackBudget) {
  return {
    events: Math.max(0, budget.maxEvidenceCount - 3),
    bytes: budget.maxEvidenceBytes - Math.min(64 * 1024, Math.floor(budget.maxEvidenceBytes / 2)),
  }
}
