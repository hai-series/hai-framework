/**
 * =============================================================================
 * @hai/core - 对象操作工具
 * =============================================================================
 */

import { typeUtils } from './core-util-type.js'

/**
 * 深度克隆对象。
 * 注意：仅适用于可 JSON 序列化的数据（如 Date、Map、函数等会丢失信息）。
 *
 * @example
 * ```ts
 * const cloned = object.deepClone({ a: 1 })
 * ```
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * 深度合并多个对象。
 *
 * @example
 * ```ts
 * const merged = object.deepMerge({ a: 1 }, { b: 2 })
 * ```
 */
function deepMerge<T extends Record<string, unknown>>(...objects: Partial<T>[]): T {
  const result = {} as Record<string, unknown>
  for (const obj of objects) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key]
        if (typeUtils.isObject(val) && typeUtils.isObject(result[key])) {
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
 * 从对象中选取指定的键。
 *
 * @example
 * ```ts
 * object.pick({ a: 1, b: 2 }, ['a'])
 * ```
 */
function pick<T extends Record<string, unknown>, K extends keyof T>(
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
 * 从对象中排除指定的键。
 *
 * @example
 * ```ts
 * object.omit({ a: 1, b: 2 }, ['b'])
 * ```
 */
function omit<T extends Record<string, unknown>, K extends keyof T>(
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
 * 获取对象的所有键。
 *
 * @example
 * ```ts
 * object.keys({ a: 1, b: 2 })
 * ```
 */
function keys<T extends Record<string, unknown>>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}

/**
 * 获取对象的所有值。
 *
 * @example
 * ```ts
 * object.values({ a: 1, b: 2 })
 * ```
 */
function values<T extends Record<string, unknown>>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][]
}

/**
 * 获取对象的键值对数组。
 *
 * @example
 * ```ts
 * object.entries({ a: 1 })
 * ```
 */
function entries<T extends Record<string, unknown>>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][]
}

/**
 * 从键值对数组创建对象。
 *
 * @example
 * ```ts
 * object.fromEntries([['a', 1]])
 * ```
 */
function fromEntries<K extends string, V>(entries: [K, V][]): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>
}

/**
 * 对象操作工具对象。
 *
 * @example
 * ```ts
 * object.deepMerge({ a: 1 }, { b: 2 })
 * ```
 */
export const object = {
  deepClone,
  deepMerge,
  pick,
  omit,
  keys,
  values,
  entries,
  fromEntries,
}
