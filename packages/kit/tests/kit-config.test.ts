import { describe, expect, it } from 'vitest'
import { KitConfigSchema, resolveKitConfig, resolveKitTransportConfig } from '../src/kit-main.js'

describe('kit transport config', () => {
  it('默认关闭 transport', () => {
    expect(resolveKitConfig({})).toEqual({ transport: false })
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
