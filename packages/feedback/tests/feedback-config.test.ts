import { describe, expect, it } from 'vitest'
import { FeedbackConfigSchema } from '../src/index.js'

describe('反馈配置', () => {
  it('可以只提供应用标识，并得到默认的限制和保留期限', () => {
    expect(FeedbackConfigSchema.parse({ appId: 'orders' })).toEqual({
      appId: 'orders',
      limits: {
        maxBodyLength: 5000,
        maxFiles: 5,
        maxFileBytes: 5242880,
        maxTotalFileBytes: 10485760,
      },
      capture: {
        windowSeconds: 300,
        maxLogEntries: 1000,
        maxLogBytes: 524288,
        maxReplayBytes: 2097152,
        maxReplayEvents: 2000,
        maxRecordingSeconds: 60,
      },
      retention: { days: 0 },
    })
    expect(FeedbackConfigSchema.safeParse({ appId: '  ' }).success).toBe(false)
    expect(FeedbackConfigSchema.safeParse({ appId: 'orders', worker: {} }).success).toBe(false)
  })

  it.each([
    {
      limits: { maxFileBytes: 6, maxTotalFileBytes: 5 },
    },
    {
      limits: { maxFileBytes: 11 * 1024 * 1024 },
    },
    {
      capture: { maxRecordingSeconds: 0 },
    },
    {
      retention: { days: 0.5 },
    },
  ])('拒绝超出范围以及互相不满足的限制 %j', (settings) => {
    expect(FeedbackConfigSchema.safeParse({ appId: 'orders', ...settings }).success).toBe(false)
  })
})
