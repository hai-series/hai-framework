import type { FeedbackEvidenceInput } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { FeedbackClientSession } from './feedback-client-session.js'
import type { FeedbackClientAttachment, FeedbackClientConfig, FeedbackDraft } from './feedback-client-types.js'
import { FeedbackEvidenceInputSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { feedbackClientEvidenceLimits } from '../feedback-evidence-budget.js'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'
import { createFeedbackAttachment } from './feedback-client-attachments.js'
import { captureFeedbackScreenshot } from './feedback-client-image.js'
import { collectFeedbackCookies, feedbackPageUrl, sanitizeFeedbackData, sanitizeFeedbackReplay } from './feedback-client-sanitize.js'

/**
 * 为单个客户端创建证据缓冲、浏览器监听和截图/回放操作。
 * @example 模块内部上下文
 * ```ts
 * function countBuffered(session: FeedbackClientSession) {
 *   const capture = createFeedbackCapture(session, () => {})
 *   return capture.buffer.length
 * }
 * ```
 */
export function createFeedbackCapture(session: FeedbackClientSession, schedulePersist: () => void) {
  let sequence = 0
  let buffer: FeedbackEvidenceInput[] = []
  let bufferBytes = 0
  let dropped = 0
  let lastError: FeedbackEvidenceInput | undefined
  let errorWindows: Array<{ anchor: FeedbackEvidenceInput, evidence: FeedbackEvidenceInput[], after: number, deadline: number, bytes: number }> = []
  let stopReplay: (() => void) | undefined
  let screenshotCaptures = 0
  let captureTask: { promise: Promise<Uint8Array>, controller: AbortController, config: FeedbackClientConfig } | undefined
  let replayRequested = false
  let unsubscribeLogger: (() => void) | undefined
  let source = ''
  let keyScreenshots: Array<{ attachment: FeedbackClientAttachment, timestamp: number }> = []
  let lastKeyScreenshot = 0
  let keyScreenshotPromise: Promise<void> | undefined
  const cleanups: Array<() => void> = []
  let replayChunks: FeedbackEvidenceInput[][] = []

  function limits() {
    const server = feedbackClientEvidenceLimits(session.budget)
    return {
      events: Math.min(session.config?.maxEvents ?? 1000, server.events),
      bytes: Math.min(session.config?.maxBytes ?? 2 * 1024 * 1024, server.bytes),
      age: session.config?.maxAgeMs ?? 300_000,
      before: session.config?.beforeCount ?? 100,
      after: session.config?.afterCount ?? 100,
    }
  }

  function record(event: { kind: FeedbackEvidenceInput['kind'], data: Record<string, unknown>, requestId?: string, errorId?: string }) {
    if (!session.config || session.closing)
      return
    const entry = FeedbackEvidenceInputSchema.safeParse({
      id: core.id.uuid(),
      source,
      sequence: ++sequence,
      kind: event.kind,
      timestamp: Date.now(),
      requestId: event.requestId,
      errorId: event.kind === 'error' || (event.kind === 'request' && event.data.success === false)
        ? event.errorId ?? core.id.uuid()
        : event.errorId,
      data: sanitizeFeedbackData(event.data),
    })
    if (!entry.success)
      return
    const item = entry.data
    const size = new TextEncoder().encode(JSON.stringify(item)).byteLength
    const bounds = limits()
    if (bounds.events === 0 || size > Math.min(bounds.bytes, 64 * 1024)) {
      dropped++
      session.missing.add('browser-draft-truncated')
      if (session.draft && !session.collectionFinished && !session.collectionSealed && !session.draft.missing.includes('browser-draft-truncated'))
        session.draft.missing.push('browser-draft-truncated')
      return
    }
    buffer.push(item)
    bufferBytes += size
    while (buffer.length && (buffer.length > bounds.events || bufferBytes > bounds.bytes || buffer[0]!.timestamp < Date.now() - bounds.age)) {
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
      const evidence = [
        ...before.slice(Math.max(0, before.length - bounds.before)),
        item,
      ]
      errorWindows.push({
        anchor: item,
        evidence,
        after: 0,
        deadline: item.timestamp + (session.config.afterTimeoutMs ?? 30_000),
        bytes: new TextEncoder().encode(JSON.stringify(evidence)).byteLength,
      })
      void captureKeyScreenshot()
    }
    errorWindows = errorWindows.filter(window => window.anchor.timestamp >= Date.now() - bounds.age)
    while (errorWindows.length > 10 || errorWindows.reduce((total, window) => total + window.evidence.length, 0) > bounds.events || errorWindows.reduce((total, window) => total + window.bytes, 0) > bounds.bytes) {
      errorWindows.shift()
      session.missing.add('browser-error-windows-truncated')
    }
    schedulePersist()
    appendToDraft(item, size)
  }

  function appendToDraft(item: FeedbackEvidenceInput, size: number, snapshot = false) {
    const bounds = limits()
    if (!session.draft || session.collectionFinished || session.collectionSealed || (!snapshot && !(Date.now() <= session.deadline && session.afterCount < bounds.after) && item.kind !== 'environment'))
      return
    const addedBytes = size + (session.draft.evidence.length ? 1 : 0)
    if (session.draft.evidence.length >= bounds.events || session.draftBytes + addedBytes > bounds.bytes) {
      if (!session.draft.missing.includes('browser-draft-truncated'))
        session.draft.missing.push('browser-draft-truncated')
      return
    }
    session.draft.evidence.push(item)
    session.draftBytes += addedBytes
    if (item.kind === 'log' || item.kind === 'error')
      session.afterCount++
    schedulePersist()
  }

  function trimDraftEvidence(current: FeedbackDraft) {
    const bounds = limits()
    const encoder = new TextEncoder()
    let bytes = encoder.encode(JSON.stringify(current.evidence)).byteLength
    let removed = 0
    while (removed < current.evidence.length && (current.evidence.length - removed > bounds.events || bytes > bounds.bytes)) {
      bytes -= encoder.encode(JSON.stringify(current.evidence[removed])).byteLength + (removed + 1 < current.evidence.length
        ? 1
        : 0)
      removed++
    }
    if (removed) {
      current.evidence.splice(0, removed)
      if (!current.missing.includes('browser-draft-truncated'))
        current.missing.push('browser-draft-truncated')
    }
    session.draftBytes = bytes
  }

  function listen<K extends keyof WindowEventMap>(name: K, callback: (event: WindowEventMap[K]) => void) {
    window.addEventListener(name, callback)
    cleanups.push(() => window.removeEventListener(name, callback))
  }

  function restoreCheckpoint(checkpoint: unknown) {
    if (checkpoint && typeof checkpoint === 'object' && 'evidence' in checkpoint && Array.isArray(checkpoint.evidence) && 'expiresAt' in checkpoint && typeof checkpoint.expiresAt === 'number' && checkpoint.expiresAt > Date.now()) {
      const parsed = checkpoint.evidence.map(item => FeedbackEvidenceInputSchema.safeParse(item))
      if (parsed.every(item => item.success)) {
        buffer = parsed.filter(item => item.success).map(item => item.data)
        bufferBytes = new TextEncoder().encode(JSON.stringify(buffer)).byteLength
        sequence = Math.max(0, ...buffer.map(item => item.sequence))
        lastError = buffer.filter(item => item.kind === 'error' || (item.kind === 'request' && item.data.success === false)).at(-1)
        session.missing.add('browser-session-interrupted')
        session.missing.add('previous-page-screenshot-unavailable')
      }
    }
  }

  function attachListeners(input: FeedbackClientConfig, onPageHide: () => void) {
    unsubscribeLogger = core.logger.observe((entry) => {
      if (entry.context.module === 'feedback' || entry.context.feedback === true)
        return
      record({
        kind: ['error', 'fatal'].includes(entry.level)
          ? 'error'
          : 'log',
        requestId: typeof entry.context.requestId === 'string'
          ? entry.context.requestId
          : typeof entry.context.traceId === 'string'
            ? entry.context.traceId
            : undefined,
        data: { level: entry.level, message: entry.message, context: entry.context },
      })
    })
    listen('error', event => record({
      kind: 'error',
      data: {
        message: event.message,
        stack: event.error instanceof Error
          ? event.error.stack
          : undefined,
        filename: feedbackPageUrl(event.filename || location.href),
        line: event.lineno,
        column: event.colno,
      },
    }))
    listen('unhandledrejection', event => record({
      kind: 'error',
      data: { reason: event.reason },
    }))
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-feedback-ignore]'))
        return
      const target = event.target.closest('[data-feedback-action],button,a')
      if (target && !target.closest('[data-feedback-private]')) {
        record({
          kind: 'interaction',
          data: { action: target.getAttribute('data-feedback-action') ?? target.tagName.toLowerCase(), route: location.pathname },
        })
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
          record({
            kind: level === 'error'
              ? 'error'
              : 'log',
            data: { channel: 'console', level, arguments: args },
          })
          original.apply(globalThis.console, args)
        }
        globalThis.console[level] = wrapper
        cleanups.push(() => {
          if (globalThis.console[level] === wrapper)
            globalThis.console[level] = original
        })
      }
    }
    listen('pagehide', onPageHide)
  }

  async function startReplay(activeConfig: FeedbackClientConfig) {
    try {
      const { record: start } = await import('@rrweb/record')
      if (session.closing || session.config !== activeConfig || stopReplay)
        return
      if (screenshotCaptures) {
        session.missing.add('replay-deferred-by-capture')
        return
      }
      let firstEvent = true
      stopReplay = start({
        maskAllInputs: true,
        maskTextSelector: '[data-feedback-private],.rr-mask',
        blockSelector: '[data-feedback-ignore],[data-feedback-private],.rr-block,iframe,canvas,video',
        // rrweb 内联跨域图像会修改原 img 的 crossOrigin，可能破坏带凭据的头像等资源。
        inlineImages: false,
        inlineStylesheet: true,
        collectFonts: false,
        checkoutEveryNms: 30_000,
        emit: (event, isCheckout) => {
          if (firstEvent || isCheckout || replayChunks.length === 0)
            replayChunks.push([])
          firstEvent = false
          let payload: Record<string, unknown>
          try {
            payload = sanitizeFeedbackReplay(event)
          }
          catch {
            session.missing.add('replay-snapshot-truncated')
            return
          }
          const safe = FeedbackEvidenceInputSchema.safeParse({
            id: core.id.uuid(),
            source,
            sequence: ++sequence,
            kind: 'replay',
            timestamp: Date.now(),
            data: { event: payload },
          })
          if (!safe.success)
            return
          const bytes = new TextEncoder().encode(JSON.stringify(safe.data)).byteLength
          if (bytes > Math.min(limits().bytes, 1024 * 1024)) {
            session.missing.add('replay-snapshot-truncated')
            return
          }
          replayChunks.at(-1)?.push(safe.data)
          // 按需启动的当前页面快照属于本次准备材料，即使错误的后采窗口已结束也保留。
          appendToDraft(safe.data, bytes, event.type === 2 || event.type === 4)
          while (replayChunks.length > 2)
            replayChunks.shift()
          const count = replayChunks.reduce((total, chunk) => total + chunk.length, 0)
          const totalBytes = new TextEncoder().encode(JSON.stringify(replayChunks)).byteLength
          if (count > limits().events || totalBytes > limits().bytes) {
            replayChunks = []
            session.missing.add('replay-capacity-exceeded')
          }
        },
      }) ?? undefined
    }
    catch {
      if (!session.closing && session.config === activeConfig)
        session.missing.add('replay-recorder-unavailable')
    }
  }

  function captureKeyScreenshot(): Promise<void> {
    if (!session.config || session.config.screenshot === false || session.config.keyScreenshots !== true || session.config.maxKeyScreenshots === 0 || keyScreenshotPromise || captureTask || Date.now() - lastKeyScreenshot < (session.config.keyScreenshotThrottleMs ?? 10_000))
      return keyScreenshotPromise ?? Promise.resolve()
    const activeConfig = session.config
    lastKeyScreenshot = Date.now()
    keyScreenshotPromise = (async () => {
      try {
        const bytes = await takeScreenshot(activeConfig)
        if (session.closing || session.config !== activeConfig)
          return
        if (bytes.byteLength > session.budget.maxAttachmentBytes) {
          session.missing.add('key-screenshot-size-limit-exceeded')
          return
        }
        const image = await createFeedbackAttachment(`operation-${lastKeyScreenshot}.png`, 'image/png', bytes)
        if (session.closing || session.config !== activeConfig)
          return
        keyScreenshots.push({ attachment: image, timestamp: lastKeyScreenshot })
        keyScreenshots = keyScreenshots.filter(item => item.timestamp >= Date.now() - limits().age).slice(-Math.min(activeConfig.maxKeyScreenshots ?? 3, 5))
      }
      catch {
        if (!session.closing && session.config === activeConfig)
          session.missing.add('key-screenshot-unavailable')
      }
    })().finally(() => {
      keyScreenshotPromise = undefined
    })
    return keyScreenshotPromise
  }

  function takeScreenshot(activeConfig: FeedbackClientConfig): Promise<Uint8Array> {
    if (captureTask) {
      // 旧身份或已取消的底层任务不能复用；超时不代表 DOM 渲染已经停止。
      if (captureTask.config !== activeConfig || captureTask.controller.signal.aborted)
        return Promise.reject(new Error('Screenshot task is still stopping'))
      return bounded(captureTask.promise, activeConfig.screenshotTimeoutMs ?? 3000, captureTask.controller)
    }
    const controller = new AbortController()
    // rrweb 即使遮挡 iframe 也会观察其文档。暂停自己的记录器，避免采集 html2canvas 的克隆及样式变更。
    screenshotCaptures++
    stopReplay?.()
    stopReplay = undefined
    const captured = (async () => {
      try {
        const bytes = await (activeConfig.captureScreenshot?.({ signal: controller.signal }) ?? captureFeedbackScreenshot(controller.signal))
        controller.signal.throwIfAborted()
        return bytes
      }
      finally {
        // 等待句柄登记完成，覆盖宿主截图函数同步抛错的路径。
        await Promise.resolve()
        screenshotCaptures--
        captureTask = undefined
        if (!screenshotCaptures && !session.closing && session.config?.replay && replayRequested)
          await startReplay(session.config)
      }
    })()
    captureTask = { promise: captured, controller, config: activeConfig }
    return bounded(captured, activeConfig.screenshotTimeoutMs ?? 3000, controller)
  }

  function recordEnvironment() {
    if (!session.config)
      return
    record({
      kind: 'environment',
      data: {
        appId: session.config.appId,
        appVersion: session.config.appVersion,
        buildId: session.config.buildId,
        commit: session.config.commit,
        url: feedbackPageUrl(location.href),
        browser: navigator.userAgent,
        language: navigator.language,
        timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
        online: navigator.onLine,
        cookies: collectFeedbackCookies(document.cookie, session.config.cookieAllowlist ?? []),
      },
    })
  }
  async function captureScreenshot(attachmentId?: string, name?: string): Promise<HaiResult<void>> {
    if (!session.config || !session.draft || session.closing)
      return session.failure('NOT_INITIALIZED')
    const current = session.draft
    const activeConfig = session.config
    const previous = attachmentId
      ? current.attachments.find(item => item.id === attachmentId)
      : undefined
    const previousChecksum = previous?.checksum
    if (current.submission)
      return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
    if (attachmentId && (!previous || !previous.contentType.startsWith('image/')))
      return session.failure('INVALID_INPUT')
    if (!previous && current.attachments.length >= session.budget.maxAttachmentCount)
      return session.failure('LIMIT_EXCEEDED')
    try {
      const bytes = await takeScreenshot(activeConfig)
      if (bytes.byteLength > session.budget.maxAttachmentBytes)
        return session.failure('LIMIT_EXCEEDED')
      const previousName = previous && (/\.[^.]+$/.test(previous.name)
        ? previous.name.replace(/\.[^.]+$/, '.png')
        : `${previous.name}.png`)
      const image = await createFeedbackAttachment(name ?? previousName ?? `screenshot-${core.id.uuid()}.png`, 'image/png', bytes)
      if (session.closing || session.config !== activeConfig || session.draft !== current || current.submission || (previous && (!current.attachments.includes(previous) || previous.checksum !== previousChecksum)))
        return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
      if (current.attachments.reduce((total, item) => total + (item === previous
        ? 0
        : item.size), image.size) > session.budget.maxAttachmentsBytes) {
        return session.failure('LIMIT_EXCEEDED')
      }
      if (previous) {
        current.attachments = current.attachments.map(item => item === previous
          ? { ...image, id: previous.id }
          : item)
      }
      else if (current.attachments.length < session.budget.maxAttachmentCount) {
        current.attachments.unshift(image)
      }
      else {
        return session.failure('LIMIT_EXCEEDED')
      }
      if (!name)
        recordEnvironment()
      session.preparedPage = pageIdentity()
      schedulePersist()
      return core.ok(undefined)
    }
    catch (cause) {
      return session.failure('OPERATION_FAILED', cause)
    }
  }

  function selectEvidence(now: number) {
    buffer = buffer.filter(item => item.timestamp >= now - limits().age)
    bufferBytes = new TextEncoder().encode(JSON.stringify(buffer)).byteLength
    errorWindows = errorWindows.filter(window => window.anchor.timestamp >= now - limits().age)
    const frozenWindow = errorWindows.at(-1)
    const anchor = frozenWindow?.anchor ?? (lastError && lastError.timestamp >= now - limits().age && buffer.some(item => item.id === lastError?.id)
      ? lastError
      : undefined)
    const logs = buffer.filter(item => item.kind === 'log' || item.kind === 'error')
    const anchorIndex = anchor
      ? logs.findIndex(item => item.id === anchor.id)
      : logs.length
    const anchorIndexes = anchor
      ? logs.map((item, index) => item.kind === 'error'
          ? index
          : -1).filter(index => index >= 0).slice(-10)
      : []
    const selectedIds = new Set<string>()
    const selected = anchor
      ? (errorWindows.length
          ? errorWindows.flatMap(window => window.evidence)
          : anchorIndexes.flatMap(index => logs.slice(Math.max(0, index - limits().before), index + 1 + limits().after))).filter((item) => {
          if (selectedIds.has(item.id))
            return false
          selectedIds.add(item.id)
          return true
        }).sort((a, b) => a.sequence - b.sequence)
      : logs.slice(Math.max(0, logs.length - limits().before))
    const other = buffer.filter(item => item.kind !== 'log' && item.kind !== 'error' && !selectedIds.has(item.id)).slice(-100)
    return {
      anchor,
      selected,
      other,
      // 等待关键截图期间，活动窗口可能仍在追加证据。
      get afterCount() {
        return frozenWindow?.after ?? (anchor
          ? Math.max(0, logs.length - anchorIndex - 1)
          : 0)
      },
    }
  }

  function pauseReplay() {
    replayRequested = false
    stopReplay?.()
    stopReplay = undefined
  }

  function pause() {
    pauseReplay()
    captureTask?.controller.abort()
  }

  function requestReplay(config: FeedbackClientConfig, requested: boolean) {
    replayRequested = requested
    if (requested && config.replay && !stopReplay)
      return startReplay(config)
    return undefined
  }

  function detachListeners() {
    unsubscribeLogger?.()
    unsubscribeLogger = undefined
    stopReplay?.()
    stopReplay = undefined
    for (const cleanup of cleanups.splice(0))
      cleanup()
  }

  function reset() {
    buffer = []
    bufferBytes = 0
    lastError = undefined
    errorWindows = []
    replayChunks = []
    replayRequested = false
    keyScreenshots = []
    lastKeyScreenshot = 0
    dropped = 0
  }

  return {
    startSource() { source = `browser:${core.id.uuid()}` },
    attachListeners,
    detachListeners,
    restoreCheckpoint,
    limits,
    record,
    recordEnvironment,
    selectEvidence,
    trimDraftEvidence,
    captureScreenshot,
    requestReplay,
    pauseReplay,
    pause,
    reset,
    trimKeyScreenshots(now: number) {
      keyScreenshots = keyScreenshots.filter(item => item.timestamp >= now - limits().age)
    },
    get buffer() { return buffer },
    get dropped() { return dropped },
    get keyScreenshots() { return keyScreenshots },
    get keyScreenshotPromise() { return keyScreenshotPromise },
    get replayEvidence() { return replayChunks.flat() },
  }
}

/**
 * 获取会话内的换页标识，Hash 路由片段中的参数不进入诊断材料。
 * @example 模块内部上下文
 * ```ts
 * if (typeof location !== 'undefined') {
 *   const currentPage = pageIdentity()
 * }
 * ```
 */
export function pageIdentity() {
  return `${location.origin}${location.pathname}${location.hash.startsWith('#/')
    ? location.hash.split('?')[0]
    : ''}`
}

async function bounded<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let aborted: (() => void) | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        aborted = () => reject(new Error('Capture cancelled'))
        if (controller.signal.aborted)
          aborted()
        else controller.signal.addEventListener('abort', aborted, { once: true })
        timer = setTimeout(() => {
          reject(new Error('Capture timed out'))
          controller.abort()
        }, ms)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
    if (aborted)
      controller.signal.removeEventListener('abort', aborted)
  }
}
