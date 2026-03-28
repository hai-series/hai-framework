/**
 * @h-ai/core — 数组操作工具
 * @module core-util-array
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
function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

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
function groupBy<T, K extends string | number>(
  arr: T[],
  fn: (item: T) => K,
): Record<K, T[]> {
  const result = {} as Record<K, T[]>
  for (const item of arr) {
    const key = fn(item)
    if (!result[key])
      result[key] = []
    result[key].push(item)
  }
  return result
}

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
function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0)
    return []
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

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
function first<T>(arr: T[]): T | undefined {
  return arr[0]
}

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
function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1]
}

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
function flatten<T>(arr: T[][]): T[] {
  return arr.flat()
}

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
function compact<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((item): item is T => item !== null && item !== undefined)
}

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
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
            ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

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
function intersection<T>(arr1: T[], arr2: T[]): T[] {
  const set = new Set(arr2)
  return arr1.filter(item => set.has(item))
}

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
function difference<T>(arr1: T[], arr2: T[]): T[] {
  const set = new Set(arr2)
  return arr1.filter(item => !set.has(item))
}

/**
 * 数组操作工具对象。
 *
 * @example
 * ```ts
 * array.unique([1, 1, 2])
 * ```
 */
export const array = {
  unique,
  groupBy,
  chunk,
  first,
  last,
  flatten,
  compact,
  shuffle,
  intersection,
  difference,
}

/** array 子工具类型 */
export type ArrayFn = typeof array
