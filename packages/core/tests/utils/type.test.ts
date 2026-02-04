/**
 * =============================================================================
 * @hai/core - 类型检查工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { typeUtils } from '../../src/utils/core-util-type.js'

describe('core-util-type', () => {
  describe('isDefined()', () => {
    it('应对 null 返回 false', () => {
      expect(typeUtils.isDefined(null)).toBe(false)
    })

    it('应对 undefined 返回 false', () => {
      expect(typeUtils.isDefined(undefined)).toBe(false)
    })

    it('应对其他值返回 true', () => {
      expect(typeUtils.isDefined(0)).toBe(true)
      expect(typeUtils.isDefined('')).toBe(true)
      expect(typeUtils.isDefined(false)).toBe(true)
      expect(typeUtils.isDefined({})).toBe(true)
      expect(typeUtils.isDefined([])).toBe(true)
    })
  })

  describe('isObject()', () => {
    it('应对纯对象返回 true', () => {
      expect(typeUtils.isObject({})).toBe(true)
      expect(typeUtils.isObject({ a: 1 })).toBe(true)
    })

    it('应对 null 返回 false', () => {
      expect(typeUtils.isObject(null)).toBe(false)
    })

    it('应对数组返回 false', () => {
      expect(typeUtils.isObject([])).toBe(false)
      expect(typeUtils.isObject([1, 2, 3])).toBe(false)
    })

    it('应对其他类型返回 false', () => {
      expect(typeUtils.isObject('string')).toBe(false)
      expect(typeUtils.isObject(123)).toBe(false)
      expect(typeUtils.isObject(true)).toBe(false)
    })
  })

  describe('isFunction()', () => {
    it('应对函数返回 true', () => {
      expect(typeUtils.isFunction(() => { })).toBe(true)
      expect(typeUtils.isFunction(() => { })).toBe(true)
      expect(typeUtils.isFunction(async () => { })).toBe(true)
    })

    it('应对非函数返回 false', () => {
      expect(typeUtils.isFunction({})).toBe(false)
      expect(typeUtils.isFunction(null)).toBe(false)
      expect(typeUtils.isFunction('string')).toBe(false)
    })
  })

  describe('isPromise()', () => {
    it('应对 Promise 返回 true', () => {
      expect(typeUtils.isPromise(Promise.resolve())).toBe(true)
      expect(typeUtils.isPromise(new Promise(() => { }))).toBe(true)
    })

    it('应对 thenable 对象返回 true', () => {
      const thenable = { then: () => { } }
      expect(typeUtils.isPromise(thenable)).toBe(true)
    })

    it('应对非 Promise 返回 false', () => {
      expect(typeUtils.isPromise({})).toBe(false)
      expect(typeUtils.isPromise(null)).toBe(false)
      expect(typeUtils.isPromise(() => { })).toBe(false)
    })
  })

  describe('isString()', () => {
    it('应对字符串返回 true', () => {
      expect(typeUtils.isString('')).toBe(true)
      expect(typeUtils.isString('hello')).toBe(true)
    })

    it('应对非字符串返回 false', () => {
      expect(typeUtils.isString(123)).toBe(false)
      expect(typeUtils.isString(null)).toBe(false)
      expect(typeUtils.isString({})).toBe(false)
    })
  })

  describe('isNumber()', () => {
    it('应对数字返回 true', () => {
      expect(typeUtils.isNumber(0)).toBe(true)
      expect(typeUtils.isNumber(123)).toBe(true)
      expect(typeUtils.isNumber(-456)).toBe(true)
      expect(typeUtils.isNumber(1.5)).toBe(true)
    })

    it('应对 NaN 返回 false', () => {
      expect(typeUtils.isNumber(Number.NaN)).toBe(false)
    })

    it('应对非数字返回 false', () => {
      expect(typeUtils.isNumber('123')).toBe(false)
      expect(typeUtils.isNumber(null)).toBe(false)
    })
  })

  describe('isBoolean()', () => {
    it('应对布尔值返回 true', () => {
      expect(typeUtils.isBoolean(true)).toBe(true)
      expect(typeUtils.isBoolean(false)).toBe(true)
    })

    it('应对非布尔值返回 false', () => {
      expect(typeUtils.isBoolean(0)).toBe(false)
      expect(typeUtils.isBoolean('')).toBe(false)
      expect(typeUtils.isBoolean(null)).toBe(false)
    })
  })

  describe('isArray()', () => {
    it('应对数组返回 true', () => {
      expect(typeUtils.isArray([])).toBe(true)
      expect(typeUtils.isArray([1, 2, 3])).toBe(true)
    })

    it('应对非数组返回 false', () => {
      expect(typeUtils.isArray({})).toBe(false)
      expect(typeUtils.isArray('string')).toBe(false)
      expect(typeUtils.isArray(null)).toBe(false)
    })
  })
})
