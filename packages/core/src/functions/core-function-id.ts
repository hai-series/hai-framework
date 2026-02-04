/**
 * =============================================================================
 * @hai/core - ID 生成器
 * =============================================================================
 * 基于 nanoid 的 ID 生成工具。
 *
 * @example
 * ```ts
 * import { id } from '@hai/core'
 *
 * // 生成 ID
 * const myId = id.generate()
 * const shortId = id.short()
 * const traceId = id.trace()
 * const uuid = id.uuid()
 *
 * // 验证
 * id.isValidUUID(uuid) // true
 * id.isValidNanoId(myId) // true
 * ```
 * =============================================================================
 */

import { nanoid } from 'nanoid'

// =============================================================================
// 常量
// =============================================================================

/** 默认 ID 长度 */
const DEFAULT_LENGTH = 21

/** 短 ID 长度 */
const SHORT_LENGTH = 10

/** UUID v4 正则 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// =============================================================================
// ID 生成
// =============================================================================

/**
 * 生成 UUID v4。
 *
 * @returns UUID v4 字符串
 *
 * @example
 * ```ts
 * const uuid = id.uuid()
 * ```
 */
function generateUUID(): string {
  // 优先使用 Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // 回退到手动生成
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  }
  else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  // 设置版本 (v4) 和变体
  bytes[6] = (bytes[6] & 0x0F) | 0x40
  bytes[8] = (bytes[8] & 0x3F) | 0x80

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * ID 生成工具对象。
 *
 * @example
 * ```ts
 * const id1 = id.generate()
 * const id2 = id.short()
 * ```
 */
export const id = {
  /**
   * 生成标准 nanoid（默认 21 字符）。
   *
   * @param length - ID 长度
   * @returns nanoid 字符串
   *
   * @example
   * ```ts
   * const id = core.id.generate(16)
   * ```
   */
  generate(length: number = DEFAULT_LENGTH): string {
    return nanoid(length)
  },

  /**
   * 生成短 ID（10 字符）。
   *
   * @example
   * ```ts
   * const shortId = core.id.short()
   * ```
   */
  short(): string {
    return nanoid(SHORT_LENGTH)
  },

  /**
   * 生成带前缀的 ID。
   *
   * @param prefix - 前缀
   * @param length - ID 长度
   *
   * @example
   * ```ts
   * const userId = core.id.withPrefix('user_')
   * ```
   */
  withPrefix(prefix: string, length: number = DEFAULT_LENGTH): string {
    return `${prefix}${nanoid(length)}`
  },

  /**
   * 生成 Trace ID。
   *
   * @example
   * ```ts
   * const traceId = core.id.trace()
   * ```
   */
  trace(): string {
    return `trace-${nanoid()}`
  },

  /**
   * 生成 Request ID。
   *
   * @example
   * ```ts
   * const requestId = core.id.request()
   * ```
   */
  request(): string {
    return `req-${nanoid()}`
  },

  /**
   * 生成 UUID v4。
   *
   * @example
   * ```ts
   * const uuid = core.id.uuid()
   * ```
   */
  uuid(): string {
    return generateUUID()
  },

  /**
   * 验证是否为有效的 UUID v4。
   *
   * @example
   * ```ts
   * core.id.isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')
   * ```
   */
  isValidUUID(uuid: string): boolean {
    return UUID_REGEX.test(uuid)
  },

  /**
   * 验证是否为有效的 nanoid。
   *
   * @param str - 待验证字符串
   * @param length - 期望长度
   *
   * @example
   * ```ts
   * core.id.isValidNanoId('abc', 3)
   * ```
   */
  isValidNanoId(str: string, length: number = DEFAULT_LENGTH): boolean {
    const regex = new RegExp(`^[A-Za-z0-9_-]{${length}}$`)
    return regex.test(str)
  },
}
