import type { FeedbackLimits } from '@h-ai/api-contract/feedback'
import type { LogRecord } from '@h-ai/core'
import { core } from '@h-ai/core'

const encoder = new TextEncoder()
const privateSelector = '[data-feedback-private],[data-feedback-ignore],.rr-block,.rr-mask,iframe,canvas,video,audio,object,embed'
const blockedTags = /^(?:iframe|object|embed|script|base|meta|link)$/i
const blockedFields = /^(?:src|srcdoc|srcset|rr_src|href|xlink:href|action|formaction|poster|nonce|integrity|data|background|ping|value|placeholder|title|content|aria-label|on\w+)$/i

function safeStyle(value: string) {
  return core.sanitize.sanitizeText(value).replace(/(?:url|@import)\s*\([^)]*\)|@import\s+["'][^"']+["']|\bcontent\s*:[^;}]+/gi, '')
}

interface ReplaySegment {
  since: number
  lines: string[]
  bytes: number
}

/** 对采集及读取的回放事件都做清洗。回放 iframe 另有限制网络和脚本的 CSP。 */
export function sanitizeReplayEvent(value: unknown): unknown {
  function visit(input: unknown, depth: number): unknown {
    if (depth > 64)
      throw new Error('Replay exceeds the snapshot depth limit')
    if (Array.isArray(input))
      return input.map(item => visit(item, depth + 1))
    if (!input || typeof input !== 'object')
      return input
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        continue
      if (key === 'attributes' && item && typeof item === 'object') {
        const attributes: Record<string, unknown> = {}
        for (const [name, content] of Object.entries(item)) {
          if (blockedFields.test(name) || /^data-|^aria-/i.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name))
            continue
          attributes[name] = typeof content === 'string'
            ? safeStyle(content)
            : visit(content, depth + 1)
        }
        output[key] = attributes
      }
      else if (key === 'tagName' && typeof item === 'string') {
        const inlineLink = item === 'link' && 'attributes' in input && input.attributes && typeof input.attributes === 'object' && '_cssText' in input.attributes
        output[key] = blockedTags.test(item) && !inlineLink
          ? 'div'
          : item
      }
      else if ((key === 'text' || key === 'textContent') && typeof item === 'string') {
        output[key] = 'isStyle' in input && input.isStyle === true
          ? safeStyle(item)
          : item.replace(/\S/g, '*')
      }
      else if (key === 'href') {
        // 元数据用于确定视口大小，页面地址不参与回放。
        output[key] = ''
      }
      else {
        output[key] = visit(item, depth + 1)
      }
    }
    return output
  }
  return visit(value, 0)
}

function jsonFile(name: string, lines: string[]) {
  return lines.length
    ? new File([
        '[',
        lines.join(','),
        ']',
      ], name, { type: 'application/json' })
    : undefined
}

/** 由已登录的反馈弹窗拥有。缓冲只在当前页面内存中保留。 */
export function startBrowserFeedbackCapture({ limits, capture }: FeedbackLimits) {
  const windowMs = capture.windowSeconds * 1000
  const maxLogBytes = Math.min(limits.maxFileBytes, capture.maxLogBytes)
  const maxReplayBytes = Math.min(limits.maxFileBytes, capture.maxReplayBytes)
  const logs: Array<{ time: number, json: string, bytes: number }> = []
  const segments: ReplaySegment[] = []
  let active: ReplaySegment | undefined
  let meta: string | undefined
  let logBytes = 2
  let replayBytes = 2
  let replayCount = 0
  let closed = false
  let stopReplay: (() => void) | undefined

  function trimLogs(now: number) {
    while (logs[0] && (logs[0].time < now - windowMs
      || logs.length > capture.maxLogEntries || logBytes > maxLogBytes)) {
      logBytes -= logs.shift()!.bytes
    }
  }

  function recordLog(level: LogRecord['level'], message: string) {
    const time = Date.now()
    const json = JSON.stringify({
      timestamp: time,
      level,
      message: core.sanitize.sanitizeText(message.slice(0, 4096)).slice(0, 2048),
    })
    const bytes = encoder.encode(json).byteLength + 1
    logs.push({ time, json, bytes })
    logBytes += bytes
    trimLogs(time)
  }

  function trimReplay(now: number) {
    while (segments[0] && (segments[0].since < now - windowMs
      || replayBytes > maxReplayBytes || replayCount > capture.maxReplayEvents)) {
      const removed = segments.shift()!
      replayBytes -= removed.bytes
      replayCount -= removed.lines.length
      if (active === removed)
        active = undefined
    }
  }

  function recordReplay(event: { type: number }) {
    const time = Date.now()
    try {
      const json = JSON.stringify(sanitizeReplayEvent(event))
      const bytes = encoder.encode(json).byteLength + 1
      if (event.type === 4) {
        meta = bytes <= 4096
          ? json
          : undefined
        return
      }
      if (event.type === 2) {
        active = { since: time, lines: [], bytes: 0 }
        if (meta) {
          active.lines.push(meta)
          active.bytes = encoder.encode(meta).byteLength + 1
          replayBytes += active.bytes
          replayCount++
        }
        segments.push(active)
      }
      if (active) {
        active.lines.push(json)
        active.bytes += bytes
        replayBytes += bytes
        replayCount++
      }
      trimReplay(time)
    }
    catch {
      // 当前快照不可重建时，从下一次完整快照继续收集。
      if (event.type === 2)
        active = undefined
    }
  }

  const stopLogs = core.logger.observe(record => recordLog(record.level, record.message))
  const onerror = (event: ErrorEvent) => recordLog('error', event.message)
  const onrejection = (event: PromiseRejectionEvent) => recordLog('error', event.reason instanceof Error
    ? event.reason.message
    : 'Unhandled promise rejection')
  window.addEventListener('error', onerror)
  window.addEventListener('unhandledrejection', onrejection)
  void import('@rrweb/record').then(({ record }) => {
    if (!closed) {
      stopReplay = record({
        maskAllInputs: true,
        maskTextSelector: '*',
        blockSelector: privateSelector,
        inlineImages: false,
        inlineStylesheet: true,
        collectFonts: false,
        checkoutEveryNms: Math.min(30_000, windowMs / 2),
        emit: recordReplay,
      })
    }
  }).catch(() => { /* 录制器不可用时仍可发送反馈和其他材料。 */ })

  return {
    snapshot() {
      trimLogs(Date.now())
      trimReplay(Date.now())
      const replay = segments.flatMap(segment => segment.lines)
      return {
        browserLogs: jsonFile('browser-logs.json', logs.map(line => line.json)),
        replay: replay.length > 1
          ? jsonFile('operation-replay.json', replay)
          : undefined,
      }
    },
    close() {
      closed = true
      stopLogs()
      stopReplay?.()
      window.removeEventListener('error', onerror)
      window.removeEventListener('unhandledrejection', onrejection)
      logs.length = 0
      segments.length = 0
      active = undefined
      meta = undefined
    },
  }
}
