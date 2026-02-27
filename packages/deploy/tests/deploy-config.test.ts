/**
 * =============================================================================
 * @h-ai/deploy - 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { DeployConfigSchema, DeployErrorCode } from '../src/deploy-config.js'

describe('deployErrorCode', () => {
  it('错误码应在 9000-9099 范围内', () => {
    for (const [, value] of Object.entries(DeployErrorCode)) {
      expect(value).toBeGreaterThanOrEqual(9000)
      expect(value).toBeLessThanOrEqual(9099)
    }
  })

  it('not_INITIALIZED 应固定为 9010', () => {
    expect(DeployErrorCode.NOT_INITIALIZED).toBe(9010)
  })

  it('所有错误码应唯一', () => {
    const values = Object.values(DeployErrorCode)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})

describe('deployConfigSchema', () => {
  it('应校验最小合法配置（仅 provider）', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'vercel', token: 'vel_xxx' },
    })
    expect(result.success).toBe(true)
  })

  it('应校验含所有服务的完整配置', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'vercel', token: 'vel_xxx' },
      services: {
        db: { provisioner: 'neon', apiKey: 'neon_xxx' },
        cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'upa_xxx' },
        storage: { provisioner: 'cloudflare-r2', accountId: 'acc123', apiToken: 'cf_xxx' },
        email: { provisioner: 'resend', apiKey: 're_xxx' },
        sms: { provisioner: 'aliyun', accessKeyId: 'LTAI_xxx', accessKeySecret: 'xxx' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('缺少 provider.token 应校验失败', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'vercel', token: '' },
    })
    expect(result.success).toBe(false)
  })

  it('不支持的 provider type 应校验失败', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'aws', token: 'xxx' },
    })
    expect(result.success).toBe(false)
  })

  it('不支持的 provisioner 应校验失败', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'vercel', token: 'vel_xxx' },
      services: {
        db: { provisioner: 'unknown', apiKey: 'xxx' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('upstash 缺少 email 应校验失败', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'vercel', token: 'vel_xxx' },
      services: {
        cache: { provisioner: 'upstash', apiKey: 'xxx' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('部分服务配置应允许', () => {
    const result = DeployConfigSchema.safeParse({
      provider: { type: 'vercel', token: 'vel_xxx' },
      services: {
        db: { provisioner: 'neon', apiKey: 'neon_xxx' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.services?.db?.provisioner).toBe('neon')
      expect(result.data.services?.cache).toBeUndefined()
    }
  })
})
