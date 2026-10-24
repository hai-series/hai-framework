import type { FeedbackEvidenceInput, FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { FeedbackBrowserClient, FeedbackClientAttachment, FeedbackClientConfig, FeedbackClientSubmitInput, FeedbackDraft } from './feedback-client-types.js'
import { FeedbackEvidenceInputSchema, FeedbackReportSchema, FeedbackSubmitInputSchema } from '@h-ai/api-contract/feedback'
import { core, err, ok } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'
import { annotateFeedbackImage, captureFeedbackScreenshot } from './feedback-client-image.js'
import { collectFeedbackCookies, feedbackPageUrl, sanitizeFeedbackData, sanitizeFeedbackReplay, sanitizeFeedbackText } from './feedback-client-sanitize.js'
import { deleteFeedbackDraft, restoreFeedbackCheckpoint, restoreFeedbackDraft, saveFeedbackCheckpoint, saveFeedbackDraft } from './feedback-client-store.js'

/**
 * 创建独立浏览器采集会话；默认不持久化、不录制页面回放，不采集请求正文。
 * @example
 * ```ts
 * import { createFeedbackClient } from '@h-ai/feedback/client'
 * const client = createFeedbackClient()
 * const draft = client.getDraft()
 * await client.close()
 * ```
 */
export function createFeedbackClient(): FeedbackBrowserClient {
  let config: FeedbackClientConfig | undefined
  let initializing = false
  let draft: FeedbackDraft | undefined
  let sequence = 0
  let buffer: FeedbackEvidenceInput[] = []
  let bufferBytes = 0
  let dropped = 0
  let lastError: FeedbackEvidenceInput | undefined
  let errorWindows: Array<{ anchor: FeedbackEvidenceInput, evidence: FeedbackEvidenceInput[], after: number, deadline: number, bytes: number }> = []
  let afterCount = 0
  let deadline = 0
  let initialIds = new Set<string>()
  const uploadedIds = new Set<string>()
  let flushPromise: Promise<HaiResult<void>> | undefined
  let preparePromise: Promise<HaiResult<FeedbackDraft>> | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let flushTimer: ReturnType<typeof setInterval> | undefined
  let stopReplay: (() => void) | undefined
  let unsubscribeLogger: (() => void) | undefined
  let source = ''
  let keyScreenshots: Array<{ attachment: FeedbackClientAttachment, timestamp: number }> = []
  let lastKeyScreenshot = 0
  let keyScreenshotPromise: Promise<void> | undefined
  let closing = false
  let closePromise: Promise<void> | undefined
  let collectionFinished = false
  let collectionSealed = false
  let draftBytes = 0
  let storageKey = ''
  const cleanups: Array<() => void> = []
  const missing = new Set<string>()
  let replayChunks: FeedbackEvidenceInput[][] = []

  function failure(code: keyof typeof HaiFeedbackError = 'OPERATION_FAILED', cause?: unknown) {
    const key = code === 'NOT_INITIALIZED' ? 'feedback_notInitialized' : code === 'LIMIT_EXCEEDED' ? 'feedback_limitExceeded' : code === 'INVALID_INPUT' ? 'feedback_invalidInput' : 'feedback_operationFailed'
    return err(HaiFeedbackError[code], feedbackM(key), cause)
  }

  function limits() {
    return { events: config?.maxEvents ?? 1000, bytes: config?.maxBytes ?? 2 * 1024 * 1024, age: config?.maxAgeMs ?? 300_000, before: config?.beforeCount ?? 100, after: config?.afterCount ?? 100 }
  }

  function schedulePersist() {
    if (!config?.persistDraft || persistTimer)
      return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      if (config && draft && !collectionFinished)
        void saveFeedbackDraft(storageKey, draft).catch(() => missing.add('browser-persistence-unavailable'))
      else if (config)
        void saveFeedbackCheckpoint(storageKey, buffer).catch(() => missing.add('browser-persistence-unavailable'))
    }, 200)
  }

  function record(event: { kind: FeedbackEvidenceInput['kind'], data: Record<string, unknown>, requestId?: string, errorId?: string }) {
    if (!config || closing)
      return
    const entry = FeedbackEvidenceInputSchema.safeParse({
      id: core.id.uuid(),
      source,
      sequence: ++sequence,
      kind: event.kind,
      timestamp: Date.now(),
      requestId: event.requestId,
      errorId: event.kind === 'error' || (event.kind === 'request' && event.data.success === false) ? event.errorId ?? core.id.uuid() : event.errorId,
      data: sanitizeFeedbackData(event.data),
    })
    if (!entry.success)
      return
    const item = entry.data
    const size = new TextEncoder().encode(JSON.stringify(item)).byteLength
    const bounds = limits()
    if (size > Math.min(bounds.bytes, 64 * 1024)) {
      dropped++
      return
    }
    buffer.push(item)
    bufferBytes += size
    while (buffer.length > bounds.events || bufferBytes > bounds.bytes || (buffer[0]?.timestamp ?? 0) < Date.now() - bounds.age) {
      const removed = buffer.shift()
      if (removed)
        bufferBytes -= new TextEncoder().encode(JSON.stringify(removed)).byteLength
      dropped++
    }
    const logEntry = item.kind === 'log' || item.kind === 'error'
    if (logEntry) {
      for (const window of errorWindows) {
        if (item.timestamp <= window.deadline && window.after < bounds.after) {
          window.evidence.push(item)
          window.after++
          window.bytes += size
        }
      }
    }
    if (item.kind === 'error' || (item.kind === 'request' && item.data.success === false)) {
      lastError = item
      const before = buffer.filter(entry => (entry.kind === 'log' || entry.kind === 'error') && entry.id !== item.id)
      const evidence = [...before.slice(Math.max(0, before.length - bounds.before)), item]
      errorWindows.push({ anchor: item, evidence, after: 0, deadline: item.timestamp + (config.afterTimeoutMs ?? 30_000), bytes: new TextEncoder().encode(JSON.stringify(evidence)).byteLength })
      void captureKeyScreenshot()
    }
    errorWindows = errorWindows.filter(window => window.anchor.timestamp >= Date.now() - bounds.age)
    while (errorWindows.length > 10 || errorWindows.reduce((total, window) => total + window.evidence.length, 0) > bounds.events || errorWindows.reduce((total, window) => total + window.bytes, 0) > bounds.bytes) {
      errorWindows.shift()
      missing.add('browser-error-windows-truncated')
    }
    schedulePersist()
    if (draft && !collectionFinished && !collectionSealed && ((Date.now() <= deadline && afterCount < bounds.after) || item.kind === 'environment') && draft.evidence.length < bounds.events && draftBytes + size <= bounds.bytes) {
      draft.evidence.push(item)
      draftBytes += size
      if (item.kind === 'log' || item.kind === 'error')
        afterCount++
      schedulePersist()
    }
  }

  function listen<K extends keyof WindowEventMap>(name: K, callback: (event: WindowEventMap[K]) => void) {
    window.addEventListener(name, callback)
    cleanups.push(() => window.removeEventListener(name, callback))
  }

  async function init(input: FeedbackClientConfig): Promise<HaiResult<void>> {
    if (initializing)
      return err(HaiFeedbackError.INIT_IN_PROGRESS, feedbackM('feedback_initInProgress'))
    initializing = true
    try {
      if (config || closePromise)
        await close()
      if (typeof window === 'undefined' || !input.appId || !input.actions || ['submit', 'appendEvidence', 'completeCollection', 'upload'].some(key => typeof input.actions[key as keyof typeof input.actions] !== 'function'))
        return failure('INVALID_INPUT')
      const numeric = [input.maxEvents, input.maxBytes, input.maxAgeMs, input.beforeCount, input.afterCount, input.afterTimeoutMs, input.screenshotTimeoutMs, input.maxKeyScreenshots, input.keyScreenshotThrottleMs]
      if (numeric.some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || (input.persistDraft && !input.persistenceKey))
        return failure('INVALID_INPUT')
      config = input
      closing = false
      source = `browser:${core.id.uuid()}`
      storageKey = `${input.appId}:${input.persistenceKey ?? ''}`
      if (input.persistDraft) {
        try {
          const restored = await restoreFeedbackDraft(storageKey)
          if (closing || config !== input)
            return failure('NOT_INITIALIZED')
          if (restored && Array.isArray(restored.evidence) && restored.evidence.every(item => FeedbackEvidenceInputSchema.safeParse(item).success)
            && Array.isArray(restored.attachments) && restored.attachments.every(item => item.bytes instanceof Uint8Array)
            && (!restored.report || FeedbackReportSchema.safeParse(restored.report).success)) {
            draft = restored
            missing.add('browser-session-interrupted')
            deadline = Date.now()
          }
          else {
            const checkpoint = await restoreFeedbackCheckpoint(storageKey)
            if (closing || config !== input)
              return failure('NOT_INITIALIZED')
            if (checkpoint && typeof checkpoint === 'object' && 'evidence' in checkpoint && Array.isArray(checkpoint.evidence) && 'expiresAt' in checkpoint && typeof checkpoint.expiresAt === 'number' && checkpoint.expiresAt > Date.now()) {
              const parsed = checkpoint.evidence.map(item => FeedbackEvidenceInputSchema.safeParse(item))
              if (parsed.every(item => item.success)) {
                buffer = parsed.filter(item => item.success).map(item => item.data)
                bufferBytes = new TextEncoder().encode(JSON.stringify(buffer)).byteLength
                sequence = Math.max(0, ...buffer.map(item => item.sequence))
                lastError = buffer.filter(item => item.kind === 'error' || (item.kind === 'request' && item.data.success === false)).at(-1)
                missing.add('browser-session-interrupted')
                missing.add('previous-page-screenshot-unavailable')
              }
            }
          }
        }
        catch {
          if (closing || config !== input)
            return failure('NOT_INITIALIZED')
          missing.add('browser-persistence-unavailable')
        }
      }
      unsubscribeLogger = core.logger.observe((entry) => {
        if (entry.context.module === 'feedback' || entry.context.feedback === true)
          return
        record({ kind: ['error', 'fatal'].includes(entry.level) ? 'error' : 'log', requestId: typeof entry.context.requestId === 'string' ? entry.context.requestId : undefined, data: { level: entry.level, message: entry.message, context: entry.context } })
      })
      listen('error', event => record({ kind: 'error', data: { message: event.message, stack: event.error instanceof Error ? event.error.stack : undefined, filename: feedbackPageUrl(event.filename || location.href), line: event.lineno, column: event.colno } }))
      listen('unhandledrejection', event => record({ kind: 'error', data: { reason: event.reason } }))
      const click = (event: MouseEvent) => {
        if (!(event.target instanceof Element) || event.target.closest('[data-feedback-ignore]'))
          return
        const target = event.target.closest('[data-feedback-action],button,a')
        if (target && !target.closest('[data-feedback-private]')) {
          record({ kind: 'interaction', data: { action: target.getAttribute('data-feedback-action') ?? target.tagName.toLowerCase(), route: location.pathname } })
          if (target.hasAttribute('data-feedback-action'))
            void captureKeyScreenshot()
        }
      }
      document.addEventListener('click', click, true)
      cleanups.push(() => document.removeEventListener('click', click, true))
      if (input.captureConsole) {
        for (const level of ['debug', 'info', 'warn', 'error'] as const) {
          const original = globalThis.console[level]
          const wrapper: typeof original = (...args) => {
            record({ kind: level === 'error' ? 'error' : 'log', data: { channel: 'console', level, arguments: args } })
            original.apply(globalThis.console, args)
          }
          globalThis.console[level] = wrapper
          cleanups.push(() => {
            if (globalThis.console[level] === wrapper)
              globalThis.console[level] = original
          })
        }
      }
      listen('pagehide', () => {
        deadline = Date.now()
        if (input.persistDraft && draft)
          void saveFeedbackDraft(storageKey, draft).catch(() => missing.add('browser-persistence-unavailable'))
        else if (input.persistDraft)
          void saveFeedbackCheckpoint(storageKey, buffer).catch(() => missing.add('browser-persistence-unavailable'))
        void flush()
      })
      if (input.replay)
        await startReplay(input)
      if (closing || config !== input)
        return failure('NOT_INITIALIZED')
      flushTimer = setInterval(() => {
        if (draft?.report)
          void flush()
      }, 1000)
      return ok(undefined)
    }
    catch (cause) {
      await close()
      return failure('OPERATION_FAILED', cause)
    }
    finally {
      initializing = false
    }
  }

  async function startReplay(activeConfig: FeedbackClientConfig) {
    try {
      const { record: start } = await import('@rrweb/record')
      if (closing || config !== activeConfig)
        return
      stopReplay = start({
        maskAllInputs: true,
        maskTextSelector: '[data-feedback-private],.rr-mask',
        blockSelector: '[data-feedback-ignore],[data-feedback-private],.rr-block,iframe,canvas,video',
        inlineImages: true,
        inlineStylesheet: true,
        collectFonts: false,
        checkoutEveryNms: 30_000,
        emit: (event, isCheckout) => {
          if (isCheckout || replayChunks.length === 0)
            replayChunks.push([])
          let payload: Record<string, unknown>
          try {
            payload = sanitizeFeedbackReplay(event)
          }
          catch {
            missing.add('replay-snapshot-truncated')
            return
          }
          const safe = FeedbackEvidenceInputSchema.safeParse({ id: core.id.uuid(), source, sequence: ++sequence, kind: 'replay', timestamp: Date.now(), data: { event: payload } })
          if (!safe.success)
            return
          replayChunks.at(-1)?.push(safe.data)
          while (replayChunks.length > 2)
            replayChunks.shift()
          const count = replayChunks.reduce((total, chunk) => total + chunk.length, 0)
          const bytes = new TextEncoder().encode(JSON.stringify(replayChunks)).byteLength
          if (count > limits().events || bytes > limits().bytes) {
            replayChunks = []
            missing.add('replay-capacity-exceeded')
          }
        },
      }) ?? undefined
    }
    catch {
      if (!closing && config === activeConfig)
        missing.add('replay-recorder-unavailable')
    }
  }

  function captureKeyScreenshot(): Promise<void> {
    if (!config || config.screenshot === false || config.keyScreenshots === false || config.maxKeyScreenshots === 0 || keyScreenshotPromise || Date.now() - lastKeyScreenshot < (config.keyScreenshotThrottleMs ?? 10_000))
      return keyScreenshotPromise ?? Promise.resolve()
    const activeConfig = config
    lastKeyScreenshot = Date.now()
    keyScreenshotPromise = (async () => {
      try {
        const bytes = await bounded(activeConfig.captureScreenshot?.() ?? captureFeedbackScreenshot(), activeConfig.screenshotTimeoutMs ?? 3000)
        if (closing || config !== activeConfig)
          return
        if (bytes.byteLength > 5 * 1024 * 1024) {
          missing.add('key-screenshot-size-limit-exceeded')
          return
        }
        const image = await attachment(`operation-${lastKeyScreenshot}.png`, 'image/png', bytes)
        if (closing || config !== activeConfig)
          return
        keyScreenshots.push({ attachment: image, timestamp: lastKeyScreenshot })
        keyScreenshots = keyScreenshots.filter(item => item.timestamp >= Date.now() - limits().age).slice(-Math.min(activeConfig.maxKeyScreenshots ?? 3, 5))
      }
      catch {
        if (!closing && config === activeConfig)
          missing.add('key-screenshot-unavailable')
      }
    })().finally(() => {
      keyScreenshotPromise = undefined
    })
    return keyScreenshotPromise
  }

  async function doPrepare(): Promise<HaiResult<FeedbackDraft>> {
    if (!config || closing)
      return failure('NOT_INITIALIZED')
    const activeConfig = config
    if (draft?.report && !collectionFinished) {
      // 新反馈开始前先确认上一份待传材料，不能以关闭弹窗丢弃附件。
      if (Date.now() < deadline && afterCount < limits().after)
        draft.missing.push('collection-ended-by-new-feedback')
      deadline = Date.now()
      const settled = await flush()
      if (!settled.success)
        return settled
      if (closing || config !== activeConfig)
        return failure('NOT_INITIALIZED')
    }
    if (draft && !collectionFinished)
      return ok(draft)
    collectionFinished = false
    collectionSealed = false
    initialIds.clear()
    uploadedIds.clear()
    const now = Date.now()
    buffer = buffer.filter(item => item.timestamp >= now - limits().age)
    bufferBytes = new TextEncoder().encode(JSON.stringify(buffer)).byteLength
    errorWindows = errorWindows.filter(window => window.anchor.timestamp >= now - limits().age)
    const frozenWindow = errorWindows.at(-1)
    const anchor = frozenWindow?.anchor ?? (lastError && lastError.timestamp >= now - limits().age && buffer.some(item => item.id === lastError?.id) ? lastError : undefined)
    const logs = buffer.filter(item => item.kind === 'log' || item.kind === 'error')
    const anchorIndex = anchor ? logs.findIndex(item => item.id === anchor.id) : logs.length
    const anchorIndexes = anchor ? logs.map((item, index) => item.kind === 'error' ? index : -1).filter(index => index >= 0).slice(-10) : []
    const selectedIds = new Set<string>()
    const selected = anchor
      ? (errorWindows.length ? errorWindows.flatMap(window => window.evidence) : anchorIndexes.flatMap(index => logs.slice(Math.max(0, index - limits().before), index + 1 + limits().after))).filter((item) => {
          if (selectedIds.has(item.id))
            return false
          selectedIds.add(item.id)
          return true
        }).sort((a, b) => a.sequence - b.sequence)
      : logs.slice(Math.max(0, logs.length - limits().before))
    const other = buffer.filter(item => item.kind !== 'log' && item.kind !== 'error').slice(-100)
    if (keyScreenshotPromise)
      await keyScreenshotPromise
    if (closing || config !== activeConfig)
      return failure('NOT_INITIALIZED')
    keyScreenshots = keyScreenshots.filter(item => item.timestamp >= now - limits().age)
    draft = { submissionId: core.id.uuid(), anchorTime: anchor?.timestamp ?? now, anchorKind: anchor ? 'error' : 'feedback', errorId: anchor?.errorId, evidence: [...selected, ...other, ...replayChunks.flat()].sort((a, b) => a.sequence - b.sequence), attachments: keyScreenshots.map(item => item.attachment), missing: [...missing], expiresAt: now + 86_400_000 }
    while (draft.evidence.length > limits().events || new TextEncoder().encode(JSON.stringify(draft.evidence)).byteLength > limits().bytes) {
      draft.evidence.shift()
      missing.add('browser-draft-truncated')
    }
    draftBytes = new TextEncoder().encode(JSON.stringify(draft.evidence)).byteLength
    if (dropped)
      draft.missing.push(`browser-buffer-truncated:${dropped}`)
    afterCount = frozenWindow?.after ?? (anchor ? Math.max(0, logs.length - anchorIndex - 1) : 0)
    deadline = (anchor?.timestamp ?? now) + (config.afterTimeoutMs ?? 30_000)
    record({ kind: 'environment', data: { appId: config.appId, appVersion: config.appVersion, buildId: config.buildId, commit: config.commit, url: feedbackPageUrl(location.href), browser: navigator.userAgent, language: navigator.language, timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone, viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio }, online: navigator.onLine, cookies: collectFeedbackCookies(document.cookie, config.cookieAllowlist ?? []) } })
    if (config.screenshot !== false) {
      const current = draft
      try {
        const bytes = await bounded(config.captureScreenshot?.() ?? captureFeedbackScreenshot(), config.screenshotTimeoutMs ?? 3000)
        if (closing || config !== activeConfig || draft !== current)
          return failure('NOT_INITIALIZED')
        if (bytes.byteLength > 5 * 1024 * 1024) {
          current.missing.push('screenshot-size-limit-exceeded')
        }
        else {
          const image = await attachment('screenshot.png', 'image/png', bytes)
          if (closing || config !== activeConfig || draft !== current)
            return failure('NOT_INITIALIZED')
          current.attachments.push(image)
        }
      }
      catch (cause) {
        if (closing || config !== activeConfig || draft !== current)
          return failure('NOT_INITIALIZED')
        current.missing.push('screenshot-unavailable')
        if (cause instanceof Error)
          current.missing.push(`screenshot-error:${String(sanitizeFeedbackData({ message: cause.message }).message).slice(0, 300)}`)
      }
    }
    schedulePersist()
    return ok(draft)
  }

  function prepare(): Promise<HaiResult<FeedbackDraft>> {
    preparePromise ??= doPrepare().finally(() => {
      preparePromise = undefined
    })
    return preparePromise
  }

  async function submit(input: FeedbackClientSubmitInput = {}): Promise<HaiResult<FeedbackReport>> {
    if (!config || closing)
      return failure('NOT_INITIALIZED')
    const activeConfig = config
    const prepared = preparePromise ? await preparePromise : draft ? ok(draft) : await prepare()
    if (!prepared.success)
      return prepared
    const current = prepared.data
    try {
      const fingerprint = await digestHex(new TextEncoder().encode(JSON.stringify({ description: sanitizeFeedbackData({ text: input.description ?? '' }).text, category: input.category ?? '', contact: sanitizeFeedbackData({ text: input.contact ?? '' }).text, files: (input.files ?? []).map(item => ({ name: item.name, size: item.size, lastModified: item.lastModified })), removed: [...(input.removedAttachmentIds ?? [])].sort() })))
      if (closing || config !== activeConfig || draft !== current)
        return failure('NOT_INITIALIZED')
      if (current.submission && current.userInputFingerprint && fingerprint !== current.userInputFingerprint)
        return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
      if (!current.submission && input.removedAttachmentIds?.length)
        current.attachments = current.attachments.filter(item => !input.removedAttachmentIds?.includes(item.id))
      if (!current.submission) {
        const added = await addFiles(input.files ?? [])
        if (!added.success)
          return added
      }
      if (closing || config !== activeConfig || draft !== current)
        return failure('NOT_INITIALIZED')
      current.submission ??= FeedbackSubmitInputSchema.parse({ submissionId: current.submissionId, appId: config.appId, appVersion: config.appVersion, buildId: config.buildId, commit: config.commit, description: typeof input.description === 'string' ? String(sanitizeFeedbackData({ text: input.description }).text) : undefined, category: input.category, contact: input.contact, url: feedbackPageUrl(location.href), anchor: { kind: current.anchorKind, timestamp: current.anchorTime, errorId: current.errorId }, evidence: current.evidence, attachments: current.attachments.map(({ bytes: _bytes, ...metadata }) => metadata) })
      current.userInputFingerprint = fingerprint
      schedulePersist()
      const result = await activeConfig.actions.submit(current.submission)
      if (!result.success)
        return result
      if (closing || config !== activeConfig || draft !== current)
        return result
      current.report = result.data
      initialIds = new Set(current.submission.evidence?.map(item => item.id))
      schedulePersist()
      // 已受理立即返回；大附件和后续日志由可重试的后台 flush 续传。
      void flush()
      return result
    }
    catch (cause) {
      return failure('OPERATION_FAILED', cause)
    }
  }

  async function doFlush(): Promise<HaiResult<void>> {
    if (!config || !draft?.report)
      return failure('NOT_INITIALIZED')
    if (collectionFinished)
      return ok(undefined)
    try {
      for (const item of draft.attachments) {
        if (uploadedIds.has(item.id))
          continue
        const result = await config.actions.upload({ id: draft.report.id, attachmentId: item.id, dataBase64: base64(item.bytes) })
        if (!result.success)
          return result
        uploadedIds.add(item.id)
      }
      let drainPasses = 0
      while (true) {
        if (closing || Date.now() >= deadline || afterCount >= limits().after)
          collectionSealed = true
        const pending = draft.evidence.filter(item => !initialIds.has(item.id)).slice(0, 200)
        if (pending.length === 0)
          break
        const result = await config.actions.appendEvidence({ id: draft.report.id, evidence: pending })
        if (!result.success)
          return result
        for (const id of result.data.acknowledged)
          initialIds.add(id)
        if (pending.some(item => !initialIds.has(item.id)))
          return failure()
        drainPasses++
        if (drainPasses >= 20)
          return ok(undefined)
      }
      if (collectionSealed) {
        const result = await config.actions.completeCollection({ id: draft.report.id, missing: [...new Set([...draft.missing, ...missing])] })
        if (!result.success)
          return result
        collectionFinished = true
        const updatedReport = FeedbackReportSchema.safeParse(result.data)
        if (updatedReport.success)
          draft.report = updatedReport.data
        if (config.persistDraft)
          await deleteFeedbackDraft(storageKey)
      }
      schedulePersist()
      return ok(undefined)
    }
    catch (cause) {
      return failure('OPERATION_FAILED', cause)
    }
  }

  function flush(): Promise<HaiResult<void>> {
    flushPromise ??= doFlush().finally(() => {
      flushPromise = undefined
    })
    return flushPromise
  }

  async function annotate(id: string, mark: Parameters<typeof annotateFeedbackImage>[1]): Promise<HaiResult<void>> {
    if (!draft || closing)
      return failure('NOT_INITIALIZED')
    const current = draft
    const item = current.attachments.find(value => value.id === id)
    if (!item || current.submission)
      return failure('INVALID_INPUT')
    const originalBytes = item.bytes
    try {
      const bytes = await annotateFeedbackImage(originalBytes, mark)
      const name = /\.[^.]+$/.test(item.name) ? item.name.replace(/\.[^.]+$/, '.png') : `${item.name}.png`
      const updated = await attachment(name, 'image/png', bytes)
      // 渲染/摘要结束后再原子替换；提交、关闭、删除或另一标注不能被旧异步结果覆盖。
      if (closing || draft !== current || current.submission || !current.attachments.includes(item) || item.bytes !== originalBytes)
        return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
      Object.assign(item, updated, { id })
      schedulePersist()
      return ok(undefined)
    }
    catch (cause) {
      return failure('OPERATION_FAILED', cause)
    }
  }

  async function addFiles(files: readonly File[]): Promise<HaiResult<void>> {
    if (!draft)
      return failure('NOT_INITIALIZED')
    if (draft.submission && files.length)
      return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
    const current = draft
    const items: FeedbackClientAttachment[] = []
    const newMissing: string[] = []
    try {
      for (const file of files) {
        if (items.length >= 20 || file.size > 5 * 1024 * 1024)
          return failure('LIMIT_EXCEEDED')
        if (!['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/json'].includes(file.type))
          return failure('INVALID_INPUT')
        let bytes: Uint8Array
        if (file.type.startsWith('text/') || file.type === 'application/json') {
          const raw = await file.text()
          if (file.type === 'application/json' && raw.length > 8192)
            newMissing.push(`attachment-text-truncated:${String(sanitizeFeedbackData({ text: file.name }).text).slice(0, 100)}`)
          bytes = file.type === 'application/json'
            ? new TextEncoder().encode(JSON.stringify(sanitizeFeedbackData(JSON.parse(raw))))
            : new TextEncoder().encode(sanitizeFeedbackText(raw))
        }
        else {
          bytes = new Uint8Array(await file.arrayBuffer())
        }
        if (bytes.byteLength > 5 * 1024 * 1024)
          return failure('LIMIT_EXCEEDED')
        const item = await attachment(file.name, file.type, bytes)
        if (!items.some(existing => existing.name === item.name && existing.checksum === item.checksum))
          items.push(item)
      }
      // 读取/摘要计算期间草稿可能切换或冻结；失败批次不能留下附件或缺失标记。
      if (draft !== current || closing)
        return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
      if (current.submission && files.length)
        return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
      // 在最新附件上合并，保留读取期间另一成功批次的新增项；最终校验与提交之间没有 await。
      const merged = [...current.attachments]
      for (const item of items) {
        if (!merged.some(existing => existing.name === item.name && existing.checksum === item.checksum))
          merged.push(item)
      }
      if (merged.length > 20)
        return failure('LIMIT_EXCEEDED')
      current.attachments = merged
      current.missing.push(...newMissing)
      schedulePersist()
      return ok(undefined)
    }
    catch (cause) {
      return failure('INVALID_INPUT', cause)
    }
  }

  async function exportDraft(input: FeedbackClientSubmitInput = {}): Promise<HaiResult<Uint8Array>> {
    if (!draft)
      return failure('NOT_INITIALIZED')
    try {
      const { createFeedbackBundle } = await import('../bundle/index.js')
      const attachments = [...draft.attachments]
      if (!draft.submission) {
        const added = await addFiles(input.files ?? [])
        if (!added.success)
          return added
        attachments.splice(0, attachments.length, ...draft.attachments)
      }
      else {
        // 离线兜底保留失败后新增的本地文件，但不改变已发送包络或后续上传队列。
        for (const file of input.files ?? []) {
          if (attachments.length >= 20 || file.size > 5 * 1024 * 1024)
            return failure('LIMIT_EXCEEDED')
          if (!['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/json'].includes(file.type))
            return failure('INVALID_INPUT')
          const bytes = file.type === 'application/json'
            ? new TextEncoder().encode(JSON.stringify(sanitizeFeedbackData(JSON.parse(await file.text()))))
            : file.type.startsWith('text/') ? new TextEncoder().encode(sanitizeFeedbackText(await file.text())) : new Uint8Array(await file.arrayBuffer())
          if (bytes.byteLength > 5 * 1024 * 1024)
            return failure('LIMIT_EXCEEDED')
          const item = await attachment(file.name, file.type, bytes)
          if (!attachments.some(existing => existing.name === item.name && existing.checksum === item.checksum))
            attachments.push(item)
        }
      }
      return createFeedbackBundle({ report: { ...(draft.report ?? { id: draft.submissionId, appId: config?.appId, anchor: { kind: draft.anchorKind, timestamp: draft.anchorTime }, evidenceRevision: 1 }), ...sanitizeFeedbackData({ description: input.description ?? draft.report?.description ?? '', category: input.category, contact: input.contact }) }, evidence: draft.evidence, attachments: attachments.filter(item => !input.removedAttachmentIds?.includes(item.id)), missing: [...new Set([...draft.missing, ...missing, ...(!draft.report ? ['server-evidence-not-obtained', 'feedback-not-yet-accepted'] : [])])] })
    }
    catch (cause) {
      return failure('OPERATION_FAILED', cause)
    }
  }

  function close(): Promise<void> {
    closePromise ??= doClose().finally(() => {
      closePromise = undefined
    })
    return closePromise
  }

  async function doClose(): Promise<void> {
    closing = true
    unsubscribeLogger?.()
    unsubscribeLogger = undefined
    stopReplay?.()
    stopReplay = undefined
    for (const cleanup of cleanups.splice(0))
      cleanup()
    if (flushTimer)
      clearInterval(flushTimer)
    if (persistTimer)
      clearTimeout(persistTimer)
    flushTimer = undefined
    persistTimer = undefined
    // 截图有既定超时；等待采集退出后再清空草稿，避免旧回调复活会话。
    await preparePromise
    await keyScreenshotPromise
    if (draft?.report)
      await flush()
    if (config?.persistDraft && draft && !collectionFinished)
      await saveFeedbackDraft(storageKey, draft).catch(() => undefined)
    config = undefined
    buffer = []
    bufferBytes = 0
    draft = undefined
    lastError = undefined
    errorWindows = []
    replayChunks = []
    keyScreenshots = []
    lastKeyScreenshot = 0
    initialIds.clear()
    uploadedIds.clear()
    missing.clear()
    dropped = 0
    collectionFinished = false
    collectionSealed = false
  }

  return { init, prepare, submit, flush, record, getDraft: () => draft, annotate, addFiles, exportDraft, close }
}

/**
 * 默认浏览器采集会话。
 * @example
 * ```ts
 * import { feedbackClient } from '@h-ai/feedback/client'
 * const draft = feedbackClient.getDraft()
 * ```
 */
export const feedbackClient = createFeedbackClient()

async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Capture timed out')), ms)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}

async function attachment(name: string, contentType: string, bytes: Uint8Array): Promise<FeedbackClientAttachment> {
  const checksum = await digestHex(bytes)
  return { id: core.id.uuid(), name: String(sanitizeFeedbackData({ text: name }).text).slice(0, 255), contentType, size: bytes.byteLength, checksum, bytes }
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function base64(bytes: Uint8Array): string {
  let value = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  return btoa(value)
}
