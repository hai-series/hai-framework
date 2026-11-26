import type { FeedbackAttachmentInput, FeedbackContext, FeedbackLimits } from '@h-ai/api-contract/feedback'
import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'

interface RequestLog {
  timestamp: number
  scopeId: string
  userId: string
  requestId: string
  line: string
  bytes: number
}

/** 在当前进程保留有界请求日志，提交时只取匹配身份的快照。 */
export function startFeedbackLogCapture({ limits, capture }: FeedbackLimits) {
  const rows: RequestLog[] = []
  let totalBytes = 0
  const windowMs = capture.windowSeconds * 1000
  const maxLogBytes = Math.min(limits.maxFileBytes, capture.maxLogBytes)
  const trim = (now: number) => {
    let remove = 0
    while (rows[remove] && (rows[remove]!.timestamp < now - windowMs
      || rows.length - remove > capture.maxLogEntries * 5
      || totalBytes > maxLogBytes * 8)) {
      totalBytes -= rows[remove]!.bytes
      remove++
    }
    if (remove)
      rows.splice(0, remove)
  }

  const stop = core.logger.observe((record) => {
    // 只采用请求实际上下文，不采用日志调用方临时附加的标识。
    const { scopeId, userId, requestId } = core.context.get()
    if (!scopeId || !userId || !requestId || scopeId.length > 128 || userId.length > 128 || requestId.length > 128)
      return
    const timestamp = Date.now()
    const line = JSON.stringify({
      timestamp,
      level: record.level,
      requestId,
      message: core.sanitize.sanitizeText(record.message.slice(0, 4096)).slice(0, 2048),
    })
    const bytes = Buffer.byteLength(line) + 1
    rows.push({
      timestamp,
      scopeId,
      userId,
      requestId,
      line,
      bytes,
    })
    totalBytes += bytes
    trim(timestamp)
  })

  return {
    snapshot(context: FeedbackContext, remainingBytes: number): FeedbackAttachmentInput | undefined {
      trim(Date.now())
      const budget = Math.min(remainingBytes, maxLogBytes)
      const currentRequest = core.context.get().requestId
      const lines: string[] = []
      let bytes = 2
      for (let index = rows.length - 1; index >= 0 && lines.length < capture.maxLogEntries; index--) {
        const row = rows[index]!
        if (row.scopeId !== context.scopeId || row.userId !== context.userId || row.requestId === currentRequest)
          continue
        if (bytes + row.bytes > budget)
          break
        lines.push(row.line)
        bytes += row.bytes
      }
      if (!lines.length)
        return undefined
      return {
        name: 'server-logs.json',
        contentType: 'application/json',
        dataBase64: Buffer.from(`[${lines.reverse().join(',')}]`).toString('base64'),
      }
    },
    close() {
      stop()
      rows.length = 0
      totalBytes = 0
    },
  }
}
