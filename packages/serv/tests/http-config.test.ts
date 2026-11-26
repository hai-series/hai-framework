import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveServConfig, resolveServHttpConfig, resolveServServerConfig, ServConfigSchema } from '../src/serv-config.js'

describe('serv transport time config', () => {
  it.each([
    { maxFutureSkewSeconds: 0, maxRequestAgeSeconds: 1 },
    { maxFutureSkewSeconds: 1800, maxRequestAgeSeconds: 3600 },
  ])('保留传输时间配置的边界值 %j', (transport) => {
    expect(ServConfigSchema.parse({ transport }).transport).toMatchObject(transport)
  })

  it.each([
    { maxFutureSkewSeconds: -1 },
    { maxFutureSkewSeconds: 1801 },
    { maxRequestAgeSeconds: 0 },
    { maxRequestAgeSeconds: 3601 },
  ])('拒绝非法传输时间范围 %j', (transport) => {
    expect(ServConfigSchema.safeParse({ transport }).success).toBe(false)
  })
})

describe('resolveServServerConfig', () => {
  beforeEach(() => {
    // 清除环境中可能存在的 HOST/PORT，保证默认值用例稳定
    vi.stubEnv('HOST', '')
    vi.stubEnv('PORT', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to 127.0.0.1:3000', () => {
    expect(resolveServServerConfig()).toEqual({ host: '127.0.0.1', port: 3000 })
  })

  it('reads host/port from config file', () => {
    expect(resolveServServerConfig({ host: '0.0.0.0', port: 8080 })).toEqual({ host: '0.0.0.0', port: 8080 })
  })

  it('lets HOST/PORT env override config file', () => {
    vi.stubEnv('HOST', '10.0.0.5')
    vi.stubEnv('PORT', '9090')
    expect(resolveServServerConfig({ host: '0.0.0.0', port: 8080 })).toEqual({ host: '10.0.0.5', port: 9090 })
  })

  it('ignores invalid PORT env and keeps config file value', () => {
    vi.stubEnv('PORT', 'not-a-number')
    expect(resolveServServerConfig({ port: 8080 })).toEqual({ host: '127.0.0.1', port: 8080 })
  })

  it('rejects out-of-range port from config file', () => {
    expect(() => resolveServServerConfig({ port: 70000 })).toThrow()
  })

  it('fills server defaults in resolveServConfig when omitted', () => {
    expect(resolveServConfig({}).server).toEqual({ host: '127.0.0.1', port: 3000 })
  })

  it('parses server from _serv.yml style config', () => {
    expect(resolveServConfig({
      server: { host: '0.0.0.0', port: 4000 },
    }).server).toEqual({ host: '0.0.0.0', port: 4000 })
  })
})

describe('resolveServHttpConfig', () => {
  it('returns sane defaults when input omitted', () => {
    const config = resolveServHttpConfig()
    expect(config.apiPrefix).toBe('/api/v1')
    expect(config.rateLimit).toBe(false)
    expect(config.openapi).toBe(false)
    expect(config.docs).toBe(false)
    expect(config.health).toEqual({ path: '/health', readyPath: '/ready' })
  })

  it('限流由 HTTP 配置启用，保留显式上限并填充窗口', () => {
    expect(ServConfigSchema.parse({
      http: {
        rateLimit: { maxRequests: 2 },
      },
    }).http.rateLimit).toEqual({
      maxRequests: 2,
      windowMs: 60_000,
    })
    expect(ServConfigSchema.safeParse({
      http: {
        rateLimit: { windowMs: 0 },
      },
    }).success).toBe(false)
    expect(ServConfigSchema.safeParse({
      http: {
        rateLimit: { store: {} },
      },
    }).success).toBe(false)
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

  it.each([
    '/api/v1',
    '/v1',
    '/somepath/api/v1',
    '/some.path/api/v1',
  ])('接受完整 API 前缀 %s', (apiPrefix) => {
    expect(ServConfigSchema.parse({
      http: { apiPrefix },
    }).http.apiPrefix).toBe(apiPrefix)
  })

  it.each([
    'api/v1',
    '//host/api',
    '/x//api',
    '/x/../api',
    '/x/./api',
    '/x/%2e%2e/api',
    '/x?query',
    '/x#fragment',
    '/x y',
    '/',
    '/somepath/api/v1/',
  ])('拒绝不合法 API 前缀 %s', (apiPrefix) => {
    expect(ServConfigSchema.safeParse({
      http: { apiPrefix },
    }).success).toBe(false)
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
    expect(config.cors).toBe(false)
    expect(config.transport).toBe(false)
    expect(config.a2a).toBe(false)
    expect(config.audio).toBe(false)
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

    expect(config.cors).toMatchObject({
      origin: 'https://app.example.com',
      nativeOrigins: 'capacitor://localhost,tauri://localhost',
      allowedHeaders: ['Authorization', 'X-Client-Id'],
      exposedHeaders: ['X-Encrypted'],
      credentials: true,
    })
    expect(ServConfigSchema.safeParse({
      cors: { origin: '*', credentials: true },
    }).success).toBe(false)
  })

  it('a2A 保留站点端点，语音在业务前缀下解析默认端点', () => {
    const config = ServConfigSchema.parse({
      http: { apiPrefix: '/custom/api' },
      a2a: {},
      audio: {},
    })
    expect(config.a2a).toEqual({ cardPath: '/.well-known/agent-card.json', rpcPath: '/a2a' })
    expect(config.audio).toEqual({ path: '/custom/api/ai/audio' })
    expect(ServConfigSchema.parse({
      audio: { path: '/voice/socket' },
    }).audio).toEqual({ path: '/voice/socket' })
    expect(ServConfigSchema.safeParse({
      audio: { path: '/voice/socket?mode=debug' },
    }).success).toBe(false)
    expect(ServConfigSchema.safeParse({
      a2a: { cardPath: '/a2a' },
    }).success).toBe(false)
  })

  it('fills transport defaults from _serv.yml config', () => {
    const config = resolveServConfig({
      transport: {},
    })

    expect(config.transport).toEqual({
      keyExchangePath: '/api/v1/_hai/key-exchange',
      excludePaths: [],
    })
  })

  it('保留独立于 API 前缀的密钥协商路径', () => {
    const transport = { keyExchangePath: '/gateway/key-exchange' }
    expect(ServConfigSchema.parse({
      http: { apiPrefix: '/custom/api' },
      transport,
    }).transport).toMatchObject(transport)
    expect(ServConfigSchema.safeParse({
      transport: { keyExchangePath: '/gateway/key-exchange?mode=debug' },
    }).success).toBe(false)
  })
})
