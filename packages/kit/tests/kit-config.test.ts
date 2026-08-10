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
    expect(resolveKitConfig({})).toEqual({ server: DEFAULT_SERVER, transport: false })
  })

  it('补齐 transport 默认值', () => {
    expect(resolveKitTransportConfig({ excludePaths: ['/api/public'] })).toEqual({
      keyExchangePath: '/api/_hai/key-exchange',
      excludePaths: ['/api/public'],
      requireEncryption: true,
      encryptResponse: true,
      maxClients: 10000,
    })
  })

  it('支持自定义 transport 配置', () => {
    expect(KitConfigSchema.parse({
      transport: {
        keyExchangePath: '/custom/key-exchange',
        requireEncryption: false,
        encryptResponse: false,
        maxClients: 32,
      },
    })).toEqual({
      server: DEFAULT_SERVER,
      transport: {
        keyExchangePath: '/custom/key-exchange',
        excludePaths: [],
        requireEncryption: false,
        encryptResponse: false,
        maxClients: 32,
      },
    })
  })

  it('拒绝不合法的 keyExchangePath', () => {
    expect(() => KitConfigSchema.parse({
      transport: { keyExchangePath: 'custom/key-exchange' },
    })).toThrow('path must start with /')
  })
})
