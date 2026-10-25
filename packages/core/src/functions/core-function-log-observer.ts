/** 结构化日志观察点，无数据库/传输依赖，不改变正常日志输出。 */
import type { LogContext, LogObserver, LogRecord } from '../core-types.js'
import { sanitize } from '../utils/core-util-sanitize.js'

const observers = new Set<LogObserver>()
let emitting = false

/**
 * 模块内部：订阅者负责有界缓冲，返回句柄解除所有引用。
 * @example 模块内部上下文
 * ```ts
 * const unsubscribe = observeLogs(record => { const level = record.level })
 * unsubscribe()
 * ```
 */
export function observeLogs(observer: LogObserver): () => void {
  observers.add(observer)
  return () => {
    observers.delete(observer)
  }
}

/**
 * 模块内部：仅向观察者发送脱敏副本，异常和重入不影响日志或业务。
 * @example 模块内部上下文
 * ```ts
 * emitLogRecord({ timestamp: 1, level: 'info', message: 'Ready', context: {} })
 * ```
 */
export function emitLogRecord(record: LogRecord): void {
  if (emitting || observers.size === 0)
    return
  emitting = true
  try {
    for (const observer of observers) {
      try {
        const result: unknown = observer({ ...record, context: sanitize.sanitizeSensitiveFields(record.context) })
        if (result instanceof Promise)
          void result.catch(() => {})
      }
      catch {
        // 不记录观察者自身异常，防止采集通道递归。
      }
    }
  }
  finally {
    emitting = false
  }
}

/**
 * 默认字段与自定义路径脱敏使用同一份副本，观察者不能绕过 stdout 的策略。
 * @example 模块内部上下文
 * ```ts
 * const safe = sanitizeLogFields({ customer: { email: 'private@example.com' } }, ['customer.email'])
 * ```
 */
export function sanitizeLogFields(value: LogContext, paths: readonly string[]): LogContext {
  const result = sanitize.sanitizeSensitiveFields(value)
  const seen = new WeakSet<object>()
  const clean = (record: Record<string, unknown>) => {
    if (seen.has(record))
      return
    seen.add(record)
    for (const [key, item] of Object.entries(record)) {
      if (typeof item === 'string')
        record[key] = sanitize.sanitizeText(item)
      else if (item && typeof item === 'object' && (Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype))
        clean(item as Record<string, unknown>)
    }
  }
  clean(result)
  if (!result.traceId && result.requestId)
    result.traceId = result.requestId
  for (const path of paths)
    redactPath(result, path.match(/\*|[^.[\]"']+/g) ?? [])
  return result
}

function redactPath(value: unknown, segments: string[]): void {
  if (!value || typeof value !== 'object' || segments.length === 0)
    return
  const record = value as Record<string, unknown>
  const [segment, ...rest] = segments
  for (const key of segment === '*' ? Object.keys(record) : [segment!]) {
    if (!Object.hasOwn(record, key) || ['__proto__', 'constructor', 'prototype'].includes(key))
      continue
    if (rest.length === 0)
      record[key] = '[REDACTED]'
    else redactPath(record[key], rest)
  }
}
