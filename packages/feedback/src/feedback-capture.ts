import type { FeedbackEvidenceInput } from '@h-ai/api-contract/feedback'
import type { LogRecord } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { arch, platform, release, totalmem } from 'node:os'
import process from 'node:process'
import { FeedbackEvidenceInputSchema } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { feedbackTextEquals, readFeedbackJson } from './feedback-repository.js'
import { sanitizeFeedbackValue } from './feedback-sanitize.js'

/**
 * 绑定可信身份的内部日志副本，字节数用于有界缓存。
 * @example 模块内部上下文
 * ```ts
 * const record: CapturedRecord = { event: { id: 'entry', source: 'server:test', sequence: 1, kind: 'log', timestamp: 1, data: {} }, scopeId: 'tenant', userId: 'user', bytes: 1 }
 * void record.bytes
 * ```
 */
interface CapturedRecord { event: FeedbackEvidenceInput, scopeId: string, userId: string, bytes: number, buffered?: boolean }

/**
 * Node 现场观察器，只保留有可信身份上下文的有界日志。
 * @example 模块内部上下文
 * ```ts
 * function startAfterDependencies() {
 *   const capture = createFeedbackCapture('orders', [], {})
 *   return capture.close()
 * }
 * ```
 */
export function createFeedbackCapture(appId: string, envAllowlist: string[], service: { appVersion?: string, buildId?: string, commit?: string }) {
  const source = `server:${randomUUID()}`
  const buffer: CapturedRecord[] = []
  const pending = new Map<string, CapturedRecord>()
  const windows = new Map<string, { errorId: string, after: number, deadline: number }>()
  const losses = new Map<string, CapturedRecord>()
  let capacityLoss: FeedbackEvidenceInput | undefined
  let sequence = 0
  let totalBytes = 0
  let pendingBytes = 0
  let failures = 0
  let retryAfter = 0
  let stopped = false
  let flushing: Promise<void> | null = null

  function removePending(key: string) {
    const previous = pending.get(key)
    if (previous)
      pendingBytes -= previous.bytes
    pending.delete(key)
  }

  async function flush(force = false): Promise<void> {
    if (flushing)
      return flushing
    if (!force && retryAfter > Date.now())
      return
    flushing = core.context.run({ suppressLogObservers: true }, async () => {
      // 每批不超过 32 行/256 KiB，最多 512 个绑定值；兼容 SQLite 并减少共享连接往返。
      const snapshot = [...pending]
      let offset = 0
      while (offset < snapshot.length) {
        const batch: Array<[string, CapturedRecord]> = []
        let bytes = 0
        while (offset < snapshot.length && batch.length < 32) {
          const [key, item] = snapshot[offset]!
          if (batch.length && bytes + item.bytes > 256 * 1024)
            break
          offset++
          if (item.event.timestamp < Date.now() - 5 * 60000) {
            removePending(key)
            rememberLoss(item, 'server_pending_evidence_expired')
            continue
          }
          batch.push([key, item])
          bytes += item.bytes
        }
        if (!batch.length)
          continue
        const current = await reldb.sql.query<{ id: string }>(`SELECT id FROM hai_feedback_evidence WHERE id IN (${batch.map(() => '?').join(',')})`, batch.map(([key]) => key))
        if (!current.success) {
          for (const [, item] of batch) rememberLoss(item, 'server_temporary_evidence_write_failed')
          retryAfter = Date.now() + Math.min(30000, 250 * 2 ** Math.min(++failures, 7))
          return
        }
        const existing = new Set(current.data.map(row => row.id))
        const additions = batch.filter(([key]) => !existing.has(key))
        if (additions.length) {
          const params = additions.flatMap(([key, item]) => {
            const event = item.event
            return [key, null, item.scopeId, item.userId, appId, event.source, event.sequence, event.kind, event.timestamp, event.requestId ?? null, event.errorId ?? null, 1, item.bytes, event.timestamp + 5 * 60000, JSON.stringify(event)]
          })
          const duplicate = reldb.config?.type === 'mysql' ? 'ON DUPLICATE KEY UPDATE id = id' : 'ON CONFLICT (id) DO NOTHING'
          const result = await reldb.sql.execute(`INSERT INTO hai_feedback_evidence (id, report_id, scope_id, user_id, app_id, source, sequence, kind, timestamp, request_id, error_id, revision, bytes, expires_at, payload) VALUES ${additions.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')} ${duplicate}`, params)
          if (!result.success) {
            for (const [, item] of batch) rememberLoss(item, 'server_temporary_evidence_write_failed')
            retryAfter = Date.now() + Math.min(30000, 250 * 2 ** Math.min(++failures, 7))
            return
          }
        }
        for (const [key] of batch) removePending(key)
      }
      failures = 0
      retryAfter = 0
    }).finally(() => {
      flushing = null
    })
    return flushing
  }

  function rememberLoss(item: Pick<CapturedRecord, 'scopeId' | 'userId'> & { event?: FeedbackEvidenceInput, requestId?: string }, reason: string) {
    for (const [key, previous] of losses) {
      if (previous.event.timestamp < Date.now() - 5 * 60000) {
        losses.delete(key)
        removePending(createHash('sha256').update(`${source}:${previous.event.sequence}`).digest('hex'))
      }
    }
    if (capacityLoss && capacityLoss.timestamp < Date.now() - 5 * 60000)
      capacityLoss = undefined
    const requestId = item.requestId ?? item.event?.requestId
    const key = JSON.stringify([item.scopeId, item.userId, requestId, reason])
    if (losses.has(key))
      return
    const event: FeedbackEvidenceInput = { id: randomUUID(), source, sequence: sequence++, kind: 'missing', timestamp: Date.now(), requestId, data: { source: 'server_logs' }, missingReason: reason }
    if (losses.size >= 200) {
      // 元数据容量耗尽时保留一个不含身份信息的稳定降级标记。
      capacityLoss ??= { ...event, requestId: undefined, missingReason: 'server_capture_capacity_exceeded' }
      return
    }
    const entry = { event, scopeId: item.scopeId, userId: item.userId, bytes: Buffer.byteLength(JSON.stringify(event)) }
    losses.set(key, entry)
    if (pendingBytes + entry.bytes <= 8 * 1024 * 1024) {
      pending.set(createHash('sha256').update(`${source}:${event.sequence}`).digest('hex'), entry)
      pendingBytes += entry.bytes
    }
    else {
      capacityLoss ??= { ...event, requestId: undefined, missingReason: 'server_capture_capacity_exceeded' }
    }
  }

  function pin(item: CapturedRecord, errorId: string) {
    if (item.event.kind === 'error')
      item.event.errorId = item.event.id
    else item.event.errorId ??= errorId
    const bytes = Buffer.byteLength(JSON.stringify(item.event))
    if (item.buffered)
      totalBytes += bytes - item.bytes
    item.bytes = bytes
    const key = createHash('sha256').update(`${source}:${item.event.sequence}`).digest('hex')
    if (pending.has(key))
      return
    if (pending.size >= 3000) {
      rememberLoss(item, 'server_pending_evidence_overflow')
      return
    }
    // 给缺失标记预留空间，正常日志不能挤占说明材料的预算。
    if (pendingBytes + item.bytes > 8 * 1024 * 1024 - 128 * 1024) {
      rememberLoss(item, 'server_pending_evidence_bytes_exceeded')
      return
    }
    // 日志首次归属后不再改变 payload；重叠窗口复用同一条临时证据。
    const event = { ...item.event }
    pending.set(key, { ...item, event })
    pendingBytes += item.bytes
  }

  function observe(record: LogRecord) {
    if (stopped || record.context.module === 'feedback')
      return
    const { scopeId, userId, requestId } = record.context
    if (typeof scopeId !== 'string' || typeof userId !== 'string' || typeof requestId !== 'string')
      return
    const value = sanitizeFeedbackValue({ message: record.message, level: record.level, context: record.context })
    const event = FeedbackEvidenceInputSchema.parse({ id: randomUUID(), source, sequence: sequence++, kind: record.level === 'error' || record.level === 'fatal' ? 'error' : 'log', timestamp: record.timestamp, requestId, data: value })
    const bytes = Buffer.byteLength(JSON.stringify(event))
    if (bytes > 65536) {
      rememberLoss({ scopeId, userId, requestId }, 'server_log_record_too_large')
      return
    }
    const item: CapturedRecord = { event, scopeId, userId, bytes }
    const key = JSON.stringify([scopeId, userId, requestId])
    const previous = windows.get(key)
    if (previous) {
      if (previous.deadline >= Date.now() && previous.after < 100) {
        pin(item, previous.errorId)
        previous.after++
      }
      else {
        windows.delete(key)
      }
    }
    if (event.kind === 'error') {
      for (const [windowKey, window] of windows) {
        if (window.deadline < Date.now())
          windows.delete(windowKey)
      }
      for (const before of buffer.filter(entry => entry.scopeId === scopeId && entry.userId === userId && entry.event.requestId === requestId).slice(-100)) pin(before, event.id)
      pin(item, event.id)
      if (windows.has(key) || windows.size < 100)
        windows.set(key, { errorId: event.id, after: 0, deadline: Date.now() + 30000 })
      else rememberLoss(item, 'server_error_window_overflow')
    }
    buffer.push(item)
    item.buffered = true
    totalBytes += item.bytes
    while (buffer.length > 10000 || totalBytes > 16 * 1024 * 1024 || (buffer[0]?.event.timestamp ?? Date.now()) < Date.now() - 5 * 60000) {
      const removed = buffer.shift()
      if (removed)
        removed.buffered = false
      totalBytes -= removed?.bytes ?? 0
      if (removed && removed.event.timestamp >= Date.now() - 5 * 60000)
        rememberLoss(removed, 'server_log_buffer_overflow')
    }
  }

  const stop = core.logger.observe(observe)
  const timer = setInterval(() => {
    void flush().catch(() => undefined)
  }, 250)
  timer.unref()
  return {
    async collect(scopeId: string, userId: string, anchor: number) {
      await flush(true)
      const params: unknown[] = []
      const identity = `${feedbackTextEquals('app_id', appId, params)} AND ${feedbackTextEquals('scope_id', scopeId, params)} AND ${feedbackTextEquals('user_id', userId, params)}`
      params.push(anchor - 5 * 60000, anchor + 30000)
      const persisted = await reldb.sql.query<{ payload: unknown }>(`SELECT payload FROM hai_feedback_evidence WHERE report_id IS NULL AND ${identity} AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC, source DESC, sequence DESC LIMIT 1001`, params)
      if (!persisted.success)
        rememberLoss({ scopeId, userId }, 'server_temporary_evidence_read_failed')
      else if (persisted.data.length > 1000)
        rememberLoss({ scopeId, userId }, 'server_evidence_truncated')
      const events = new Map<string, FeedbackEvidenceInput>()
      const saved = persisted.success
        ? persisted.data.slice(0, 1000).reverse().flatMap((row) => {
            try {
              const parsed = FeedbackEvidenceInputSchema.safeParse(readFeedbackJson(row.payload))
              if (parsed.success)
                return [parsed.data]
            }
            catch {
              // 临时记录损坏时保留其他可用证据，缺失标记不包含原始数据库内容。
            }
            rememberLoss({ scopeId, userId }, 'server_temporary_evidence_invalid')
            return []
          })
        : []
      for (const event of saved) {
        const key = `${event.source}:${event.sequence}`
        if (!events.has(key))
          events.set(key, event.kind === 'error' ? { ...event, errorId: event.id } : event)
      }
      const pinnedRequests = new Set([...events.values()].filter(item => item.errorId).map(item => item.requestId))
      const local = buffer.filter(item => item.scopeId === scopeId && item.userId === userId && item.event.timestamp >= anchor - 5 * 60000 && item.event.timestamp <= anchor + 30000)
      const before = local.filter(item => item.event.timestamp <= anchor).slice(-100)
      const after = local.filter(item => item.event.timestamp > anchor).slice(0, 100)
      for (const item of [...before, ...after]) {
        if (!pinnedRequests.has(item.event.requestId))
          events.set(`${item.event.source}:${item.event.sequence}`, item.event)
      }
      for (const [key, item] of losses) {
        if (item.event.timestamp < Date.now() - 5 * 60000) {
          losses.delete(key)
          continue
        }
        if (item.scopeId === scopeId && item.userId === userId && item.event.timestamp >= anchor - 5 * 60000)
          events.set(`${item.event.source}:${item.event.sequence}`, item.event)
      }
      if (capacityLoss && capacityLoss.timestamp >= anchor - 5 * 60000)
        events.set(`${capacityLoss.source}:${capacityLoss.sequence}`, capacityLoss)
      if (events.size > 1000) {
        rememberLoss({ scopeId, userId }, 'server_evidence_truncated')
        const marker = losses.get(JSON.stringify([scopeId, userId, undefined, 'server_evidence_truncated']))?.event
        if (marker)
          events.set(`${marker.source}:${marker.sequence}`, marker)
      }
      const missing = [...events.values()].filter(item => item.kind === 'missing').slice(-1000)
      const logs = [...events.values()].filter(item => item.kind !== 'missing').sort((a, b) => a.timestamp - b.timestamp)
      const allowance = 1000 - missing.length
      return [...allowance > 0 ? logs.slice(-allowance) : [], ...missing].sort((a, b) => a.timestamp - b.timestamp)
    },
    environment(): FeedbackEvidenceInput {
      const env = Object.fromEntries(envAllowlist.filter(key => !core.sanitize.defaultSensitiveKeyRegex.test(key.replace(/([a-z])([A-Z])/g, '$1_$2'))).map(key => [key, process.env[key] ?? null]))
      return FeedbackEvidenceInputSchema.parse({ id: randomUUID(), source, sequence: sequence++, kind: 'environment', timestamp: Date.now(), data: sanitizeFeedbackValue({ appId, service, os: { platform: platform(), release: release(), arch: arch() }, runtime: { name: 'node', version: process.version, uptimeSeconds: Math.floor(process.uptime()), memoryBytes: process.memoryUsage().rss, totalMemoryBytes: totalmem() }, environment: env }) })
    },
    async close() {
      stopped = true
      stop()
      clearInterval(timer)
      await flush(true)
    },
  }
}

/**
 * 内部现场采集生命周期句柄。
 * @example 模块内部上下文
 * ```ts
 * function stopCapture(capture: FeedbackCapture) { return capture.close() }
 * ```
 */
export type FeedbackCapture = ReturnType<typeof createFeedbackCapture>
