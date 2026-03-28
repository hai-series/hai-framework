/**
 * =============================================================================
 * @h-ai/deploy - 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { DeployConfigSchema, HaiDeployError } from '../src/deploy-types.js'

describe('haiDeployError', () => {
  it('错误码应符合 hai:deploy:NNN 格式', () => {
    for (const [, def] of Object.entries(HaiDeployError)) {
      expect(def.code).toMatch(/^hai:deploy:\d{3}$/)
    }
  })

  it('nOT_INITIALIZED 应固定为 hai:deploy:011', () => {
    expect(HaiDeployError.NOT_INITIALIZED.code).toBe('hai:deploy:011')
  })

  it('所有错误码应唯一', () => {
    const codes = Object.values(HaiDeployError).map(d => d.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
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
