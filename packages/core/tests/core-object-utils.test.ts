/**
 * =============================================================================
 * @h-ai/core - 对象工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.object', () => {
  it('deepClone 应该返回不同引用', () => {
    const obj = { a: 1, b: { c: 2 } }
    const cloned = core.object.deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.b).not.toBe(obj.b)
  })

  it('deepMerge 应该合并嵌套对象', () => {
    const merged = core.object.deepMerge(
      { a: 1, b: { c: 1, d: 2 } },
      { b: { d: 3 }, e: 4 },
    )
    expect(merged).toEqual({ a: 1, b: { c: 1, d: 3 }, e: 4 })
  })

  it('deepMerge 数组应被直接覆盖而非合并', () => {
    const merged = core.object.deepMerge(
      { items: [1, 2, 3] },
      { items: [4, 5] },
    )
    expect(merged).toEqual({ items: [4, 5] })
  })

  it('deepMerge 应该支持多个对象合并', () => {
    const merged = core.object.deepMerge(
      { a: 1 },
      { b: 2 },
      { c: 3 },
    )
    expect(merged).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('deepMerge 回归：Date、集合与类实例按后值覆盖，保留对象类型', () => {
    class Endpoint {
      constructor(readonly host: string) {}
    }
    const previous = { at: new Date('2025-01-01'), map: new Map([['old', 1]]), set: new Set([1]), endpoint: new Endpoint('old') }
    const next = { at: new Date('2026-01-01'), map: new Map([['new', 2]]), set: new Set([2]), endpoint: new Endpoint('new') }
    const merged = core.object.deepMerge(previous, next)
    for (const key of ['at', 'map', 'set', 'endpoint'] as const)
      expect(merged[key]).toBe(next[key])
    expect(merged.at.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(previous.endpoint.host).toBe('old')
  })

  it('deepMerge 回归：普通对象与实例相互覆盖，空原型对象仍递归合并', () => {
    const plain: Record<string, unknown> = { value: { nested: true } }
    const instance: Record<string, unknown> = { value: new Date('2026-01-01') }
    expect(core.object.deepMerge(plain, instance).value).toBe(instance.value)
    expect(core.object.deepMerge(instance, plain).value).toEqual({ nested: true })
    const nullPrototype: Record<string, unknown> = Object.create(null)
    nullPrototype.left = 1
    expect(core.object.deepMerge({ nested: nullPrototype }, { nested: { right: 2 } })).toEqual({ nested: { left: 1, right: 2 } })
  })

  it('deepMerge 非对象值应被直接覆盖', () => {
    const merged = core.object.deepMerge(
      { a: { nested: true } },
      { a: 'string' as unknown as Record<string, unknown> },
    )
    expect(merged).toEqual({ a: 'string' })
  })

  it('deepMerge 应该忽略 __proto__ 和 constructor 键防止原型污染', () => {
    // 模拟 JSON.parse 产生的含 __proto__ 的对象
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}')
    const merged = core.object.deepMerge({}, malicious)
    expect(merged.safe).toBe(1)
    // __proto__ 被忽略，不会污染原型
    expect((merged as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('pick 应该选择指定键', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(core.object.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('pick 不存在的键应被忽略', () => {
    const obj = { a: 1, b: 2 }
    const result = core.object.pick(obj, ['a', 'nonexistent' as keyof typeof obj])
    expect(result).toEqual({ a: 1 })
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

  it('空对象操作应正常工作', () => {
    expect(core.object.deepClone({})).toEqual({})
    expect(core.object.deepMerge({}, {})).toEqual({})
    expect(core.object.pick({} as Record<string, unknown>, [])).toEqual({})
    expect(core.object.omit({} as Record<string, unknown>, [])).toEqual({})
    expect(core.object.keys({})).toEqual([])
    expect(core.object.values({})).toEqual([])
    expect(core.object.entries({})).toEqual([])
  })
})
