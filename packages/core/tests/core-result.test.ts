/**
 * =============================================================================
 * @h-ai/core - HaiResult 类型测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core, HaiCommonError } from '../src/index.js'

describe('core.result', () => {
  it('ok 应该返回 success true', () => {
    const result = core.ok(123)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(123)
    }
  })

  it('ok 应该支持各种值类型', () => {
    expect(core.ok(null).success).toBe(true)
    expect(core.ok(undefined).success).toBe(true)
    expect(core.ok('str').success).toBe(true)
    expect(core.ok({ key: 'value' }).success).toBe(true)
    expect(core.ok([1, 2, 3]).success).toBe(true)
  })

  it('ok 数据应该能正确读取', () => {
    const obj = {
      name: 'test',
      items: [1, 2],
    }
    const result = core.ok(obj)
    if (result.success) {
      expect(result.data).toBe(obj) // 同引用
      expect(result.data.name).toBe('test')
    }
  })

  it('err 应该返回 success false', () => {
    const result = core.err(HaiCommonError.UNKNOWN_ERROR, 'oops')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toBe('oops')
    }
  })

  it('err 应该支持 HaiError 对象', () => {
    const errorInst = {
      ...HaiCommonError.INTERNAL_ERROR,
      message: 'Unknown error',
    }
    const result = core.err(errorInst)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('hai:common:500')
      expect(result.error.message).toBe('Unknown error')
    }
  })

  it('ok 和 err 应该通过 success 字段区分', () => {
    const success = core.ok('data')
    const failure = core.err(HaiCommonError.UNKNOWN_ERROR, 'error')

    // 类型窄化验证
    if (success.success) {
      expect(success.data).toBe('data')
    }
    if (!failure.success) {
      expect(failure.error.message).toBe('error')
    }
  })
})
