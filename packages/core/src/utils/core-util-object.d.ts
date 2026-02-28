/**
 * =============================================================================
 * @h-ai/core - 对象操作工具
 * =============================================================================
 */
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
declare function deepClone<T>(obj: T): T
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
declare function deepMerge<T extends Record<string, unknown>>(...objects: Partial<T>[]): T
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
declare function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
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
declare function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>
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
declare function keys<T extends Record<string, unknown>>(obj: T): (keyof T)[]
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
declare function values<T extends Record<string, unknown>>(obj: T): T[keyof T][]
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
declare function entries<T extends Record<string, unknown>>(obj: T): [keyof T, T[keyof T]][]
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
declare function fromEntries<K extends string, V>(entries: [K, V][]): Record<K, V>
/**
 * 对象操作工具对象。
 *
 * @example
 * ```ts
 * object.deepMerge({ a: 1 }, { b: 2 })
 * ```
 */
export declare const object: {
  deepClone: typeof deepClone
  deepMerge: typeof deepMerge
  pick: typeof pick
  omit: typeof omit
  keys: typeof keys
  values: typeof values
  entries: typeof entries
  fromEntries: typeof fromEntries
}
export {}
// # sourceMappingURL=core-util-object.d.ts.map
