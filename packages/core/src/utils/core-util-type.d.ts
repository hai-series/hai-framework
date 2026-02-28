/**
 * =============================================================================
 * @h-ai/core - 类型检查工具
 * =============================================================================
 */
/**
 * 检查值是否已定义（非 null 和 undefined）。
 * @param value - 待检查值
 * @returns 是否已定义
 *
 * @example
 * ```ts
 * typeUtils.isDefined(0) // true
 * ```
 */
declare function isDefined<T>(value: T | undefined | null): value is T
/**
 * 检查值是否为纯对象（排除数组）。
 * @param value - 待检查值
 * @returns 是否为纯对象
 *
 * @example
 * ```ts
 * typeUtils.isObject({}) // true
 * ```
 */
declare function isObject(value: unknown): value is Record<string, unknown>
/**
 * 检查值是否为函数。
 * @param value - 待检查值
 * @returns 是否为函数
 *
 * @example
 * ```ts
 * typeUtils.isFunction(() => {}) // true
 * ```
 */
declare function isFunction(value: unknown): value is (...args: unknown[]) => unknown
/**
 * 检查值是否为 Promise。
 * @param value - 待检查值
 * @returns 是否为 Promise
 *
 * @example
 * ```ts
 * typeUtils.isPromise(Promise.resolve()) // true
 * ```
 */
declare function isPromise<T>(value: unknown): value is Promise<T>
/**
 * 检查值是否为字符串。
 * @param value - 待检查值
 * @returns 是否为字符串
 *
 * @example
 * ```ts
 * typeUtils.isString('a') // true
 * ```
 */
declare function isString(value: unknown): value is string
/**
 * 检查值是否为数字。
 * @param value - 待检查值
 * @returns 是否为数字（排除 NaN）
 *
 * @example
 * ```ts
 * typeUtils.isNumber(1) // true
 * ```
 */
declare function isNumber(value: unknown): value is number
/**
 * 检查值是否为布尔值。
 * @param value - 待检查值
 * @returns 是否为布尔值
 *
 * @example
 * ```ts
 * typeUtils.isBoolean(false) // true
 * ```
 */
declare function isBoolean(value: unknown): value is boolean
/**
 * 检查值是否为数组。
 * @param value - 待检查值
 * @returns 是否为数组
 *
 * @example
 * ```ts
 * typeUtils.isArray([1, 2]) // true
 * ```
 */
declare function isArray<T = unknown>(value: unknown): value is T[]
/**
 * 类型检查工具对象。
 *
 * @example
 * ```ts
 * typeUtils.isDefined('x')
 * ```
 */
export declare const typeUtils: {
  isDefined: typeof isDefined
  isObject: typeof isObject
  isFunction: typeof isFunction
  isPromise: typeof isPromise
  isString: typeof isString
  isNumber: typeof isNumber
  isBoolean: typeof isBoolean
  isArray: typeof isArray
}
export {}
// # sourceMappingURL=core-util-type.d.ts.map
