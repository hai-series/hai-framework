/**
 * =============================================================================
 * @h-ai/core - 类型工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.typeUtils', () => {
  it('isDefined 应该识别 null/undefined', () => {
    expect(core.typeUtils.isDefined(null)).toBe(false)
    expect(core.typeUtils.isDefined(undefined)).toBe(false)
    expect(core.typeUtils.isDefined(0)).toBe(true)
  })

  it('isObject 应该排除数组', () => {
    expect(core.typeUtils.isObject({})).toBe(true)
    expect(core.typeUtils.isObject([])).toBe(false)
  })

  it('isFunction 应该识别函数', () => {
    expect(core.typeUtils.isFunction(() => 1)).toBe(true)
    expect(core.typeUtils.isFunction(123)).toBe(false)
  })

  it('isPromise 应该识别 Promise 与 thenable', () => {
    expect(core.typeUtils.isPromise(Promise.resolve(1))).toBe(true)
    expect(core.typeUtils.isPromise({ then: () => null })).toBe(true)
    expect(core.typeUtils.isPromise({})).toBe(false)
  })

  it('isString/isNumber/isBoolean/isArray 应该正确判断', () => {
    expect(core.typeUtils.isString('a')).toBe(true)
    expect(core.typeUtils.isString(1)).toBe(false)

    expect(core.typeUtils.isNumber(1)).toBe(true)
    expect(core.typeUtils.isNumber(Number.NaN)).toBe(false)

    expect(core.typeUtils.isBoolean(false)).toBe(true)
    expect(core.typeUtils.isBoolean('false')).toBe(false)

    expect(core.typeUtils.isArray([1])).toBe(true)
    expect(core.typeUtils.isArray('x')).toBe(false)
  })
})
