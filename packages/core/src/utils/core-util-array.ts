/**
 * =============================================================================
 * @hai/core - 数组操作工具
 * =============================================================================
 */

/**
 * 数组去重。
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
 *
 * @example
 * ```ts
 * array.chunk([1, 2, 3], 2) // [[1,2],[3]]
 * ```
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * 获取第一个元素。
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
