import type { FeedbackClientConfig, FeedbackDraft } from './feedback-client-types.js'
import { apiContract, FeedbackSubmitInputSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'

/**
 * 创建采集、草稿和附件共用的实例状态，各能力独立持有浏览器资源句柄。
 * @example 模块内部上下文
 * ```ts
 * const session = createFeedbackClientSession()
 * const maxAttachmentBytes = session.budget.maxAttachmentBytes
 * ```
 */
export function createFeedbackClientSession() {
  const session = {
    config: undefined as FeedbackClientConfig | undefined,
    draft: undefined as FeedbackDraft | undefined,
    policyVerified: false,
    preparedPage: '',
    budget: apiContract.resolveFeedbackBudget(),
    discardOnClose: false,
    closing: false,
    afterCount: 0,
    deadline: 0,
    collectionFinished: false,
    collectionSealed: false,
    draftBytes: 0,
    storageKey: '',
    missing: new Set<string>(),
    failure,
  }

  function failure(code: keyof typeof HaiFeedbackError = 'OPERATION_FAILED', cause?: unknown, message?: string) {
    const key = code === 'NOT_INITIALIZED'
      ? 'feedback_notInitialized'
      : code === 'LIMIT_EXCEEDED'
        ? 'feedback_limitExceeded'
        : code === 'INVALID_INPUT'
          ? 'feedback_invalidInput'
          : 'feedback_operationFailed'
    const traceId = core.context.get().traceId ?? core.context.get().requestId ?? core.id.uuid()
    const error = {
      ...HaiFeedbackError[code],
      traceId,
      message: message ?? feedbackM(key),
      cause,
    }
    if (!(session.closing && code === 'NOT_INITIALIZED')) {
      core.logger[cause === undefined
        ? 'warn'
        : 'error']('Feedback client operation failed', { module: 'feedback', traceId, error })
    }
    return core.err({
      ...error,
      message: core.error.formatMessage(error),
    })
  }

  return session
}

/**
 * 在同一客户端的流程之间传递草稿、容量和生命周期状态。
 * @example 模块内部上下文
 * ```ts
 * const session: FeedbackClientSession = createFeedbackClientSession()
 * const closing = session.closing
 * ```
 */
export type FeedbackClientSession = ReturnType<typeof createFeedbackClientSession>

/**
 * 核对浏览器环境、宿主动作、采集窗口及草稿持久化设置。
 * @example 模块内部上下文
 * ```ts
 * const supportsConfig = (input: FeedbackClientConfig) => isFeedbackClientConfigSupported(input)
 * ```
 */
export function isFeedbackClientConfigSupported(input: FeedbackClientConfig): boolean {
  if (typeof window === 'undefined' || !input.appId || !input.actions || [
    'submit',
    'appendEvidence',
    'completeCollection',
    'upload',
  ].some(key => typeof input.actions[key as keyof typeof input.actions] !== 'function')) {
    return false
  }
  const numeric = [
    input.maxEvents,
    input.maxBytes,
    input.maxAgeMs,
    input.beforeCount,
    input.afterCount,
    input.afterTimeoutMs,
    input.screenshotTimeoutMs,
    input.maxKeyScreenshots,
    input.keyScreenshotThrottleMs,
  ]
  if (numeric.some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || (input.persistDraft && !input.persistenceKey))
    return false
  if (input.replayStart !== undefined && !['init', 'prepare'].includes(input.replayStart))
    return false
  return FeedbackSubmitInputSchema.pick({
    appId: true,
    appVersion: true,
    buildId: true,
    commit: true,
  }).safeParse({
    appId: input.appId,
    appVersion: input.appVersion,
    buildId: input.buildId,
    commit: input.commit,
  }).success
}
