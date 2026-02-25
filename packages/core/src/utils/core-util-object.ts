/**
 * =============================================================================
 * @h-ai/core - 对象操作工具
 * =============================================================================
 */

import { typeUtils } from './core-util-type.js'

/**
 * 深度克隆对象。
 * 注意：仅适用于可 JSON 序列化的数据（如 Date、Map、函数等会丢失信息）。
 * @param obj - 目标对象
 * @returns 深度克隆结果
 * @remarks 不适用于循环引用对象。
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
 * @param objects - 需要合并的对象列表
 * @returns 合并后的新对象
 * @remarks 仅合并纯对象字段，数组会被直接覆盖。
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
 * @param obj - 目标对象
 * @param keys - 要选取的键列表
 * @returns 仅包含指定键的新对象
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
 * @param obj - 目标对象
 * @param keys - 要排除的键列表
 * @returns 排除指定键后的新对象
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
 * @param obj - 目标对象
 * @returns 键列表
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
 * @param obj - 目标对象
 * @returns 值列表
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
 * @param obj - 目标对象
 * @returns 键值对数组
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
 * @param entries - 键值对数组
 * @returns 生成的对象
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
