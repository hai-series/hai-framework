/**
 * =============================================================================
 * @h-ai/core - Result 类型测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { err, ok } from '../src/index.js'

describe('core.result', () => {
  it('ok 应该返回 success true', () => {
    const result = ok(123)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(123)
    }
  })

  it('ok 应该支持各种值类型', () => {
    expect(ok(null).success).toBe(true)
    expect(ok(undefined).success).toBe(true)
    expect(ok('str').success).toBe(true)
    expect(ok({ key: 'value' }).success).toBe(true)
    expect(ok([1, 2, 3]).success).toBe(true)
  })

  it('ok 数据应该能正确读取', () => {
    const obj = { name: 'test', items: [1, 2] }
    const result = ok(obj)
    if (result.success) {
      expect(result.data).toBe(obj) // 同引用
      expect(result.data.name).toBe('test')
    }
  })

  it('err 应该返回 success false', () => {
    const result = err('oops')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('oops')
    }
  })

  it('err 应该支持对象错误', () => {
    const error = { code: 1000, message: 'Unknown error' }
    const result = err(error)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(1000)
      expect(result.error.message).toBe('Unknown error')
    }
  })

  it('ok 和 err 应该通过 success 字段区分', () => {
    const success = ok('data')
    const failure = err('error')

    // 类型窄化验证
    if (success.success) {
      expect(success.data).toBe('data')
    }
    if (!failure.success) {
      expect(failure.error).toBe('error')
    }
  })
})
