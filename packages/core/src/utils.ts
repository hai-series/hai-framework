/**
 * =============================================================================
 * @hai/core - 工具函数
 * =============================================================================
 * 通用工具函数集合
 * =============================================================================
 */

import { nanoid } from 'nanoid'

// =============================================================================
// ID 生成
// =============================================================================

/**
 * 生成唯一 ID
 * @param size - ID 长度，默认 21
 */
export function generateId(size = 21): string {
    return nanoid(size)
}

/**
 * 生成短 ID
 * @param size - ID 长度，默认 8
 */
export function generateShortId(size = 8): string {
    return nanoid(size)
}

/**
 * 生成追踪 ID
 */
export function generateTraceId(): string {
    return `trace_${nanoid(16)}`
}

/**
 * 生成请求 ID
 */
export function generateRequestId(): string {
    return `req_${nanoid(12)}`
}

// =============================================================================
// 类型工具
// =============================================================================

/**
 * 检查值是否为非空
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined
}

/**
 * 检查值是否为对象
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
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
    return (
        value instanceof Promise
        || (isObject(value) && isFunction((value as { then?: unknown }).then))
    )
}

// =============================================================================
// 对象工具
// =============================================================================

/**
 * 深拷贝对象
 */
export function deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value
    }

    if (value instanceof Date) {
        return new Date(value.getTime()) as unknown as T
    }

    if (Array.isArray(value)) {
        return value.map(item => deepClone(item)) as unknown as T
    }

    const result: Record<string, unknown> = {}
    for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            result[key] = deepClone((value as Record<string, unknown>)[key])
        }
    }
    return result as T
}

/**
 * 深度合并对象
 */
export function deepMerge<T extends Record<string, unknown>>(
    target: T,
    ...sources: Partial<T>[]
): T {
    const result = deepClone(target)

    for (const source of sources) {
        if (!source)
            continue

        for (const key in source) {
            if (!Object.prototype.hasOwnProperty.call(source, key))
                continue

            const sourceValue = source[key]
            const targetValue = result[key]

            if (isObject(sourceValue) && isObject(targetValue)) {
                (result as Record<string, unknown>)[key] = deepMerge(
                    targetValue as Record<string, unknown>,
                    sourceValue as Record<string, unknown>,
                )
            }
            else {
                (result as Record<string, unknown>)[key] = deepClone(sourceValue)
            }
        }
    }

    return result
}

/**
 * 从对象中选取指定键
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
    obj: T,
    keys: K[],
): Pick<T, K> {
    const result = {} as Pick<T, K>
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key]
        }
    }
    return result
}

/**
 * 从对象中排除指定键
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
    obj: T,
    keys: K[],
): Omit<T, K> {
    const result = { ...obj }
    for (const key of keys) {
        delete result[key]
    }
    return result
}

// =============================================================================
// 字符串工具
// =============================================================================

/**
 * 首字母大写
 */
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * 驼峰转短横线
 */
export function kebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase()
}

/**
 * 短横线转驼峰
 */
export function camelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
        .replace(/^[A-Z]/, c => c.toLowerCase())
}

/**
 * 截断字符串
 */
export function truncate(str: string, length: number, suffix = '...'): string {
    if (str.length <= length) {
        return str
    }
    return str.slice(0, length - suffix.length) + suffix
}

// =============================================================================
// 数组工具
// =============================================================================

/**
 * 数组去重
 */
export function unique<T>(array: T[]): T[] {
    return [...new Set(array)]
}

/**
 * 数组分组
 */
export function groupBy<T, K extends string | number>(
    array: T[],
    keyFn: (item: T) => K,
): Record<K, T[]> {
    return array.reduce(
        (groups, item) => {
            const key = keyFn(item)
            if (!groups[key]) {
                groups[key] = []
            }
            groups[key].push(item)
            return groups
        },
        {} as Record<K, T[]>,
    )
}

/**
 * 数组分块
 */
export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}

// =============================================================================
// 异步工具
// =============================================================================

/**
 * 延时
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 超时包装
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    errorMessage = 'Operation timed out',
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms)
    })

    try {
        const result = await Promise.race([promise, timeoutPromise])
        clearTimeout(timeoutId!)
        return result
    }
    catch (error) {
        clearTimeout(timeoutId!)
        throw error
    }
}

/**
 * 重试执行
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number
        delayMs?: number
        backoff?: 'fixed' | 'exponential'
        onRetry?: (error: unknown, attempt: number) => void
    } = {},
): Promise<T> {
    const {
        maxAttempts = 3,
        delayMs = 1000,
        backoff = 'exponential',
        onRetry,
    } = options

    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn()
        }
        catch (error) {
            lastError = error

            if (attempt < maxAttempts) {
                onRetry?.(error, attempt)
                const waitTime = backoff === 'exponential'
                    ? delayMs * 2 ** (attempt - 1)
                    : delayMs
                await delay(waitTime)
            }
        }
    }

    throw lastError
}

// =============================================================================
// 时间工具
// =============================================================================

/**
 * 格式化日期
 */
export function formatDate(
    date: Date | number | string,
    format = 'YYYY-MM-DD HH:mm:ss',
): string {
    const d = new Date(date)

    const tokens: Record<string, string> = {
        'YYYY': d.getFullYear().toString(),
        'MM': (d.getMonth() + 1).toString().padStart(2, '0'),
        'DD': d.getDate().toString().padStart(2, '0'),
        'HH': d.getHours().toString().padStart(2, '0'),
        'mm': d.getMinutes().toString().padStart(2, '0'),
        'ss': d.getSeconds().toString().padStart(2, '0'),
        'SSS': d.getMilliseconds().toString().padStart(3, '0'),
    }

    return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, match => tokens[match])
}

/**
 * 相对时间描述
 */
export function timeAgo(date: Date | number | string): string {
    const d = new Date(date)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - d.getTime()) / 1000)

    if (seconds < 60)
        return 'just now'
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} minutes ago`
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)} hours ago`
    if (seconds < 604800)
        return `${Math.floor(seconds / 86400)} days ago`
    if (seconds < 2592000)
        return `${Math.floor(seconds / 604800)} weeks ago`
    if (seconds < 31536000)
        return `${Math.floor(seconds / 2592000)} months ago`
    return `${Math.floor(seconds / 31536000)} years ago`
}
