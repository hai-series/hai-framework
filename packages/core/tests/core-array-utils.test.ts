/**
 * =============================================================================
 * @hai/core - 数组工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.array', () => {
  it('unique 应该去重', () => {
    expect(core.array.unique([1, 1, 2])).toEqual([1, 2])
  })

  it('groupBy 应该按条件分组', () => {
    const result = core.array.groupBy(
      [{ role: 'admin' }, { role: 'user' }, { role: 'admin' }],
      item => item.role,
    )
    expect(result.admin).toHaveLength(2)
    expect(result.user).toHaveLength(1)
  })

  it('chunk 应该分块', () => {
    expect(core.array.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('first/last 应该返回首末元素', () => {
    expect(core.array.first([1, 2, 3])).toBe(1)
    expect(core.array.last([1, 2, 3])).toBe(3)
  })

  it('flatten 应该扁平化', () => {
    expect(core.array.flatten([[1], [2, 3]])).toEqual([1, 2, 3])
  })

  it('compact 应该移除 null/undefined', () => {
    expect(core.array.compact([0, null, 1, undefined])).toEqual([0, 1])
  })

  it('shuffle 应该保持元素集合不变', () => {
    const input = [1, 2, 3, 4]
    const output = core.array.shuffle(input)
    expect(output).toHaveLength(input.length)
    expect(output.sort()).toEqual(input.slice().sort())
  })

  it('intersection/difference 应该返回交集与差集', () => {
    expect(core.array.intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3])
    expect(core.array.difference([1, 2, 3], [2])).toEqual([1, 3])
  })
})
