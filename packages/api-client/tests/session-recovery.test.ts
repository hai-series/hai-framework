/** 明确失效后只重发被拒绝的请求；错误密码、未知网络结果和身份切换不触发重放。 */
import { apiContract } from '@h-ai/api-contract'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiClient } from '../src/index.js'

const contract = {
  save: apiContract.route({ method: 'POST', path: '/save' }).input(z.object({ draft: z.string() })).output(apiContract.haiResultSchema(z.object({ saved: z.boolean() }))),
}
const denied = (code = 'hai:iam:105') => Response.json({ success: false, error: { code, message: 'Rejected', httpStatus: 401 } }, { status: 401 })

describe('in-place session recovery', () => {
  it.each([true, undefined])('成功或无有效失败包络时不因额外错误字段重放写入：success=%s', async (success) => {
    const client = apiClient.create(contract)
    const reauthorize = vi.fn(async () => 'unused-proof')
    const fetch = vi.fn(async () => Response.json({ success, data: { saved: true }, error: { code: 'hai:iam:027' } }))
    try {
      await client.init({ baseUrl: 'https://app.test/api', fetch })
      await client.save({ draft: 'draft' }, { context: { reauthorize } })
      expect(fetch).toHaveBeenCalledOnce()
      expect(reauthorize).not.toHaveBeenCalled()
    }
    finally { await client.close() }
  })

  it.each([false, true])('刷新后缺少授权回调或取消确认时不重放旧票据：cancel=%s', async (cancel) => {
    const client = apiClient.create(contract)
    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('expired')
    await storage.setRefreshToken('refresh-token')
    let businessRequests = 0
    const fetch: typeof globalThis.fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      if (request.url.endsWith('/auth/refresh'))
        return Response.json({ success: true, data: { tokens: { accessToken: 'rotated', refreshToken: 'rotated-refresh', expiresIn: 3600, tokenType: 'Bearer' } } })
      businessRequests++
      return denied()
    }
    try {
      await client.init({ baseUrl: 'https://app.test/api', fetch, auth: { storage } })
      expect((await client.save({ draft: 'kept input' }, { context: { reauthentication: 'old-proof', ...(cancel ? { reauthorize: async () => null } : {}) } })).success).toBe(false)
      expect(businessRequests).toBe(1)
    }
    finally { await client.close() }
  })

  it.each(['refresh', 'reauthentication'] as const)('%s 后敏感请求重新确认用途，不复用旧证明', async (scenario) => {
    const client = apiClient.create(contract)
    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('expired')
    await storage.setRefreshToken('refresh-token')
    const proofs: (string | null)[] = []
    const reauthorize = vi.fn(async () => 'new-proof')
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      if (request.url.endsWith('/auth/refresh'))
        return Response.json({ success: true, data: { tokens: { accessToken: 'rotated', refreshToken: 'new-refresh', expiresIn: 3600, tokenType: 'Bearer' } } })
      proofs.push(request.headers.get('x-hai-reauthentication'))
      return proofs.length === 1 ? denied(scenario === 'reauthentication' ? 'hai:iam:027' : undefined) : Response.json({ success: true, data: { saved: true } })
    }
    try {
      await client.init({ baseUrl: 'https://app.test/api', fetch, auth: { storage } })
      expect(await client.save({ draft: 'kept input' }, { context: { reauthentication: 'old-proof', reauthorize } })).toMatchObject({ success: true, data: { saved: true } })
      expect(proofs).toEqual(['old-proof', 'new-proof'])
      expect(reauthorize).toHaveBeenCalledOnce()
    }
    finally { await client.close() }
  })

  it.each(['memory', 'cookie'] as const)('%s storage: 401+failed refresh后原地登录并保留POST正文，最多重试一次', async (mode) => {
    const client = apiClient.create(contract)
    const storage = mode === 'cookie' ? apiClient.tokenStorage.httpOnlyCookie() : apiClient.tokenStorage.memory()
    await storage.setAccessToken('expired')
    if (mode === 'memory')
      await storage.setRefreshToken('expired-refresh')
    const bodies: unknown[] = []
    const recoverSession = vi.fn(async () => {
      await client.auth.setTokens({ accessToken: 'restored', refreshToken: 'restored-refresh', expiresIn: 3600, tokenType: 'Bearer' })
      return true
    })
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      if (request.url.endsWith('/auth/refresh'))
        return denied()
      bodies.push(await request.json())
      expect(request.headers.get('x-hai-terminal')).toBe('app')
      return request.headers.get('authorization') === 'Bearer restored' ? Response.json({ success: true, data: { saved: true } }) : denied()
    }
    try {
      expect((await client.init({ baseUrl: 'https://app.test/api', fetch, auth: { storage, recoverSession, terminalType: 'app' } })).success).toBe(true)
      expect(await client.save({ draft: 'Unsaved form' })).toEqual({ success: true, data: { saved: true } })
      expect(recoverSession).toHaveBeenCalledTimes(1)
      expect(bodies).toEqual([{ draft: 'Unsaved form' }, { draft: 'Unsaved form' }])
    }
    finally { await client.close() }
  })

  it.each(['hai:iam:002', 'hai:iam:027'])('凭据或二次认证错误 %s 不误当成会话过期', async (code) => {
    const client = apiClient.create(contract)
    const recoverSession = vi.fn(async () => true)
    const fetch = vi.fn(async () => denied(code))
    try {
      await client.init({ baseUrl: 'https://app.test/api', fetch, auth: { recoverSession } })
      expect((await client.save({ draft: 'draft' })).success).toBe(false)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(recoverSession).not.toHaveBeenCalled()
    }
    finally { await client.close() }
  })

  it.each(['network', 'refresh-server', 'cancel'] as const)('%s 不重放业务写入', async (scenario) => {
    const client = apiClient.create(contract)
    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('expired')
    await storage.setRefreshToken('refresh')
    const recoverSession = vi.fn(async () => false)
    let businessRequests = 0
    const fetch: typeof globalThis.fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      if (request.url.endsWith('/auth/refresh'))
        return scenario === 'refresh-server' ? new Response('Unavailable', { status: 503 }) : denied()
      businessRequests++
      if (scenario === 'network')
        throw new TypeError('Connection closed after send')
      return denied()
    }
    try {
      await client.init({ baseUrl: 'https://app.test/api', fetch, auth: { storage, recoverSession } })
      expect((await client.save({ draft: 'draft' })).success).toBe(false)
      expect(businessRequests).toBe(1)
      expect(recoverSession).toHaveBeenCalledTimes(scenario === 'cancel' ? 1 : 0)
    }
    finally { await client.close() }
  })
})
