/**
 * =============================================================================
 * @h-ai/core - 数组操作工具
 * =============================================================================
 */
/**
 * 数组去重。
 * @param arr - 输入数组
 * @returns 去重后的新数组
 * @remarks 保留首次出现的顺序；空数组返回空数组。
 *
 * @example
 * ```ts
 * array.unique([1, 1, 2]) // [1, 2]
 * ```
 */
declare function unique<T>(arr: T[]): T[]
/**
 * 按条件分组。
 * @param arr - 输入数组
 * @param fn - 分组键生成函数
 * @returns 分组结果对象
 * @remarks 当数组为空时返回空对象。
 *
 * @example
 * ```ts
 * array.groupBy([{ r: 'a' }, { r: 'b' }], item => item.r)
 * ```
 */
declare function groupBy<T, K extends string | number>(arr: T[], fn: (item: T) => K): Record<K, T[]>
/**
 * 分割为指定大小的块。
 * @param arr - 输入数组
 * @param size - 每块大小（应为正整数）
 * @returns 分块后的二维数组
 * @remarks size <= 0 时结果为空数组。
 *
 * @example
 * ```ts
 * array.chunk([1, 2, 3], 2) // [[1,2],[3]]
 * ```
 */
declare function chunk<T>(arr: T[], size: number): T[][]
/**
 * 获取第一个元素。
 * @param arr - 输入数组
 * @returns 第一个元素或 undefined
 * @remarks 空数组返回 undefined。
 *
 * @example
 * ```ts
 * array.first([1, 2, 3]) // 1
 * ```
 */
declare function first<T>(arr: T[]): T | undefined
/**
 * 获取最后一个元素。
 * @param arr - 输入数组
 * @returns 最后一个元素或 undefined
 * @remarks 空数组返回 undefined。
 *
 * @example
 * ```ts
 * array.last([1, 2, 3]) // 3
 * ```
 */
declare function last<T>(arr: T[]): T | undefined
/**
 * 数组扁平化。
 * @param arr - 二维数组
 * @returns 扁平化后的数组
 * @remarks 仅扁平一层。
 *
 * @example
 * ```ts
 * array.flatten([[1], [2, 3]]) // [1, 2, 3]
 * ```
 */
declare function flatten<T>(arr: T[][]): T[]
/**
 * 过滤掉 null 和 undefined。
 * @param arr - 输入数组
 * @returns 过滤后的数组
 * @remarks 会保留 0、false、'' 等假值。
 *
 * @example
 * ```ts
 * array.compact([0, null, 1]) // [0, 1]
 * ```
 */
declare function compact<T>(arr: (T | null | undefined)[]): T[]
/**
 * 随机打乱数组。
 * @param arr - 输入数组
 * @returns 打乱后的新数组
 * @remarks 不修改原数组。
 *
 * @example
 * ```ts
 * const shuffled = array.shuffle([1, 2, 3])
 * ```
 */
declare function shuffle<T>(arr: T[]): T[]
/**
 * 取数组交集。
 * @param arr1 - 数组 1
 * @param arr2 - 数组 2
 * @returns 交集数组
 * @remarks 保持 arr1 中的顺序。
 *
 * @example
 * ```ts
 * array.intersection([1, 2], [2, 3]) // [2]
 * ```
 */
declare function intersection<T>(arr1: T[], arr2: T[]): T[]
/**
 * 取数组差集。
 * @param arr1 - 数组 1
 * @param arr2 - 数组 2
 * @returns 差集数组（arr1 中存在且 arr2 不存在）
 * @remarks 保持 arr1 中的顺序。
 *
 * @example
 * ```ts
 * array.difference([1, 2, 3], [2]) // [1, 3]
 * ```
 */
declare function difference<T>(arr1: T[], arr2: T[]): T[]
/**
 * 数组操作工具对象。
 *
 * @example
 * ```ts
 * array.unique([1, 1, 2])
 * ```
 */
export declare const array: {
  unique: typeof unique
  groupBy: typeof groupBy
  chunk: typeof chunk
  first: typeof first
  last: typeof last
  flatten: typeof flatten
  compact: typeof compact
  shuffle: typeof shuffle
  intersection: typeof intersection
  difference: typeof difference
}
export {}
// # sourceMappingURL=core-util-array.d.ts.map
