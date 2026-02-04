/**
 * =============================================================================
 * @hai/core - 对象工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.node.js'

describe('core.object', () => {
  it('deepClone 应该返回不同引用', () => {
    const obj = { a: 1, b: { c: 2 } }
    const cloned = core.object.deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
  })

  it('deepMerge 应该合并嵌套对象', () => {
    const merged = core.object.deepMerge(
      { a: 1, b: { c: 1, d: 2 } },
      { b: { d: 3 }, e: 4 },
    )
    expect(merged).toEqual({ a: 1, b: { c: 1, d: 3 }, e: 4 })
  })

  it('pick 应该选择指定键', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(core.object.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('omit 应该排除指定键', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(core.object.omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })

  it('keys/values/entries 应该返回可预测结果', () => {
    const obj = { a: 1, b: 2 }
    expect(core.object.keys(obj)).toEqual(['a', 'b'])
    expect(core.object.values(obj)).toEqual([1, 2])
    expect(core.object.entries(obj)).toEqual([['a', 1], ['b', 2]])
  })

  it('fromEntries 应该构建对象', () => {
    const entries: Array<[string, number]> = [['a', 1], ['b', 2]]
    expect(core.object.fromEntries(entries)).toEqual({ a: 1, b: 2 })
  })
})
