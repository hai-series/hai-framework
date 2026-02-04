/**
 * =============================================================================
 * @hai/core - Result 类型测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { err, ok } from '../src/core-index.node.js'

describe('core.result', () => {
  it('ok 应该返回 success true', () => {
    const result = ok(123)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(123)
    }
  })

  it('err 应该返回 success false', () => {
    const result = err('oops')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('oops')
    }
  })
})
