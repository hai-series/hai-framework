import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiInit = vi.fn(async () => undefined)
const apiClose = vi.fn(async () => undefined)
const createLocalStorageTokenStorage = vi.fn(() => ({ kind: 'local-storage' }))
const cryptoInit = vi.fn(async () => ({ success: true as const, data: undefined }))
const cryptoClose = vi.fn(async () => ({ success: true as const, data: undefined }))
const navigate = vi.fn()

vi.mock('@h-ai/api-client', () => ({
  api: {
    init: apiInit,
    close: apiClose,
  },
  createLocalStorageTokenStorage,
}))

vi.mock('@h-ai/crypto', () => ({
  crypto: {
    init: cryptoInit,
    close: cryptoClose,
  },
}))

vi.mock('../src/lib/router.svelte.js', () => ({ navigate }))

describe('desktop api bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('从 config/_crypto.yml 解析默认 transport 配置', async () => {
    const { desktopCryptoConfig } = await import('../src/lib/crypto-config.js')

    expect(desktopCryptoConfig.transport).toEqual({
      keyExchangePath: '/_hai/key-exchange',
    })
  })

  it('initApi 启动 crypto transport 并初始化 api-client', async () => {
    const { initApi } = await import('../src/lib/api.js')

    await initApi()

    expect(cryptoInit).toHaveBeenCalledTimes(1)
    expect(createLocalStorageTokenStorage).toHaveBeenCalledTimes(1)
    expect(apiInit).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://localhost:3000/api/v1',
      transport: expect.objectContaining({
        keyExchangePath: '/_hai/key-exchange',
      }),
      auth: expect.objectContaining({
        refreshPath: '/auth/refresh',
        storage: { kind: 'local-storage' },
      }),
    }))
  })

  it('closeApi 会按顺序关闭 api-client 与 crypto', async () => {
    const { initApi, closeApi } = await import('../src/lib/api.js')

    await initApi()
    await closeApi()

    expect(apiClose).toHaveBeenCalledTimes(1)
    expect(cryptoClose).toHaveBeenCalledTimes(1)
  })
})
