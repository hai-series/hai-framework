import type { HttpBindings } from '@hono/node-server'
import type { ServRpcHttpConfig } from '../src/serv-config.js'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireInternalRPC } from '../src/pipelines/serv-pipeline-require-internal-rpc.js'
import { securityHeaders } from '../src/pipelines/serv-pipeline-security-headers.js'

function createNodeBindings(remoteAddress: string): HttpBindings {
  const socket = new Socket()
  Object.defineProperty(socket, 'remoteAddress', { value: remoteAddress })
  Object.defineProperty(socket, 'remotePort', { value: 12345 })
  Object.defineProperty(socket, 'remoteFamily', { value: remoteAddress.includes(':') ? 'IPv6' : 'IPv4' })
  const incoming = new IncomingMessage(socket)
  const outgoing = new ServerResponse(incoming)
  return { incoming, outgoing }
}

function createInternalRpcApp(config: ServRpcHttpConfig) {
  const app = new Hono<{ Bindings: HttpBindings }>()
  app.use('/rpc/*', requireInternalRPC(config))
  app.get('/rpc/test', c => c.text('ok'))
  return app
}

async function requestWithRemoteAddress(
  app: ReturnType<typeof createInternalRpcApp>,
  remoteAddress: string,
  init?: RequestInit,
): Promise<Response> {
  return await app.fetch(new Request('http://test.local/rpc/test', init), createNodeBindings(remoteAddress))
}

describe('pipeline.hono.securityHeaders', () => {
  it('adds standard security headers to responses', async () => {
    const app = new Hono()
    app.use('*', securityHeaders())
    app.get('/', c => c.text('ok'))

    const response = await app.request('/')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

describe('pipeline.hono.requireInternalRPC', () => {
  it('rejects loopback access from non-loopback IP', async () => {
    const app = createInternalRpcApp({ prefix: '/rpc', access: 'loopback' })

    const response = await requestWithRemoteAddress(app, '8.8.8.8')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: 'hai:common:101',
        message: '无权执行该操作',
        httpStatus: 403,
        system: 'hai',
        module: 'common',
      },
    })
  })

  it('rejects spoofed forwarded loopback headers from external IP', async () => {
    const app = createInternalRpcApp({ prefix: '/rpc', access: 'loopback' })

    const response = await requestWithRemoteAddress(app, '8.8.8.8', {
      headers: { 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' },
    })
    expect(response.status).toBe(403)
  })

  it('allows loopback access from 127.0.0.1', async () => {
    const app = createInternalRpcApp({ prefix: '/rpc', access: 'loopback' })

    const response = await requestWithRemoteAddress(app, '127.0.0.1')
    expect(response.status).toBe(200)
  })

  it('allows private-network IPs in 10.0.0.0/8', async () => {
    const app = createInternalRpcApp({ prefix: '/rpc', access: 'private-network' })

    const ok = await requestWithRemoteAddress(app, '10.0.0.5')
    expect(ok.status).toBe(200)

    const denied = await requestWithRemoteAddress(app, '8.8.8.8')
    expect(denied.status).toBe(403)
  })

  it('gateway-only requires matching secret header', async () => {
    const app = new Hono()
    app.use('/rpc/*', requireInternalRPC({
      prefix: '/rpc',
      access: 'gateway-only',
      gatewayHeader: 'x-hai-internal-rpc',
      gatewaySecret: 'secret',
    }))
    app.get('/rpc/test', c => c.text('ok'))

    const denied = await app.request('/rpc/test')
    expect(denied.status).toBe(403)

    const allowed = await app.request('/rpc/test', {
      headers: { 'x-hai-internal-rpc': 'secret' },
    })
    expect(allowed.status).toBe(200)
  })
})
