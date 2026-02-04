/**
 * =============================================================================
 * @hai/core - 对象操作工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { object } from '../../src/utils/core-util-object.js'

describe('core-util-object', () => {
  describe('deepClone()', () => {
    it('应深度克隆对象', () => {
      const original = { a: 1, nested: { b: 2 } }
      const cloned = object.deepClone(original)

      expect(cloned).toEqual(original)
      expect(cloned).not.toBe(original)
      expect(cloned.nested).not.toBe(original.nested)
    })

    it('修改克隆对象不应影响原对象', () => {
      const original = { a: 1, nested: { b: 2 } }
      const cloned = object.deepClone(original)

      cloned.nested.b = 99
      expect(original.nested.b).toBe(2)
    })

    it('应克隆数组', () => {
      const original = [1, 2, { a: 3 }]
      const cloned = object.deepClone(original)

      expect(cloned).toEqual(original)
      expect(cloned).not.toBe(original)
    })
  })

  describe('deepMerge()', () => {
    it('应深度合并对象', () => {
      const obj1 = { a: 1, nested: { x: 1 } }
      const obj2 = { b: 2, nested: { y: 2 } }

      const result = object.deepMerge(obj1, obj2)
      expect(result).toEqual({
        a: 1,
        b: 2,
        nested: { x: 1, y: 2 },
      })
    })

    it('应支持多个对象合并', () => {
      const obj1 = { a: 1 }
      const obj2 = { b: 2 }
      const obj3 = { c: 3 }

      const result = object.deepMerge(obj1, obj2, obj3)
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('后面的对象应覆盖前面的同名属性', () => {
      const obj1 = { a: 1, b: 'old' }
      const obj2 = { b: 'new', c: 3 }

      const result = object.deepMerge(obj1, obj2)
      expect(result.b).toBe('new')
    })
  })

  describe('pick()', () => {
    it('应选取指定的键', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const result = object.pick(obj, ['a', 'c'])

      expect(result).toEqual({ a: 1, c: 3 })
    })

    it('应忽略不存在的键', () => {
      const obj: Record<string, number> = { a: 1, b: 2 }
      const result = object.pick(obj, ['a', 'd'])

      expect(result).toEqual({ a: 1 })
    })
  })

  describe('omit()', () => {
    it('应排除指定的键', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const result = object.omit(obj, ['b'])

      expect(result).toEqual({ a: 1, c: 3 })
    })

    it('应支持排除多个键', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 }
      const result = object.omit(obj, ['b', 'd'])

      expect(result).toEqual({ a: 1, c: 3 })
    })
  })

  describe('keys()', () => {
    it('应返回对象的所有键', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const result = object.keys(obj)

      expect(result).toEqual(['a', 'b', 'c'])
    })
  })

  describe('values()', () => {
    it('应返回对象的所有值', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const result = object.values(obj)

      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('entries()', () => {
    it('应返回键值对数组', () => {
      const obj = { a: 1, b: 2 }
      const result = object.entries(obj)

      expect(result).toEqual([['a', 1], ['b', 2]])
    })
  })

  describe('fromEntries()', () => {
    it('应从键值对数组创建对象', () => {
      const pairs: [string, number][] = [['a', 1], ['b', 2]]
      const result = object.fromEntries(pairs)

      expect(result).toEqual({ a: 1, b: 2 })
    })
  })
})
