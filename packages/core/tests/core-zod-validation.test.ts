/**
 * =============================================================================
 * @h-ai/core - zodValidation 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.zodValidation', () => {
  it('应只暴露最小必要 API', () => {
    expect(Object.keys(core.zodValidation).sort()).toEqual([
      'createPrefixedZodMessageGetter',
      'mapZodErrorToFormErrors',
    ])
  })

  it('createPrefixedZodMessageGetter 应该自动派生带前缀的消息 key', () => {
    const calls: Array<{ key: string, params?: Record<string, string | number> }> = []

    const getMessage = core.zodValidation.createPrefixedZodMessageGetter<string>(
      'serv',
      (messageKey, params) => {
        calls.push({ key: messageKey, params })
        return `${messageKey}:${params?.min ?? ''}`
      },
    )

    expect(getMessage('validationStringMin', { min: 3 })).toBe('serv_validationStringMin:3')
    expect(calls).toEqual([{ key: 'serv_validationStringMin', params: { min: 3 } }])
  })

  it('mapZodErrorToFormErrors 应该保留自定义消息并把全局错误映射到 _ 字段', () => {
    const errors = core.zodValidation.mapZodErrorToFormErrors(
      {
        issues: [
          {
            path: [],
            message: '全局错误',
          },
        ],
      },
      () => '不应被使用',
    )

    expect(errors).toEqual([
      { field: '_', message: '全局错误' },
    ])
  })
})
