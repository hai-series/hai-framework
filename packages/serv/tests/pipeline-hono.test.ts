import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireInternalRPC, securityHeaders } from '../src/serv-pipeline.js'

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
    const app = new Hono()
    app.use('/rpc/*', requireInternalRPC({ prefix: '/rpc', access: 'loopback' }))
    app.get('/rpc/test', c => c.text('ok'))

    const response = await app.request('/rpc/test', {
      headers: { 'x-real-ip': '8.8.8.8' },
    })
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

  it('allows loopback access from 127.0.0.1', async () => {
    const app = new Hono()
    app.use('/rpc/*', requireInternalRPC({ prefix: '/rpc', access: 'loopback' }))
    app.get('/rpc/test', c => c.text('ok'))

    const response = await app.request('/rpc/test', {
      headers: { 'x-real-ip': '127.0.0.1' },
    })
    expect(response.status).toBe(200)
  })

  it('allows private-network IPs in 10.0.0.0/8', async () => {
    const app = new Hono()
    app.use('/rpc/*', requireInternalRPC({ prefix: '/rpc', access: 'private-network' }))
    app.get('/rpc/test', c => c.text('ok'))

    const ok = await app.request('/rpc/test', { headers: { 'x-real-ip': '10.0.0.5' } })
    expect(ok.status).toBe(200)

    const denied = await app.request('/rpc/test', { headers: { 'x-real-ip': '8.8.8.8' } })
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
