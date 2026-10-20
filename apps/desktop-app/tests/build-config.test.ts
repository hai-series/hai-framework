import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopBuildConfig } from '../config-env.js'

afterEach(() => vi.unstubAllEnvs())

describe('desktop build environment', () => {
  it('公开字段过滤之前拒绝非法 transport 类型及路径', () => {
    for (const value of ['true', 'invalid', '{keyExchangePath: relative}']) {
      vi.stubEnv('HAI_CRYPTO_TRANSPORT', value)
      expect(() => desktopBuildConfig('test')).toThrow()
    }
  })

  it('合法环境值经过同一 Schema 校验后只输出公开路径', () => {
    vi.stubEnv('HAI_CRYPTO_TRANSPORT', '{keyExchangePath: /custom-exchange, privateKey: hidden}')
    expect(JSON.parse(desktopBuildConfig('test'))).toEqual({ transport: { keyExchangePath: '/custom-exchange' } })
    vi.stubEnv('HAI_CRYPTO_TRANSPORT', 'false')
    expect(JSON.parse(desktopBuildConfig('test'))).toEqual({ transport: false })
  })
})
