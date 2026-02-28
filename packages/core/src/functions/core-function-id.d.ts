/**
 * =============================================================================
 * @h-ai/core - ID 生成器
 * =============================================================================
 * 基于 nanoid 的 ID 生成工具。
 *
 * @example
 * ```ts
 * import { id } from '@h-ai/core'
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
/**
 * ID 生成工具对象。
 *
 * @example
 * ```ts
 * const id1 = id.generate()
 * const id2 = id.short()
 * ```
 */
export declare const id: {
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
  generate: (length?: number) => string
  /**
   * 生成短 ID（10 字符）。
   *
   * @example
   * ```ts
   * const shortId = core.id.short()
   * ```
   */
  short: () => string
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
  withPrefix: (prefix: string, length?: number) => string
  /**
   * 生成 Trace ID。
   *
   * @example
   * ```ts
   * const traceId = core.id.trace()
   * ```
   */
  trace: () => string
  /**
   * 生成 Request ID。
   *
   * @example
   * ```ts
   * const requestId = core.id.request()
   * ```
   */
  request: () => string
  /**
   * 生成 UUID v4。
   *
   * @example
   * ```ts
   * const uuid = core.id.uuid()
   * ```
   */
  uuid: () => string
  /**
   * 验证是否为有效的 UUID v4。
   *
   * @example
   * ```ts
   * core.id.isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')
   * ```
   */
  isValidUUID: (uuid: string) => boolean
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
  isValidNanoId: (str: string, length?: number) => boolean
}
// # sourceMappingURL=core-function-id.d.ts.map
