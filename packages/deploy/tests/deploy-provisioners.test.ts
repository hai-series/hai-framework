/**
 * =============================================================================
 * @h-ai/deploy - Provisioner 测试
 * =============================================================================
 *
 * 所有 5 个 provisioner 的统一测试。
 * 通过 mock fetch 验证认证和开通逻辑。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAliyunProvisioner } from '../src/provisioners/deploy-provisioner-aliyun.js'
import { createNeonProvisioner } from '../src/provisioners/deploy-provisioner-neon.js'
import { createR2Provisioner } from '../src/provisioners/deploy-provisioner-r2.js'
import { createResendProvisioner } from '../src/provisioners/deploy-provisioner-resend.js'
import { createUpstashProvisioner } from '../src/provisioners/deploy-provisioner-upstash.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response
}

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// Neon
// =============================================================================

describe('neon provisioner', () => {
  it('should have correct name and serviceType', () => {
    const neon = createNeonProvisioner()
    expect(neon.name).toBe('neon')
    expect(neon.serviceType).toBe('db')
  })

  it('should authenticate with valid token', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
    const neon = createNeonProvisioner()
    const result = await neon.authenticate({ token: 'neon_valid' })
    expect(result.success).toBe(true)
  })

  it('should fail authenticate without token', async () => {
    const neon = createNeonProvisioner()
    const result = await neon.authenticate({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(9005)
    }
  })

  it('should provision database', async () => {
    // authenticate
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
    const neon = createNeonProvisioner()
    await neon.authenticate({ token: 'neon_valid' })

    // provision
    mockFetch.mockResolvedValueOnce(mockJsonResponse({
      connection_uris: [{ connection_uri: 'postgres://user:pass@host/db' }],
      project: { id: 'neon_prj_1' },
    }))

    const result = await neon.provision('my-app')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serviceType).toBe('db')
      expect(result.data.provisionerName).toBe('neon')
      expect(result.data.envVars.HAI_DB_URL).toBe('postgres://user:pass@host/db')
    }
  })

  it('should return AUTH_REQUIRED when not authenticated', async () => {
    const neon = createNeonProvisioner()
    const result = await neon.provision('my-app')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(9004)
    }
  })
})

// =============================================================================
// Upstash
// =============================================================================

describe('upstash provisioner', () => {
  it('should have correct name and serviceType', () => {
    const up = createUpstashProvisioner()
    expect(up.name).toBe('upstash')
    expect(up.serviceType).toBe('cache')
  })

  it('should authenticate with email + api_key', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))
    const up = createUpstashProvisioner()
    const result = await up.authenticate({ email: 'a@b.com', api_key: 'up_key' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('a@b.com')
    }
  })

  it('should fail authenticate without credentials', async () => {
    const up = createUpstashProvisioner()
    const result = await up.authenticate({})
    expect(result.success).toBe(false)
  })

  it('should provision redis', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))
    const up = createUpstashProvisioner()
    await up.authenticate({ email: 'a@b.com', api_key: 'up_key' })

    mockFetch.mockResolvedValueOnce(mockJsonResponse({
      database_id: 'db_123',
      rest_url: 'https://upstash.io/redis',
      rest_token: 'token_abc',
    }))

    const result = await up.provision('my-app')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serviceType).toBe('cache')
      expect(result.data.envVars.HAI_CACHE_UPSTASH_URL).toBe('https://upstash.io/redis')
    }
  })
})

// =============================================================================
// R2
// =============================================================================

describe('r2 provisioner', () => {
  it('should have correct name and serviceType', () => {
    const r2 = createR2Provisioner()
    expect(r2.name).toBe('r2')
    expect(r2.serviceType).toBe('storage')
  })

  it('should authenticate with account_id + api_token', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: [] }))
    const r2 = createR2Provisioner()
    const result = await r2.authenticate({ account_id: 'acc_123', api_token: 'cf_token' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('acc_123')
    }
  })

  it('should fail authenticate without credentials', async () => {
    const r2 = createR2Provisioner()
    const result = await r2.authenticate({})
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// Resend
// =============================================================================

describe('resend provisioner', () => {
  it('should have correct name and serviceType', () => {
    const resend = createResendProvisioner()
    expect(resend.name).toBe('resend')
    expect(resend.serviceType).toBe('email')
  })

  it('should authenticate with api_key', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [] }))
    const resend = createResendProvisioner()
    const result = await resend.authenticate({ api_key: 're_xxx' })
    expect(result.success).toBe(true)
  })

  it('should provision (verify-only)', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [] }))
    const resend = createResendProvisioner()
    await resend.authenticate({ api_key: 're_xxx' })

    const result = await resend.provision('my-app')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serviceType).toBe('email')
      expect(result.data.envVars.HAI_REACH_RESEND_KEY).toBe('re_xxx')
    }
  })
})

// =============================================================================
// Aliyun
// =============================================================================

describe('aliyun provisioner', () => {
  it('should have correct name and serviceType', () => {
    const aliyun = createAliyunProvisioner()
    expect(aliyun.name).toBe('aliyun')
    expect(aliyun.serviceType).toBe('sms')
  })

  it('should authenticate with access_key_id + access_key_secret', async () => {
    const aliyun = createAliyunProvisioner()
    const result = await aliyun.authenticate({
      access_key_id: 'LTAI_xxx',
      access_key_secret: 'secret_xxx',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('LTAI_xxx')
    }
  })

  it('should fail authenticate without credentials', async () => {
    const aliyun = createAliyunProvisioner()
    const result = await aliyun.authenticate({})
    expect(result.success).toBe(false)
  })

  it('should provision (verify-only)', async () => {
    const aliyun = createAliyunProvisioner()
    await aliyun.authenticate({
      access_key_id: 'LTAI_xxx',
      access_key_secret: 'secret_xxx',
    })

    const result = await aliyun.provision('my-app')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serviceType).toBe('sms')
      expect(result.data.envVars.HAI_REACH_SMS_ACCESS_KEY).toBe('LTAI_xxx')
    }
  })
})
