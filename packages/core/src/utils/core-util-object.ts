/**
 * =============================================================================
 * @hai/core - 对象操作工具
 * =============================================================================
 */

import { isObject } from './core-util-type.js'

/**
 * 深度克隆对象
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
}

/**
 * 深度合并多个对象
 */
export function deepMerge<T extends Record<string, unknown>>(...objects: Partial<T>[]): T {
    const result = {} as Record<string, unknown>
    for (const obj of objects) {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const val = obj[key]
                if (isObject(val) && isObject(result[key])) {
                    result[key] = deepMerge(
                        result[key] as Record<string, unknown>,
                        val as Record<string, unknown>,
                    )
                }
                else {
                    result[key] = val
                }
            }
        }
    }
    return result as T
}

/**
 * 从对象中选取指定的键
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
 * 从对象中排除指定的键
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
    obj: T,
    keys: K[],
): Omit<T, K> {
    const result = { ...obj }
    for (const key of keys) {
        delete result[key]
    }
    return result as Omit<T, K>
}

/**
 * 获取对象的所有键
 */
export function keys<T extends Record<string, unknown>>(obj: T): (keyof T)[] {
    return Object.keys(obj) as (keyof T)[]
}

/**
 * 获取对象的所有值
 */
export function values<T extends Record<string, unknown>>(obj: T): T[keyof T][] {
    return Object.values(obj) as T[keyof T][]
}

/**
 * 获取对象的键值对数组
 */
export function entries<T extends Record<string, unknown>>(obj: T): [keyof T, T[keyof T]][] {
    return Object.entries(obj) as [keyof T, T[keyof T]][]
}

/**
 * 从键值对数组创建对象
 */
export function fromEntries<K extends string, V>(entries: [K, V][]): Record<K, V> {
    return Object.fromEntries(entries) as Record<K, V>
}
