/**
 * =============================================================================
 * @h-ai/core - 数组工具测试
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

  it('groupBy 回归：原型同名键与数字键均作为独立分组，保留顺序', () => {
    const items = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '__proto__']
    const grouped = core.array.groupBy(items, item => item)
    expect(Object.keys(grouped)).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])
    expect(Object.getOwnPropertyDescriptor(grouped, '__proto__')?.value).toEqual(['__proto__', '__proto__'])
    expect(grouped.constructor).toEqual(['constructor'])
    expect(grouped.toString).toEqual(['toString'])
    expect(Object.getPrototypeOf(grouped)).toBe(Object.prototype)
    expect(core.array.groupBy([1, 2, 3], value => value % 2)).toEqual({ 0: [2], 1: [1, 3] })
  })

  it('chunk size <= 0 应返回空数组', () => {
    expect(core.array.chunk([1, 2, 3], 0)).toEqual([])
    expect(core.array.chunk([1, 2, 3], -1)).toEqual([])
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
