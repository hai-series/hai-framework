/**
 * =============================================================================
 * @hai/core - 类型检查工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  isArray,
  isBoolean,
  isDefined,
  isFunction,
  isNumber,
  isObject,
  isPromise,
  isString,
} from '../../src/utils/core-util-type.js'

describe('core-util-type', () => {
  describe('isDefined()', () => {
    it('应对 null 返回 false', () => {
      expect(isDefined(null)).toBe(false)
    })

    it('应对 undefined 返回 false', () => {
      expect(isDefined(undefined)).toBe(false)
    })

    it('应对其他值返回 true', () => {
      expect(isDefined(0)).toBe(true)
      expect(isDefined('')).toBe(true)
      expect(isDefined(false)).toBe(true)
      expect(isDefined({})).toBe(true)
      expect(isDefined([])).toBe(true)
    })
  })

  describe('isObject()', () => {
    it('应对纯对象返回 true', () => {
      expect(isObject({})).toBe(true)
      expect(isObject({ a: 1 })).toBe(true)
    })

    it('应对 null 返回 false', () => {
      expect(isObject(null)).toBe(false)
    })

    it('应对数组返回 false', () => {
      expect(isObject([])).toBe(false)
      expect(isObject([1, 2, 3])).toBe(false)
    })

    it('应对其他类型返回 false', () => {
      expect(isObject('string')).toBe(false)
      expect(isObject(123)).toBe(false)
      expect(isObject(true)).toBe(false)
    })
  })

  describe('isFunction()', () => {
    it('应对函数返回 true', () => {
      expect(isFunction(() => { })).toBe(true)
      expect(isFunction(() => { })).toBe(true)
      expect(isFunction(async () => { })).toBe(true)
    })

    it('应对非函数返回 false', () => {
      expect(isFunction({})).toBe(false)
      expect(isFunction(null)).toBe(false)
      expect(isFunction('string')).toBe(false)
    })
  })

  describe('isPromise()', () => {
    it('应对 Promise 返回 true', () => {
      expect(isPromise(Promise.resolve())).toBe(true)
      expect(isPromise(new Promise(() => { }))).toBe(true)
    })

    it('应对 thenable 对象返回 true', () => {
      const thenable = { then: () => { } }
      expect(isPromise(thenable)).toBe(true)
    })

    it('应对非 Promise 返回 false', () => {
      expect(isPromise({})).toBe(false)
      expect(isPromise(null)).toBe(false)
      expect(isPromise(() => { })).toBe(false)
    })
  })

  describe('isString()', () => {
    it('应对字符串返回 true', () => {
      expect(isString('')).toBe(true)
      expect(isString('hello')).toBe(true)
    })

    it('应对非字符串返回 false', () => {
      expect(isString(123)).toBe(false)
      expect(isString(null)).toBe(false)
      expect(isString({})).toBe(false)
    })
  })

  describe('isNumber()', () => {
    it('应对数字返回 true', () => {
      expect(isNumber(0)).toBe(true)
      expect(isNumber(123)).toBe(true)
      expect(isNumber(-456)).toBe(true)
      expect(isNumber(1.5)).toBe(true)
    })

    it('应对 NaN 返回 false', () => {
      expect(isNumber(Number.NaN)).toBe(false)
    })

    it('应对非数字返回 false', () => {
      expect(isNumber('123')).toBe(false)
      expect(isNumber(null)).toBe(false)
    })
  })

  describe('isBoolean()', () => {
    it('应对布尔值返回 true', () => {
      expect(isBoolean(true)).toBe(true)
      expect(isBoolean(false)).toBe(true)
    })

    it('应对非布尔值返回 false', () => {
      expect(isBoolean(0)).toBe(false)
      expect(isBoolean('')).toBe(false)
      expect(isBoolean(null)).toBe(false)
    })
  })

  describe('isArray()', () => {
    it('应对数组返回 true', () => {
      expect(isArray([])).toBe(true)
      expect(isArray([1, 2, 3])).toBe(true)
    })

    it('应对非数组返回 false', () => {
      expect(isArray({})).toBe(false)
      expect(isArray('string')).toBe(false)
      expect(isArray(null)).toBe(false)
    })
  })
})
