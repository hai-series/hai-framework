import type { HaiResult } from '@h-ai/core'
import type { FeedbackBrowserClient, FeedbackClientConfig } from './feedback-client-types.js'
import { apiContract, FeedbackBudgetSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'
import { createFeedbackAttachments } from './feedback-client-attachments.js'
import { createFeedbackCapture } from './feedback-client-capture.js'
import { createFeedbackDraftOperations } from './feedback-client-draft.js'
import { createFeedbackClientSession, isFeedbackClientConfigSupported } from './feedback-client-session.js'

/**
 * 创建独立浏览器采集会话；默认不持久化、不录制页面回放，不采集请求正文。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback/client'
 * const client = feedback.createClient()
 * const draft = client.getDraft()
 * await client.close()
 * ```
 */
export function createFeedbackClient(): FeedbackBrowserClient {
  const session = createFeedbackClientSession()
  let sessionVersion = 0
  let initializing = false
  let closePromise: Promise<void> | undefined
  let saveController = new AbortController()

  // 挂载浏览器监听前，将采集和附件事件绑定到同一个草稿保存调度器。
  let schedulePersist: () => void
  const attachments = createFeedbackAttachments(session, () => schedulePersist(), () => saveController.signal)
  const capture = createFeedbackCapture(session, () => schedulePersist())
  const drafts = createFeedbackDraftOperations(session, capture, attachments)
  schedulePersist = drafts.schedulePersist

  async function init(input: FeedbackClientConfig): Promise<HaiResult<void>> {
    if (initializing)
      return core.err(HaiFeedbackError.INIT_IN_PROGRESS, feedbackM('feedback_initInProgress'))
    initializing = true
    try {
      if (session.config || closePromise)
        await close()
      if (!isFeedbackClientConfigSupported(input))
        return session.failure('INVALID_INPUT')

      const initVersion = sessionVersion
      const policy = input.actions.policy
        ? await input.actions.policy().catch(() => session.failure('OPERATION_FAILED'))
        : core.ok(input.budget ?? apiContract.resolveFeedbackBudget())
      if (initVersion !== sessionVersion)
        return session.failure('NOT_INITIALIZED')
      session.policyVerified = policy.success
      session.budget = FeedbackBudgetSchema.parse(policy.success
        ? policy.data
        : input.budget ?? apiContract.resolveFeedbackBudget())
      if (!policy.success)
        session.missing.add('server-policy-unavailable')

      session.config = input
      saveController = new AbortController()
      session.closing = false
      capture.startSource()
      session.storageKey = `${input.appId}:${input.persistenceKey ?? ''}`
      if (input.persistDraft) {
        const failure = await drafts.restore(input)
        if (failure)
          return failure
        if (session.closing || session.config !== input)
          return session.failure('NOT_INITIALIZED')
      }

      capture.attachListeners(input, () => drafts.onPageHide(input))
      const replay = capture.requestReplay(input, input.replayStart === 'init')
      if (replay)
        await replay
      if (session.closing || session.config !== input)
        return session.failure('NOT_INITIALIZED')
      drafts.startBackgroundFlush(input)
      return core.ok(undefined)
    }
    catch (cause) {
      await close()
      return session.failure('OPERATION_FAILED', cause)
    }
    finally {
      initializing = false
    }
  }

  function close(options: { discard?: boolean } = {}): Promise<void> {
    sessionVersion++
    session.discardOnClose ||= options.discard === true
    closePromise ??= doClose().finally(() => {
      closePromise = undefined
    })
    return closePromise
  }

  async function doClose(): Promise<void> {
    session.closing = true
    capture.pause()
    saveController.abort()
    capture.detachListeners()
    drafts.stopTimers()
    // 等待采集退出后再清空草稿，避免旧回调复活会话。
    await drafts.preparing
    await capture.keyScreenshotPromise
    // 身份退出只等待已经开始的请求，不使用新身份凭据补传旧草稿。
    if (session.discardOnClose || session.draft?.report)
      await drafts.finishUploadOnClose()
    const persisted = drafts.persistOnClose()
    if (persisted)
      await persisted
    attachments.releasePreviews()
    session.discardOnClose = false
    session.config = undefined
    session.preparedPage = ''
    session.draft = undefined
    capture.reset()
    drafts.reset()
    session.missing.clear()
    session.collectionFinished = false
    session.collectionSealed = false
  }

  return {
    init,
    prepare: drafts.prepare,
    pause: capture.pause,
    captureScreenshot: capture.captureScreenshot,
    submit: drafts.submit,
    flush: drafts.flush,
    record: capture.record,
    getDraft: () => session.draft,
    getView: attachments.getView,
    releasePreviews: attachments.releasePreviews,
    annotate: attachments.annotate,
    addFiles: attachments.addFiles,
    exportDraft: attachments.exportDraft,
    saveDraft: attachments.saveDraft,
    close,
    get budget() {
      return { ...session.budget }
    },
  }
}

/**
 * 默认浏览器采集会话。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback/client'
 * const draft = feedback.client.getDraft()
 * ```
 */
export const feedbackClient = createFeedbackClient()
