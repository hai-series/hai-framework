import type { HttpA2AHandler } from '@h-ai/core'
import type { RequestEvent } from '@sveltejs/kit'
import { core, HaiCommonError } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { describe, expect, it, vi } from 'vitest'

function event(path: string, init?: RequestInit): RequestEvent {
  const url = new URL(path, 'https://orders.example.test')
  return {
    url,
    request: new Request(url, init),
    getClientAddress: () => '192.0.2.5',
    locals: {},
    cookies: {
      get: () => undefined,
    },
    route: { id: null },
  } as RequestEvent
}

describe('kit 挂载共享 A2A HTTP 处理器', () => {
  it('子目录请求先通过访问策略和限流，再由 A2A 使用专用认证', async () => {
    const a2a: HttpA2AHandler = {
      cardPath: '/console/.well-known/agent-card.json',
      rpcPath: '/console/a2a',
      handleRequest: vi.fn(async (request, id) => {
        if (request.method === 'GET')
          return Response.json({ name: 'orders', id })
        return new Response(null, {
          status: request.headers.get('x-agent-key')
            ? 200
            : 401,
        })
      }),
    }
    const verifyToken = vi.fn(async () => core.err(HaiCommonError.UNAUTHORIZED))
    const keyGenerator = vi.fn(() => 'web-session')
    const resolve = vi.fn(() => new Response('SvelteKit'))
    const handle = kit.createHandle({
      logging: false,
      a2a,
      auth: {
        verifyToken,
        protectedPaths: ['/console/**'],
      },
      http: {
        rateLimit: {
          maxRequests: 2,
          store: core.access.createMemoryRateLimitStore(),
          keyGenerator,
        },
        access: {
          rules: [
            {
              id: 'rpc',
              paths: ['/console/a2a'],
              allowIps: ['192.0.2.0/24'],
            },
          ],
        },
      },
    })
    const card = await handle({
      event: event(a2a.cardPath),
      resolve,
    })
    expect(card.status).toBe(200)
    expect(await card.json()).toMatchObject({
      name: 'orders',
      id: card.headers.get('x-request-id'),
    })
    const rpcRequest = {
      method: 'POST',
      headers: { authorization: 'Bearer browser' },
    }
    const denied = await handle({
      event: event(a2a.rpcPath, rpcRequest),
      resolve,
    })
    expect(denied.status).toBe(401)
    const limited = await handle({
      event: event(a2a.rpcPath, rpcRequest),
      resolve,
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    expect(a2a.handleRequest).toHaveBeenCalledTimes(2)
    expect(verifyToken).not.toHaveBeenCalled()
    expect(keyGenerator).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('不允许发布被配置为必须使用 Hai 信封的 RPC', () => {
    expect(() => kit.createHandle({
      a2a: {
        cardPath: '/.well-known/agent-card.json',
        rpcPath: '/a2a',
        handleRequest: async () => null,
      },
      http: {
        access: {
          rules: [
            {
              id: 'encrypted',
              paths: ['/a2a'],
              encryption: 'required',
            },
          ],
        },
      },
    })).toThrow('A2A endpoints')
  })
})
