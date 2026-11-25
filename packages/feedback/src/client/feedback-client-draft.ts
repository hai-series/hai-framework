import type { FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { createFeedbackAttachments } from './feedback-client-attachments.js'
import type { createFeedbackCapture } from './feedback-client-capture.js'
import type { FeedbackClientSession } from './feedback-client-session.js'
import type { FeedbackClientConfig, FeedbackClientSubmitInput, FeedbackDraft } from './feedback-client-types.js'
import { FeedbackBudgetSchema, FeedbackEvidenceInputSchema, FeedbackReportSchema, FeedbackSubmitInputSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'
import { digestHex } from './feedback-client-attachments.js'
import { pageIdentity } from './feedback-client-capture.js'
import { feedbackPageUrl, sanitizeFeedbackData } from './feedback-client-sanitize.js'
import { deleteFeedbackDraft, restoreFeedbackCheckpoint, restoreFeedbackDraft, saveFeedbackCheckpoint, saveFeedbackDraft } from './feedback-client-store.js'

/**
 * 为单个客户端创建草稿的准备、持久化、受理及后台补传操作。
 * @example 模块内部上下文
 * ```ts
 * function attachDraft(session: FeedbackClientSession, capture: ReturnType<typeof createFeedbackCapture>, attachments: Pick<ReturnType<typeof createFeedbackAttachments>, 'addFiles'>) {
 *   const drafts = createFeedbackDraftOperations(session, capture, attachments)
 *   return drafts.prepare()
 * }
 * ```
 */
export function createFeedbackDraftOperations(
  session: FeedbackClientSession,
  capture: ReturnType<typeof createFeedbackCapture>,
  attachments: Pick<ReturnType<typeof createFeedbackAttachments>, 'addFiles'>,
) {
  let initialIds = new Set<string>()
  const uploadedIds = new Set<string>()
  let flushPromise: Promise<HaiResult<void>> | undefined
  let flushFailures = 0
  let nextBackgroundFlush = 0
  let preparePromise: Promise<HaiResult<FeedbackDraft>> | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let flushTimer: ReturnType<typeof setInterval> | undefined

  function schedulePersist() {
    if (!session.config?.persistDraft || persistTimer)
      return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      if (session.config && session.draft && !session.collectionFinished)
        void saveFeedbackDraft(session.storageKey, session.draft).catch(() => session.missing.add('browser-persistence-unavailable'))
      else if (session.config)
        void saveFeedbackCheckpoint(session.storageKey, capture.buffer).catch(() => session.missing.add('browser-persistence-unavailable'))
    }, 200)
  }

  async function restore(input: FeedbackClientConfig) {
    try {
      const restored = await restoreFeedbackDraft(session.storageKey)
      if (session.closing || session.config !== input)
        return session.failure('NOT_INITIALIZED')
      if (restored && Array.isArray(restored.evidence) && restored.evidence.every(item => FeedbackEvidenceInputSchema.safeParse(item).success)
        && Array.isArray(restored.attachments) && restored.attachments.every(item => item.bytes instanceof Uint8Array)
        && Array.isArray(restored.missing) && restored.missing.every(reason => typeof reason === 'string')
        && (!restored.report || FeedbackReportSchema.safeParse(restored.report).success)
        && (!restored.submission || FeedbackSubmitInputSchema.safeParse(restored.submission).success)) {
        session.draft = restored
        // 已确认的初始包络可直接恢复，不占用追加窗口或反复发送已 ACK 的证据。
        if (restored.report)
          initialIds = new Set(restored.submission?.evidence?.map(item => item.id))
        if (!restored.report && !restored.submission)
          capture.trimDraftEvidence(restored)
        else
          session.draftBytes = new TextEncoder().encode(JSON.stringify(restored.evidence)).byteLength
        session.missing.add('browser-session-interrupted')
        session.deadline = Date.now()
      }
      else {
        const checkpoint = await restoreFeedbackCheckpoint(session.storageKey)
        if (session.closing || session.config !== input)
          return session.failure('NOT_INITIALIZED')
        capture.restoreCheckpoint(checkpoint)
      }
    }
    catch {
      if (session.closing || session.config !== input)
        return session.failure('NOT_INITIALIZED')
      session.missing.add('browser-persistence-unavailable')
    }
    return undefined
  }

  function onPageHide(input: FeedbackClientConfig) {
    session.deadline = Date.now()
    if (input.persistDraft && session.draft)
      void saveFeedbackDraft(session.storageKey, session.draft).catch(() => session.missing.add('browser-persistence-unavailable'))
    else if (input.persistDraft)
      void saveFeedbackCheckpoint(session.storageKey, capture.buffer).catch(() => session.missing.add('browser-persistence-unavailable'))
    void flush()
  }

  function startBackgroundFlush(input: FeedbackClientConfig) {
    flushTimer = setInterval(() => {
      if (session.draft && Date.now() > session.deadline && input.replayStart !== 'init')
        capture.pauseReplay()
      if (session.draft?.report && !session.collectionFinished && Date.now() >= nextBackgroundFlush)
        void runFlush()
    }, 1000)
  }

  async function doPrepare(options: { startNew?: boolean }): Promise<HaiResult<FeedbackDraft>> {
    if (!session.config || session.closing)
      return session.failure('NOT_INITIALIZED')
    const activeConfig = session.config
    // 先等上一轮补传退出，再收口本次窗口，避免复用收口前已完成的 Promise。
    const pending = await flushPromise
    if (session.closing || session.config !== activeConfig)
      return session.failure('NOT_INITIALIZED')
    if (session.draft?.report && !session.collectionFinished) {
      // 已受理但材料未传完时仍允许打开旧草稿并保存；只有用户明确选择才停止补传并替换。
      if (!options.startNew) {
        if (Date.now() < session.deadline && session.afterCount < capture.limits().after)
          session.draft.missing.push('collection-ended-by-new-feedback')
        session.deadline = Date.now()
        if (pending?.success !== false)
          await flush()
        if (session.closing || session.config !== activeConfig)
          return session.failure('NOT_INITIALIZED')
        if (!session.collectionFinished) {
          capture.pause()
          return core.ok(session.draft)
        }
      }
      else {
        session.collectionFinished = true
        if (session.config.persistDraft)
          await deleteFeedbackDraft(session.storageKey).catch(() => session.missing.add('browser-persistence-unavailable'))
        if (session.closing || session.config !== activeConfig)
          return session.failure('NOT_INITIALIZED')
      }
    }
    if (session.draft && !session.collectionFinished) {
      if (!session.draft.submission && session.config.screenshot !== false && session.preparedPage !== pageIdentity()) {
        const captured = await capture.captureScreenshot()
        if (!captured.success)
          return captured
      }
      const replay = capture.requestReplay(session.config, true)
      if (replay)
        await replay
      return core.ok(session.draft)
    }
    session.collectionFinished = false
    session.collectionSealed = false
    initialIds.clear()
    uploadedIds.clear()
    const now = Date.now()
    const selection = capture.selectEvidence(now)
    const { anchor, selected, other } = selection
    if (capture.keyScreenshotPromise)
      await capture.keyScreenshotPromise
    if (session.closing || session.config !== activeConfig)
      return session.failure('NOT_INITIALIZED')
    capture.trimKeyScreenshots(now)
    session.draft = {
      submissionId: core.id.uuid(),
      anchorTime: anchor?.timestamp ?? now,
      anchorKind: anchor ? 'error' : 'feedback',
      errorId: anchor?.errorId,
      evidence: [
        ...selected,
        ...other,
        ...capture.replayEvidence,
      ].sort((a, b) => a.sequence - b.sequence),
      attachments: [],
      missing: [...session.missing],
      expiresAt: now + 86_400_000,
    }
    capture.trimDraftEvidence(session.draft)
    if (capture.dropped)
      session.draft.missing.push(`browser-buffer-truncated:${capture.dropped}`)
    session.afterCount = selection.afterCount
    session.deadline = (anchor?.timestamp ?? now) + (session.config.afterTimeoutMs ?? 30_000)
    capture.recordEnvironment()
    if (session.config.screenshot !== false) {
      const current = session.draft
      const captured = await capture.captureScreenshot(undefined, 'screenshot.png')
      if (session.closing || session.config !== activeConfig || session.draft !== current)
        return session.failure('NOT_INITIALIZED')
      if (!captured.success) {
        current.missing.push(captured.error.code === HaiFeedbackError.LIMIT_EXCEEDED.code
          ? 'screenshot-size-limit-exceeded'
          : 'screenshot-unavailable')
        current.missing.push(`screenshot-error:${captured.error.message.slice(0, 300)}`)
      }
    }
    // 当前页面优先占预算，历史关键帧只能使用剩余额度。
    for (const { attachment: image } of capture.keyScreenshots) {
      if (image.size > session.budget.maxAttachmentBytes || session.draft.attachments.length >= session.budget.maxAttachmentCount || session.draft.attachments.reduce((sum, file) => sum + file.size, image.size) > session.budget.maxAttachmentsBytes)
        session.draft.missing.push('key-screenshot-budget-exceeded')
      else session.draft.attachments.push(image)
    }
    const replay = capture.requestReplay(session.config, true)
    if (replay)
      await replay
    schedulePersist()
    session.preparedPage = pageIdentity()
    return core.ok(session.draft)
  }

  function prepare(options: { startNew?: boolean } = {}): Promise<HaiResult<FeedbackDraft>> {
    preparePromise ??= doPrepare(options).finally(() => {
      preparePromise = undefined
    })
    return preparePromise
  }

  async function submit(input: FeedbackClientSubmitInput = {}): Promise<HaiResult<FeedbackReport>> {
    if (!session.config || session.closing)
      return session.failure('NOT_INITIALIZED')
    const activeConfig = session.config
    const prepared = preparePromise
      ? await preparePromise
      : session.draft
        ? core.ok(session.draft)
        : await prepare()
    if (!prepared.success)
      return prepared
    const current = prepared.data
    try {
      if (!session.policyVerified && activeConfig.actions.policy) {
        const policy = await activeConfig.actions.policy()
        if (session.closing || session.config !== activeConfig || session.draft !== current)
          return session.failure('NOT_INITIALIZED')
        if (!policy.success)
          return policy
        session.budget = FeedbackBudgetSchema.parse(policy.data)
        session.policyVerified = true
        session.missing.delete('server-policy-unavailable')
        current.missing = current.missing.filter(reason => reason !== 'server-policy-unavailable')
        if (!current.submission)
          capture.trimDraftEvidence(current)
      }
      const fingerprint = await digestHex(new TextEncoder().encode(JSON.stringify({
        description: sanitizeFeedbackData({ text: input.description ?? '' }).text,
        category: input.category ?? '',
        contact: sanitizeFeedbackData({ text: input.contact ?? '' }).text,
        files: (input.files ?? []).map(item => ({ name: item.name, size: item.size, lastModified: item.lastModified })),
        removed: [
          ...(input.removedAttachmentIds ?? []),
        ].sort(),
      })))
      if (session.closing || session.config !== activeConfig || session.draft !== current)
        return session.failure('NOT_INITIALIZED')
      if (current.submission && current.userInputFingerprint && fingerprint !== current.userInputFingerprint)
        return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
      if (!current.submission) {
        const added = await attachments.addFiles(input.files ?? [], input.removedAttachmentIds)
        if (!added.success)
          return added
      }
      if (session.closing || session.config !== activeConfig || session.draft !== current)
        return session.failure('NOT_INITIALIZED')
      if (current.submission && current.userInputFingerprint && fingerprint !== current.userInputFingerprint)
        return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
      current.submission ??= FeedbackSubmitInputSchema.parse({
        submissionId: current.submissionId,
        appId: session.config.appId,
        appVersion: session.config.appVersion,
        buildId: session.config.buildId,
        commit: session.config.commit,
        description: typeof input.description === 'string'
          ? String(sanitizeFeedbackData({ text: input.description }).text)
          : undefined,
        category: input.category,
        contact: input.contact,
        url: feedbackPageUrl(location.href),
        anchor: { kind: current.anchorKind, timestamp: current.anchorTime, errorId: current.errorId },
        evidence: current.evidence.slice(0, 1000),
        attachments: current.attachments.map(({ bytes: _bytes, ...metadata }) => metadata),
      })
      current.userInputFingerprint = fingerprint
      schedulePersist()
      const result = await activeConfig.actions.submit(current.submission)
      if (!result.success)
        return result
      if (session.closing || session.config !== activeConfig || session.draft !== current)
        return result
      current.report = result.data
      initialIds = new Set(current.submission.evidence?.map(item => item.id))
      schedulePersist()
      // 已受理立即返回；大附件和后续日志由可重试的后台 flush 续传。
      void runFlush()
      return result
    }
    catch (cause) {
      return session.failure('OPERATION_FAILED', cause)
    }
  }

  async function doFlush(): Promise<HaiResult<void>> {
    if (!session.config || !session.draft?.report)
      return session.failure('NOT_INITIALIZED')
    if (session.collectionFinished)
      return core.ok(undefined)
    try {
      for (const item of session.draft.attachments) {
        if (session.discardOnClose)
          return core.ok(undefined)
        if (uploadedIds.has(item.id))
          continue
        const result = await session.config.actions.upload({
          id: session.draft.report.id,
          attachmentId: item.id,
          dataBase64: base64(item.bytes),
        })
        if (!result.success)
          return result
        uploadedIds.add(item.id)
      }
      let drainPasses = 0
      while (true) {
        if (session.discardOnClose)
          return core.ok(undefined)
        if (session.closing || Date.now() >= session.deadline || session.afterCount >= capture.limits().after)
          session.collectionSealed = true
        const pending = session.draft.evidence.filter(item => !initialIds.has(item.id)).slice(0, 200)
        if (pending.length === 0)
          break
        const result = await session.config.actions.appendEvidence({ id: session.draft.report.id, evidence: pending })
        if (!result.success)
          return result
        for (const id of result.data.acknowledged)
          initialIds.add(id)
        if (pending.some(item => !initialIds.has(item.id)))
          return session.failure()
        drainPasses++
        if (drainPasses >= session.budget.maxAttachmentCount)
          return core.ok(undefined)
      }
      if (session.collectionSealed && !session.discardOnClose) {
        const result = await session.config.actions.completeCollection({
          id: session.draft.report.id,
          missing: [
            ...new Set([
              ...session.draft.missing,
              ...session.missing,
            ]),
          ],
        })
        if (!result.success)
          return result
        session.collectionFinished = true
        if (session.config.replayStart !== 'init')
          capture.pause()
        const updatedReport = FeedbackReportSchema.safeParse(result.data)
        if (updatedReport.success)
          session.draft.report = updatedReport.data
        if (session.config.persistDraft)
          await deleteFeedbackDraft(session.storageKey)
      }
      schedulePersist()
      return core.ok(undefined)
    }
    catch (cause) {
      return session.failure('OPERATION_FAILED', cause)
    }
  }

  function flush(): Promise<HaiResult<void>> {
    // 用户重新打开/显式重试时恢复补传；沿用同一提交和附件 ID。
    flushFailures = 0
    nextBackgroundFlush = 0
    return runFlush()
  }

  function runFlush(): Promise<HaiResult<void>> {
    flushPromise ??= doFlush().then((result) => {
      if (result.success) {
        flushFailures = 0
        nextBackgroundFlush = 0
      }
      else {
        flushFailures++
        const status = result.error.httpStatus
        // 权限/输入/资源拒绝等待用户处理；临时故障最多再试五次，避免闲置页面持续刷错。
        const rejected = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
        nextBackgroundFlush = rejected || flushFailures >= 6
          ? Number.POSITIVE_INFINITY
          : Date.now() + 1000 * 2 ** (flushFailures - 1)
      }
      return result
    }).finally(() => {
      flushPromise = undefined
    })
    return flushPromise
  }

  function stopTimers() {
    if (flushTimer)
      clearInterval(flushTimer)
    if (persistTimer)
      clearTimeout(persistTimer)
    flushTimer = undefined
    persistTimer = undefined
  }

  function finishUploadOnClose() {
    if (session.discardOnClose)
      return flushPromise
    return flush()
  }

  function persistOnClose() {
    if (session.discardOnClose && session.storageKey)
      return deleteFeedbackDraft(session.storageKey).catch(() => undefined)
    if (session.config?.persistDraft && session.draft && !session.collectionFinished)
      return saveFeedbackDraft(session.storageKey, session.draft).catch(() => undefined)
    return undefined
  }

  function reset() {
    initialIds.clear()
    uploadedIds.clear()
    flushFailures = 0
    nextBackgroundFlush = 0
  }

  return {
    restore,
    onPageHide,
    schedulePersist,
    startBackgroundFlush,
    prepare,
    submit,
    flush,
    stopTimers,
    finishUploadOnClose,
    persistOnClose,
    reset,
    get preparing() { return preparePromise },
  }
}

function base64(bytes: Uint8Array): string {
  let value = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  return btoa(value)
}
