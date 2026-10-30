import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { securityHeaders } from '../src/pipelines/serv-pipeline-security-headers.js'

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
