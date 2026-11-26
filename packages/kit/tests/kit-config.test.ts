import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveKitServerConfig } from '../src/kit-config.js'
import { KitConfigSchema, resolveKitConfig, resolveKitTransportConfig } from '../src/kit-main.js'

const DEFAULT_SERVER = { host: '127.0.0.1', port: 3000 }

describe('kit server config', () => {
  beforeEach(() => {
    // 清除环境中可能存在的 HOST/PORT，保证默认值用例稳定
    vi.stubEnv('HOST', '')
    vi.stubEnv('PORT', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('默认监听 127.0.0.1:3000', () => {
    expect(resolveKitServerConfig()).toEqual(DEFAULT_SERVER)
  })

  it('读取配置文件中的 host/port', () => {
    expect(resolveKitServerConfig({ host: '0.0.0.0', port: 5173 })).toEqual({ host: '0.0.0.0', port: 5173 })
  })

  it('环境变量 HOST/PORT 高于配置文件', () => {
    vi.stubEnv('HOST', '10.0.0.5')
    vi.stubEnv('PORT', '9090')
    expect(resolveKitServerConfig({ host: '0.0.0.0', port: 5173 })).toEqual({ host: '10.0.0.5', port: 9090 })
  })

  it('忽略非法 PORT 环境变量并回退到配置文件值', () => {
    vi.stubEnv('PORT', 'not-a-number')
    expect(resolveKitServerConfig({ port: 5173 })).toEqual({ host: '127.0.0.1', port: 5173 })
  })

  it('resolveKitConfig 省略 server 时补齐默认值', () => {
    expect(resolveKitConfig({}).server).toEqual(DEFAULT_SERVER)
  })
})

describe('kit transport config', () => {
  beforeEach(() => {
    vi.stubEnv('HOST', '')
    vi.stubEnv('PORT', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('默认关闭 transport', () => {
    expect(resolveKitConfig({})).toEqual({
      server: DEFAULT_SERVER,
      transport: false,
      http: { trustedProxies: 'auto', access: false, rateLimit: false },
      cors: false,
      a2a: false,
    })
  })

  it('补齐 transport 默认值', () => {
    expect(resolveKitTransportConfig({
      excludePaths: ['/api/public'],
    })).toEqual({
      keyExchangePath: '/api/v1/_hai/key-exchange',
      excludePaths: ['/api/public'],
    })
  })

  it.each([
    { maxFutureSkewSeconds: 0, maxRequestAgeSeconds: 1 },
    { maxFutureSkewSeconds: 1800, maxRequestAgeSeconds: 3600 },
  ])('支持传输时间配置的边界值 %j', (timing) => {
    expect(KitConfigSchema.parse({
      transport: {
        keyExchangePath: '/custom/key-exchange',
        ...timing,
      },
    })).toEqual({
      server: DEFAULT_SERVER,
      http: { trustedProxies: 'auto', access: false, rateLimit: false },
      cors: false,
      a2a: false,
      transport: {
        keyExchangePath: '/custom/key-exchange',
        ...timing,
        excludePaths: [],
      },
    })
  })

  it.each([
    { maxFutureSkewSeconds: -1 },
    { maxFutureSkewSeconds: 1801 },
    { maxRequestAgeSeconds: 0 },
    { maxRequestAgeSeconds: 3601 },
  ])('拒绝非法传输时间范围 %j', (transport) => {
    expect(KitConfigSchema.safeParse({ transport }).success).toBe(false)
  })

  it.each([
    'custom/key-exchange',
    '/',
    '/portal/exchange/',
    '/portal/exchange?mode=demo',
  ])('拒绝不规范的 keyExchangePath %s', (keyExchangePath) => {
    expect(KitConfigSchema.safeParse({
      transport: { keyExchangePath },
    }).success).toBe(false)
  })

  it('a2A 端点和 CORS 采用共享配置及边界', () => {
    expect(KitConfigSchema.parse({ a2a: {} }).a2a).toEqual({
      cardPath: '/.well-known/agent-card.json',
      rpcPath: '/a2a',
    })
    expect(KitConfigSchema.parse({
      a2a: { cardPath: '/console/discover.json', rpcPath: '/console/call' },
      cors: {
        origin: ['https://orders.example.com'],
        credentials: true,
      },
    })).toMatchObject({
      a2a: { cardPath: '/console/discover.json', rpcPath: '/console/call' },
      cors: {
        origin: ['https://orders.example.com'],
        credentials: true,
      },
    })
    expect(KitConfigSchema.safeParse({
      a2a: { cardPath: '/a2a' },
    }).success).toBe(false)
    expect(KitConfigSchema.safeParse({
      cors: { origin: '*', credentials: true },
    }).success).toBe(false)
  })

  it('hTTP 读取新字段并拒绝旧配置，避免失去访问策略', () => {
    expect(KitConfigSchema.parse({
      http: {
        trustedProxies: ['192.0.2.10'],
        access: { file: './config/policy.yml' },
      },
    }).http).toEqual({
      trustedProxies: ['192.0.2.10'],
      access: { file: './config/policy.yml' },
      rateLimit: false,
    })
    expect(KitConfigSchema.safeParse({
      access: { file: './config/policy.yml' },
    }).success).toBe(false)
    expect(KitConfigSchema.safeParse({ trustedProxies: [] }).success).toBe(false)
  })

  it('从 http.rateLimit 读取窗口和次数，拒绝旧字段与非序列化依赖', () => {
    expect(KitConfigSchema.parse({
      http: {
        rateLimit: { maxRequests: 2 },
      },
    }).http.rateLimit)
      .toEqual({ maxRequests: 2, windowMs: 60_000 })
    expect(KitConfigSchema.safeParse({ rateLimit: false }).success).toBe(false)
    expect(KitConfigSchema.safeParse({
      http: {
        rateLimit: { windowMs: 0 },
      },
    }).success).toBe(false)
    expect(KitConfigSchema.safeParse({
      http: {
        rateLimit: { store: 'memory' },
      },
    }).success).toBe(false)
  })

  it.each(['HAI_KIT_ACCESS_FILE', 'HAI_KIT_TRUSTEDPROXIES', 'HAI_KIT_RATELIMIT'])('拒绝未迁移的进程变量 %s', (name) => {
    vi.stubEnv(name, 'legacy')
    expect(() => KitConfigSchema.parse({})).toThrow(name)
  })
})
