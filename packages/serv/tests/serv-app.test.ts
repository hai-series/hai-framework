import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { serv } from '../src/serv-main.js'

const contract = apiContract.create({})
const procedures = serv.implement(contract).$context<ServContext>().router({})

describe('@h-ai/serv', () => {
  it('keeps root API focused on runtime-level helpers', () => {
    expect(typeof serv.toFetch).toBe('function')
    expect(typeof serv.cors).toBe('function')
    expect(typeof serv.storageAssets).toBe('function')
    expect('createDocsPage' in serv).toBe(false)
    expect('securityHeaders' in serv).toBe(false)
    expect('requireInternalRPC' in serv).toBe(false)
  })

  it('creates default context from request headers', () => {
    const request = new Request('https://api.test.local/health', {
      headers: {
        'authorization': 'Bearer access-token',
        'x-request-id': 'req_1',
        'x-real-ip': '127.0.0.1',
        'accept-language': 'en,en;q=0.9',
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

  it('mounts custom middlewares before built-in routes', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      middlewares: [
        {
          path: '/health',
          middleware: c => c.text('intercepted', 418),
        },
      ],
    })

    const response = await app.request('/health')

    expect(response.status).toBe(418)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('intercepted')
  })

  it('allows a path-scoped middleware to terminate with a binary response', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      middlewares: [
        {
          path: '/assets/*',
          middleware: c => c.body(new Uint8Array([0x89, 0x50, 0x4E, 0x47]), 200, {
            'cache-control': 'public, max-age=60',
            'content-type': 'image/png',
          }),
        },
      ],
    })

    const response = await app.request('/assets/example.png')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0x89, 0x50, 0x4E, 0x47])
  })

  it('supports path-scoped custom middlewares', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { openapi: { path: '/openapi.json' } },
      middlewares: [
        {
          path: '/openapi.json',
          middleware: async (c, next) => {
            await next()
            c.header('x-serv-custom-pipeline', '1')
          },
        },
      ],
    })

    const openapi = await app.request('/openapi.json')
    expect(openapi.headers.get('x-serv-custom-pipeline')).toBe('1')

    const health = await app.request('/health')
    expect(health.headers.get('x-serv-custom-pipeline')).toBeNull()
  })

  it('provides reusable CORS middleware for preflight and actual responses', async () => {
    const origin = 'http://localhost:5176'
    const app = serv.createApp({
      contract,
      procedures,
      middlewares: [
        {
          middleware: serv.cors({
            origin: currentOrigin => currentOrigin === origin,
            credentials: true,
            allowedHeaders: ['Content-Type', 'X-Encrypted'],
            exposedHeaders: ['X-Encrypted'],
          }),
        },
      ],
    })

    const preflight = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type, x-encrypted',
      },
    })

    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-encrypted')

    const response = await app.request('/health', {
      headers: { origin },
    })
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-expose-headers')).toContain('X-Encrypted')
  })

  it('requires verified auth for protected docs page', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      verifyToken: async token => token === 'valid-token'
        ? ok({ userId: 'user-1', roles: [], permissions: [] })
        : err(HaiCommonError.UNAUTHORIZED, 'invalid token'),
      http: {
        docs: { path: '/docs', requireAuth: true },
        openapi: { path: '/openapi.json' },
      },
    })

    const missingToken = await app.request('/docs', {
      headers: { 'accept-language': 'zh-CN' },
    })
    expect(missingToken.status).toBe(401)
    expect(await missingToken.json()).toEqual({
      success: false,
      error: {
        code: 'hai:common:100',
        message: '未登录或登录已失效',
        httpStatus: 401,
        system: 'hai',
        module: 'common',
      },
    })

    const invalidToken = await app.request('/docs', {
      headers: { authorization: 'Bearer invalid-token' },
    })
    expect(invalidToken.status).toBe(401)

    const authorized = await app.request('/docs', {
      headers: { authorization: 'Bearer valid-token' },
    })
    expect(authorized.status).toBe(200)
    expect(authorized.headers.get('content-type')).toContain('text/html')
  })

  it('serves local Scalar script for docs page', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: {
        docs: { path: '/docs' },
        openapi: { path: '/openapi.json' },
      },
    })

    const docs = await app.request('/docs')
    expect(docs.status).toBe(200)
    expect(await docs.text()).toContain('/_hai/scalar.js')

    const script = await app.request('/_hai/scalar.js')
    expect(script.status).toBe(200)
    expect(script.headers.get('content-type')).toContain('application/javascript')
    expect(await script.text()).toContain('createApiReference')
  })
})
