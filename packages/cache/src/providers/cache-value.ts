import type { CacheValue } from '../cache-types.js'

/**
 * 缓存值序列化失败，Provider 将此错误转换为 SERIALIZATION_FAILED。
 * @example 模块内部上下文
 * ```ts
 * const unavailable = new CacheSerializationError('Cache value has no JSON representation')
 * const isSerializationFailure = unavailable instanceof CacheSerializationError
 * ```
 */
export class CacheSerializationError extends Error {}

/**
 * 获取 JSON 快照，无法得到 JSON 文本时抛出 CacheSerializationError。
 * @example 模块内部上下文
 * ```ts
 * const snapshot = serializeCacheValue({ status: 'queued' })
 * ```
 */
export function serializeCacheValue(value: CacheValue): string {
  let snapshot: string | undefined
  try {
    snapshot = JSON.stringify(value)
  }
  catch (cause) {
    throw new CacheSerializationError('Cache value could not be serialized as JSON', { cause })
  }
  if (snapshot === undefined)
    throw new CacheSerializationError('Cache value has no JSON representation')
  return snapshot
}
