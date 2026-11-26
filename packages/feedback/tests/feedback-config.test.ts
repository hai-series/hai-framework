import { core } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { FeedbackConfigSchema } from '../src/index.js'

const MiB = 1024 * 1024

describe('反馈分组配置', () => {
  it('补齐省略分组的默认值，Reach 仍默认启用并要求接收方', () => {
    const missingRecipient = FeedbackConfigSchema.safeParse({ appId: 'orders' })
    expect(missingRecipient.success).toBe(false)
    if (!missingRecipient.success) {
      expect(missingRecipient.error.issues).toEqual([
        expect.objectContaining({
          path: ['notification', 'recipients'],
        }),
      ])
    }

    const parsed = FeedbackConfigSchema.parse({
      appId: 'orders',
      notification: {
        recipients: ['ops@example.test'],
      },
    })
    expect(parsed).toEqual({
      appId: 'orders',
      build: {},
      notification: {
        mode: 'reach',
        consoleContent: 'metadata',
        recipients: ['ops@example.test'],
        provider: 'email',
      },
      webhook: { url: '', secret: '', timeoutMs: 10_000 },
      collection: { timeoutMs: 60_000, businessTimeoutMs: 30_000, envAllowlist: [] },
      retention: { days: 30, exportHours: 24 },
      limits: {
        maxReportsPerUserDay: 20,
        maxBytesPerUserDay: 2 * 1024 * MiB,
        maxStoredBytesPerScope: 10 * 1024 * MiB,
        maxExportsPerReport: 5,
        maxTotalBytes: 32 * MiB,
        maxAttachmentBytes: 5 * MiB,
        maxEvidenceBytes: 4 * MiB,
        maxEvidenceCount: 2000,
      },
      worker: { intervalMs: 1000, leaseMs: 30_000, maxAttempts: 5 },
    })
  })

  it.each([
    { notificationMode: 'console' },
    { maxTotalBytes: 8 * MiB },
    {
      notification: { mode: 'console', notificationProvider: 'email' },
    },
    {
      worker: { workerIntervalMs: 42 },
    },
  ])('拒绝旧式或未知键 %j', (override) => {
    const parsed = FeedbackConfigSchema.safeParse({
      appId: 'orders',
      notification: { mode: 'console' },
      ...override,
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.error.issues.some(issue => issue.code === 'unrecognized_keys')).toBe(true)
  })

  it('从环境合成省略分组，并按类型应用组 JSON 和细项覆盖', () => {
    const result = core.config.resolve({
      name: 'feedback',
      value: {
        appId: 'orders',
        notification: { mode: 'console' },
      },
      schema: FeedbackConfigSchema,
      environment: {
        HAI_FEEDBACK_BUILD_BUILDID: '00042',
        HAI_FEEDBACK_NOTIFICATION: '{"mode":"reach","recipients":["default@example.test"],"provider":"ops"}',
        HAI_FEEDBACK_NOTIFICATION_RECIPIENTS_0: 'override@example.test',
        HAI_FEEDBACK_COLLECTION_ENVALLOWLIST: '["DEPLOY_REGION","TZ"]',
        HAI_FEEDBACK_WEBHOOK_SECRET: 'synthetic-environment-value',
        HAI_FEEDBACK_RETENTION_DAYS: '7',
        HAI_FEEDBACK_LIMITS_MAXTOTALBYTES: String(8 * MiB),
        HAI_FEEDBACK_WORKER_INTERVALMS: '0',
      },
    })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    const parsed = FeedbackConfigSchema.parse(result.data)
    expect(parsed).toMatchObject({
      appId: 'orders',
      build: { buildId: '00042' },
      notification: {
        mode: 'reach',
        recipients: ['override@example.test'],
        provider: 'ops',
      },
      webhook: { secret: 'synthetic-environment-value', url: '' },
      collection: {
        envAllowlist: ['DEPLOY_REGION', 'TZ'],
      },
      retention: { days: 7, exportHours: 24 },
      limits: { maxTotalBytes: 8 * MiB, maxEvidenceCount: 2000 },
      worker: { intervalMs: 0, leaseMs: 30_000 },
    })
  })
})
