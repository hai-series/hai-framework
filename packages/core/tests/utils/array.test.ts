/**
 * =============================================================================
 * @hai/core - 数组操作工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  chunk,
  compact,
  difference,
  first,
  flatten,
  groupBy,
  intersection,
  last,
  shuffle,
  unique,
} from '../../src/utils/core-util-array.js'

describe('core-util-array', () => {
  describe('unique()', () => {
    it('应去除重复元素', () => {
      expect(unique([1, 1, 2, 2, 3])).toEqual([1, 2, 3])
    })

    it('应处理字符串数组', () => {
      expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
    })

    it('应处理空数组', () => {
      expect(unique([])).toEqual([])
    })
  })

  describe('groupBy()', () => {
    it('应按条件分组', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ]
      const result = groupBy(items, item => item.type)

      expect(result).toEqual({
        a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
        b: [{ type: 'b', value: 2 }],
      })
    })

    it('应支持数字键分组', () => {
      const items = [1, 2, 3, 4, 5, 6]
      const result = groupBy(items, n => n % 2)

      expect(result[0]).toEqual([2, 4, 6])
      expect(result[1]).toEqual([1, 3, 5])
    })
  })

  describe('chunk()', () => {
    it('应分割为指定大小的块', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    })

    it('应处理空数组', () => {
      expect(chunk([], 2)).toEqual([])
    })

    it('应处理大于数组长度的块大小', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]])
    })
  })

  describe('first()', () => {
    it('应返回第一个元素', () => {
      expect(first([1, 2, 3])).toBe(1)
    })

    it('应对空数组返回 undefined', () => {
      expect(first([])).toBeUndefined()
    })
  })

  describe('last()', () => {
    it('应返回最后一个元素', () => {
      expect(last([1, 2, 3])).toBe(3)
    })

    it('应对空数组返回 undefined', () => {
      expect(last([])).toBeUndefined()
    })
  })

  describe('flatten()', () => {
    it('应扁平化二维数组', () => {
      expect(flatten([[1, 2], [3, 4], [5]])).toEqual([1, 2, 3, 4, 5])
    })

    it('应处理空数组', () => {
      expect(flatten([])).toEqual([])
    })
  })

  describe('compact()', () => {
    it('应过滤掉 null 和 undefined', () => {
      expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3])
    })

    it('应保留 0 和空字符串', () => {
      expect(compact([0, '', false, null])).toEqual([0, '', false])
    })
  })

  describe('shuffle()', () => {
    it('应返回打乱的数组', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const shuffled = shuffle(original)

      // 应包含相同元素（使用副本排序比较）
      expect([...shuffled].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      // 原数组不应被修改
      expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })

  describe('intersection()', () => {
    it('应返回交集', () => {
      expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3])
    })

    it('应处理无交集情况', () => {
      expect(intersection([1, 2], [3, 4])).toEqual([])
    })
  })

  describe('difference()', () => {
    it('应返回差集', () => {
      expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1])
    })

    it('应处理无差集情况', () => {
      expect(difference([1, 2], [1, 2, 3])).toEqual([])
    })
  })
})
