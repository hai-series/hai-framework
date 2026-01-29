/**
 * =============================================================================
 * @hai/core - 类型检查工具
 * =============================================================================
 */

/**
 * 检查值是否已定义（非 null 和 undefined）
 */
export function isDefined<T>(value: T | undefined | null): value is T {
    return value !== undefined && value !== null
}

/**
 * 检查值是否为纯对象（排除数组）
 */
export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 检查值是否为函数
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === 'function'
}

/**
 * 检查值是否为 Promise
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
    return value instanceof Promise || (isObject(value) && isFunction((value as any).then))
}

/**
 * 检查值是否为字符串
 */
export function isString(value: unknown): value is string {
    return typeof value === 'string'
}

/**
 * 检查值是否为数字
 */
export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * 检查值是否为布尔值
 */
export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean'
}

/**
 * 检查值是否为数组
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
    return Array.isArray(value)
}
