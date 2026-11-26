import type { HttpVerifyToken } from '@h-ai/core'
import type { ServContext } from '../src/serv-context.js'
import type { ServTransportConfig } from '../src/serv-transport.js'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { serv } from '../src/serv-main.js'

const contract = {
  read: apiContract.route({ method: 'GET', path: '/protected' }).output(apiContract.haiResultSchema(z.string())),
}

function createGuardedApp(
  verifyToken: HttpVerifyToken,
  transport?: ServTransportConfig,
) {
  const handler = vi.fn(() => core.ok('protected'))
  const procedures = serv.implement(contract).context<ServContext>().route('read').auth().handle(handler).build()
  return {
    app: serv.createApp({
      contract,
      procedures,
      auth: { verifyToken },
      transport,
    }),
    handler,
  }
}

describe('访问令牌校验失败的 HTTP 边界', () => {
  it('再次派发同一个 Fetch Request 时重新检查当前权限', async () => {
    const verifyToken = vi.fn<HttpVerifyToken>()
      .mockResolvedValueOnce(core.ok({
        userId: 'auditor',
        roles: ['auditor'],
        permissions: ['reports:read'],
      }))
      .mockResolvedValueOnce(core.err(HaiCommonError.UNAUTHORIZED, 'The session was revoked'))
    const { app, handler } = createGuardedApp(verifyToken)
    const request = new Request('https://api.example.test/api/v1/protected', {
      headers: { authorization: 'Bearer session-fixture' },
    })
    expect(await (await app.fetch(request)).json()).toEqual({ success: true, data: 'protected' })
    expect(await (await app.fetch(request)).json()).toMatchObject({
      success: false,
      error: { code: HaiCommonError.UNAUTHORIZED.code },
    })
    expect(verifyToken).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('没有令牌及明确的认证拒绝保持未认证语义', async () => {
    const verifyToken = vi.fn(async () => core.err(HaiCommonError.UNAUTHORIZED, 'Invalid credentials'))
    const { app, handler } = createGuardedApp(verifyToken)
    const anonymous = await app.request('/api/v1/protected')
    expect(verifyToken).not.toHaveBeenCalled()
    const rejected = await app.request('/api/v1/protected', {
      headers: { authorization: 'Bearer expired-fixture' },
    })
    for (const response of [anonymous, rejected]) {
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: HaiCommonError.UNAUTHORIZED.code, httpStatus: 401 },
      })
    }
    expect(verifyToken).toHaveBeenCalledOnce()
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    { httpStatus: 503, expected: 503 },
    { httpStatus: undefined, expected: 500 },
    { httpStatus: 200, expected: 500 },
  ])('依赖失败状态 $httpStatus 返回安全的 HTTP $expected 和关联日志', async ({ httpStatus, expected }) => {
    const cause = Object.assign(new Error('Database call failed'), { code: 'DB_FIXTURE', accessToken: 'private-fixture-token' })
    const { app, handler } = createGuardedApp(async () => core.err({
      code: 'fixture:identity',
      message: 'Private backend detail',
      httpStatus,
      cause,
    }))
    const logs: unknown[] = []
    const stop = core.logger.observe((record) => {
      if (record.message === 'Access token verification failed')
        logs.push(record)
    })
    try {
      const response = await app.request('/api/v1/protected', {
        headers: {
          'authorization': 'Bearer access-fixture',
          'x-request-id': 'verification-fixture',
          'x-hai-locale': 'en-US',
        },
      })
      expect(response.status).toBe(expected)
      expect(response.headers.get('x-trace-id')).toBe('verification-fixture')
      expect(await response.json()).toEqual({
        success: false,
        error: {
          ...HaiCommonError.INTERNAL_ERROR,
          httpStatus: expected,
          traceId: 'verification-fixture',
          message: 'Internal error (traceId: verification-fixture)',
        },
      })
    }
    finally { stop() }
    expect(handler).not.toHaveBeenCalled()
    expect(logs).toHaveLength(1)
    const output = JSON.stringify(logs)
    expect(output).toContain('verification-fixture')
    expect(output).toContain('DB_FIXTURE')
    expect(output).not.toContain('private-fixture-token')
  })

  it('验证器抛错时 typed client 返回 500，无需自动刷新', async () => {
    const verifyToken = vi.fn(async () => {
      throw new Error('Private verifier detail')
    })
    const { app, handler } = createGuardedApp(verifyToken)
    const client = apiClient.create(contract)
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input, init)))
    try {
      expect(await client.init({
        baseUrl: 'https://service.test/api/v1',
        auth: {
          storage: apiClient.tokenStorage.memory(),
          autoRefresh: true,
        },
        fetch,
      })).toMatchObject({ success: true })
      await client.auth.setTokens({ accessToken: 'access-fixture', refreshToken: 'refresh-fixture' })
      expect(await client.read()).toMatchObject({
        success: false,
        error: { code: HaiCommonError.INTERNAL_ERROR.code, httpStatus: 500 },
      })
      expect(verifyToken).toHaveBeenCalledOnce()
      expect(fetch).toHaveBeenCalledOnce()
      expect(handler).not.toHaveBeenCalled()
    }
    finally { await client.close() }
  })

  it('已认证的传输将校验依赖故障保留为加密 HTTP 503', async () => {
    try {
      expect(await cache.init({ type: 'memory' })).toMatchObject({ success: true })
      expect(await crypto.init()).toMatchObject({ success: true })
      const keys = crypto.asymmetric.generateKeyPair()
      if (!keys.success)
        throw new Error(keys.error.message)
      const { app, handler } = createGuardedApp(async () => core.err({
        code: 'fixture:identity',
        message: 'Private verifier detail',
        httpStatus: 503,
      }), {
        crypto,
        serverKeyRing: {
          activeKeyId: 'test-v1',
          keys: { 'test-v1': keys.data },
        },
        keyStore: crypto.transport.createKeyStore({ cache }),
      })
      const responses: Headers[] = []
      const client = crypto.transport.createClient({
        keyExchangeUrl: 'https://service.test/api/v1/_hai/key-exchange',
        fetch: async (input, init) => {
          const response = await app.fetch(new Request(input, init))
          responses.push(response.headers)
          return response
        },
      })
      try {
        const response = await client.encryptedFetch('https://service.test/api/v1/protected', {
          headers: { 'authorization': 'Bearer access-fixture', 'x-request-id': 'encrypted-verification' },
        })
        expect(response.status).toBe(503)
        expect(responses.at(-1)?.get(crypto.transport.protocol.ENCRYPTED_HEADER)).toBe(crypto.transport.protocol.ENCRYPTED_HEADER_VALUE)
        expect(response.headers.get('x-trace-id')).toBe('encrypted-verification')
        expect(await response.json()).toMatchObject({
          success: false,
          error: { code: HaiCommonError.INTERNAL_ERROR.code, httpStatus: 503, traceId: 'encrypted-verification' },
        })
        expect(handler).not.toHaveBeenCalled()
      }
      finally { client.destroy() }
    }
    finally {
      await crypto.close()
      await cache.close()
    }
  })
})
