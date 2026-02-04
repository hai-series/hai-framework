/**
 * =============================================================================
 * @hai/core - 类型检查工具
 * =============================================================================
 */

/**
 * 检查值是否已定义（非 null 和 undefined）。
 *
 * @example
 * ```ts
 * typeUtils.isDefined(0) // true
 * ```
 */
function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

/**
 * 检查值是否为纯对象（排除数组）。
 *
 * @example
 * ```ts
 * typeUtils.isObject({}) // true
 * ```
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 检查值是否为函数。
 *
 * @example
 * ```ts
 * typeUtils.isFunction(() => {}) // true
 * ```
 */
function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

/**
 * 检查值是否为 Promise。
 *
 * @example
 * ```ts
 * typeUtils.isPromise(Promise.resolve()) // true
 * ```
 */
function isPromise<T>(value: unknown): value is Promise<T> {
  if (value instanceof Promise) {
    return true
  }
  if (!isObject(value)) {
    return false
  }
  return isFunction((value as Record<string, unknown>).then)
}

/**
 * 检查值是否为字符串。
 *
 * @example
 * ```ts
 * typeUtils.isString('a') // true
 * ```
 */
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * 检查值是否为数字。
 *
 * @example
 * ```ts
 * typeUtils.isNumber(1) // true
 * ```
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * 检查值是否为布尔值。
 *
 * @example
 * ```ts
 * typeUtils.isBoolean(false) // true
 * ```
 */
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * 检查值是否为数组。
 *
 * @example
 * ```ts
 * typeUtils.isArray([1, 2]) // true
 * ```
 */
function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value)
}

/**
 * 类型检查工具对象。
 *
 * @example
 * ```ts
 * typeUtils.isDefined('x')
 * ```
 */
export const typeUtils = {
  isDefined,
  isObject,
  isFunction,
  isPromise,
  isString,
  isNumber,
  isBoolean,
  isArray,
}
