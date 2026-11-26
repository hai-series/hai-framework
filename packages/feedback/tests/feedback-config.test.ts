import { describe, expect, it } from 'vitest'
import { FeedbackConfigSchema } from '../src/index.js'

describe('反馈配置', () => {
  it('只接受当前应用的标识', () => {
    expect(FeedbackConfigSchema.parse({ appId: 'orders' })).toEqual({ appId: 'orders' })
    expect(FeedbackConfigSchema.safeParse({ appId: '  ' }).success).toBe(false)
    expect(FeedbackConfigSchema.safeParse({ appId: 'orders', worker: {} }).success).toBe(false)
  })
})
