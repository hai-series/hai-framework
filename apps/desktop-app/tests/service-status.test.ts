import { beforeEach, describe, expect, it, vi } from 'vitest'

const info = vi.fn()
const echo = vi.fn()

vi.mock('../src/lib/api.js', () => ({
  desktopApiClient: {
    app: {
      info,
      echo,
    },
  },
}))

describe('service-status store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('refreshServiceInfo 成功后保存服务信息', async () => {
    info.mockResolvedValueOnce({
      success: true,
      data: {
        name: 'api-service',
        version: '0.1.0',
        uptimeMs: 1234,
        transportEnabled: true,
      },
    })

    const serviceStatus = await import('../src/lib/service-status.svelte.js')
    await serviceStatus.refreshServiceInfo()

    expect(serviceStatus.currentServiceInfo()).toEqual({
      name: 'api-service',
      version: '0.1.0',
      uptimeMs: 1234,
      transportEnabled: true,
    })
    expect(serviceStatus.currentServiceInfoError()).toBeNull()
  })

  it('sendEcho 成功后保存回显结果', async () => {
    echo.mockResolvedValueOnce({
      success: true,
      data: {
        message: 'hello',
        userId: 'u-1',
        requestId: 'req-1',
        timestamp: '2026-05-26T00:00:00.000Z',
      },
    })

    const serviceStatus = await import('../src/lib/service-status.svelte.js')
    await serviceStatus.sendEcho('hello')

    expect(echo).toHaveBeenCalledWith({ message: 'hello' })
    expect(serviceStatus.currentEchoResult()).toEqual({
      message: 'hello',
      userId: 'u-1',
      requestId: 'req-1',
      timestamp: '2026-05-26T00:00:00.000Z',
    })
    expect(serviceStatus.currentEchoError()).toBeNull()
  })
})
