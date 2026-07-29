import { describe, expect, it } from 'vitest'
import { resolveServConfig, resolveServHttpConfig } from '../src/serv-config.js'

describe('resolveServHttpConfig', () => {
  it('returns sane defaults when input omitted', () => {
    const config = resolveServHttpConfig()
    expect(config.apiPrefix).toBe('/api/v1')
    expect(config.openapi).toBe(false)
    expect(config.docs).toBe(false)
    expect(config.rpc).toBe(false)
    expect(config.health).toEqual({ path: '/health', readyPath: '/ready' })
  })

  it('accepts partial overrides and fills defaults', () => {
    const config = resolveServHttpConfig({
      apiPrefix: '/api/v2',
      openapi: { path: '/openapi.json' },
      docs: {},
    })
    expect(config.apiPrefix).toBe('/api/v2')
    expect(config.openapi).toEqual({ path: '/openapi.json' })
    expect(config.docs).toEqual({ path: '/docs' })
  })

  it('accepts false to disable health', () => {
    const config = resolveServHttpConfig({ health: false })
    expect(config.health).toBe(false)
  })

  it('rejects apiPrefix that does not start with /api/', () => {
    expect(() => resolveServHttpConfig({ apiPrefix: '/v1' as `/api/${string}` })).toThrow()
  })

  it('rpc defaults to loopback access', () => {
    const config = resolveServHttpConfig({ rpc: {} })
    expect(config.rpc).toEqual({ prefix: '/rpc', access: 'loopback' })
  })

  it('parses _serv.yml style config and fills top-level defaults', () => {
    const config = resolveServConfig({
      http: {
        docs: {},
      },
    })

    expect(config.http.apiPrefix).toBe('/api/v1')
    expect(config.http.docs).toEqual({ path: '/docs' })
    expect(config.http.health).toEqual({ path: '/health', readyPath: '/ready' })
    expect(config.cors).toEqual({
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
      exposedHeaders: [],
      credentials: false,
    })
    expect(config.transport).toBe(false)
  })

  it('parses cross-client CORS headers from _serv.yml config', () => {
    const config = resolveServConfig({
      cors: {
        origin: 'https://app.example.com',
        nativeOrigins: 'capacitor://localhost,tauri://localhost',
        allowedHeaders: ['Authorization', 'X-Client-Id'],
        exposedHeaders: ['X-Encrypted'],
        credentials: true,
      },
    })

    expect(config.cors.origin).toBe('https://app.example.com')
    expect(config.cors.nativeOrigins).toBe('capacitor://localhost,tauri://localhost')
    expect(config.cors.allowedHeaders).toContain('X-Client-Id')
    expect(config.cors.exposedHeaders).toEqual(['X-Encrypted'])
    expect(config.cors.credentials).toBe(true)
  })

  it('fills transport defaults from _serv.yml config', () => {
    const config = resolveServConfig({
      transport: {},
    })

    expect(config.transport).toEqual({
      keyExchangePath: '/_hai/key-exchange',
      excludePaths: [],
      maxClients: 10000,
    })
  })
})
