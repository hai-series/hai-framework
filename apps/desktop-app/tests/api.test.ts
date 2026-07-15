import { beforeEach, describe, expect, it, vi } from 'vitest'

type ClientInitResult = { success: true, data: undefined } | { success: false, error: { code: string, message: string } }

const createdClient = {
  init: vi.fn<() => Promise<ClientInitResult>>(async () => ({ success: true, data: undefined })),
  close: vi.fn(async () => undefined),
}
const apiInit = vi.fn(async () => undefined)
const apiClose = vi.fn(async () => undefined)
const apiCreate = vi.fn(() => createdClient)
const memoryTokenStorage = vi.fn(() => ({ kind: 'memory' }))
const cryptoInit = vi.fn(async () => ({ success: true as const, data: undefined }))
const cryptoClose = vi.fn(async () => ({ success: true as const, data: undefined }))
const navigate = vi.fn()

vi.mock('@h-ai/api-client', () => ({
  apiClient: {
    init: apiInit,
    close: apiClose,
    create: apiCreate,
    tokenStorage: {
      memory: memoryTokenStorage,
    },
  },
}))

vi.mock('@h-ai/api-service-contract', () => ({
  apiServiceContract: { kind: 'api-service-contract' },
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
    createdClient.init.mockClear()
    createdClient.init.mockResolvedValue({ success: true, data: undefined })
    createdClient.close.mockClear()
  })

  it('从 config/_crypto.yml 解析默认 transport 配置', async () => {
    const { desktopCryptoConfig } = await import('../src/lib/crypto-config.js')

    expect(desktopCryptoConfig.transport).toEqual({
      keyExchangePath: '/_hai/key-exchange',
    })
  })

  it('initApi 启动 crypto transport 并初始化 api-client', async () => {
    const { desktopApiClient, initApi } = await import('../src/lib/api.js')

    await initApi()

    expect(cryptoInit).toHaveBeenCalledTimes(1)
    expect(apiCreate).toHaveBeenCalledTimes(1)
    expect(desktopApiClient).toBe(createdClient)
    expect(memoryTokenStorage).toHaveBeenCalledTimes(1)
    expect(createdClient.init).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://localhost:3000/api/v1',
      transport: expect.objectContaining({
        keyExchangePath: '/_hai/key-exchange',
      }),
      auth: expect.objectContaining({
        refreshPath: '/auth/refresh',
        storage: { kind: 'memory' },
      }),
    }))
  })

  it('closeApi 会按顺序关闭 api-client 与 crypto', async () => {
    const { initApi, closeApi } = await import('../src/lib/api.js')

    await initApi()
    await closeApi()

    expect(createdClient.close).toHaveBeenCalledTimes(1)
    expect(cryptoClose).toHaveBeenCalledTimes(1)
  })

  it('api-client 初始化失败时关闭 crypto 并拒绝启动', async () => {
    createdClient.init.mockResolvedValueOnce({
      success: false,
      error: { code: 'api-client:001:500', message: 'invalid client config' },
    })
    const { initApi } = await import('../src/lib/api.js')

    await expect(initApi()).rejects.toThrow('invalid client config')
    expect(cryptoClose).toHaveBeenCalledTimes(1)
  })
})
