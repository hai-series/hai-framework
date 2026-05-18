import type { ServContext } from '../src/serv-context.js'
import { createApiContract } from '@h-ai/api-contract'
import { implement } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { serv } from '../src/serv-main.js'

const contract = createApiContract({})
const procedures = implement(contract).$context<ServContext>().router({})

describe('@h-ai/serv', () => {
  it('creates default context from request headers', () => {
    const request = new Request('https://api.test.local/health', {
      headers: {
        'authorization': 'Bearer access-token',
        'x-request-id': 'req_1',
        'x-real-ip': '127.0.0.1',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'vitest',
      },
    })

    const context = serv.parseRequestContext({ request })

    expect(context.accessToken).toBe('access-token')
    expect(context.requestId).toBe('req_1')
    expect(context.ip).toBe('127.0.0.1')
    expect(context.locale).toBe('en-US')
    expect(context.userAgent).toBe('vitest')
  })

  it('mounts health endpoints with security headers', async () => {
    const app = serv.createApp({ contract, procedures })

    const response = await app.request('/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('requires auth for protected docs page', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: {
        docs: { path: '/docs', requireAuth: true },
        openapi: { path: '/openapi.json' },
      },
    })

    const unauthorized = await app.request('/docs')
    expect(unauthorized.status).toBe(401)

    const authorized = await app.request('/docs', {
      headers: { authorization: 'Bearer access-token' },
    })
    expect(authorized.status).toBe(200)
    expect(authorized.headers.get('content-type')).toContain('text/html')
  })
})
