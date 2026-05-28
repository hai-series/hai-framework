import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function setNativeCapacitorWindow(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      Capacitor: {
        getPlatform: () => 'android',
        isNativePlatform: () => true,
      },
    },
  })
}

describe('capacitor.push', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        getPlatform: vi.fn(() => 'android'),
        isNativePlatform: vi.fn(() => true),
      },
    }))
    setNativeCapacitorWindow()
  })

  afterEach(async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    await capacitor.close()
    delete (globalThis as unknown as { window?: unknown }).window
    vi.restoreAllMocks()
  })

  it('register 在监听器挂载完成后再调用原生注册', async () => {
    const listeners: Partial<Record<'registration' | 'registrationError', (payload: unknown) => void>> = {}
    const addListener = vi.fn((event: 'registration' | 'registrationError', callback: (payload: unknown) => void) => {
      return Promise.resolve().then(() => {
        listeners[event] = callback
        return { remove: vi.fn(async () => {}) }
      })
    })
    const register = vi.fn(async () => {
      if (!listeners.registration || !listeners.registrationError) {
        throw new Error('listeners not ready')
      }
      listeners.registration({ value: 'push-token-123' })
    })

    vi.doMock('@capacitor/push-notifications', () => ({
      PushNotifications: {
        requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
        addListener,
        register,
      },
    }))

    const { capacitor } = await import('../src/capacitor-main.js')
    const initResult = await capacitor.init()
    expect(initResult.success).toBe(true)

    const result = await capacitor.push.register()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.token).toBe('push-token-123')
    }
    expect(register).toHaveBeenCalledOnce()
  })

  it('listen 返回的 cleanup 在部分 remove 失败时仍然 resolve', async () => {
    const removeFailed = vi.fn(async () => {
      throw new Error('remove failed')
    })
    const removeOk = vi.fn(async () => {})

    vi.doMock('@capacitor/push-notifications', () => ({
      PushNotifications: {
        addListener: vi.fn()
          .mockResolvedValueOnce({ remove: removeFailed })
          .mockResolvedValueOnce({ remove: removeOk }),
      },
    }))

    const { capacitor } = await import('../src/capacitor-main.js')
    const initResult = await capacitor.init()
    expect(initResult.success).toBe(true)

    const result = await capacitor.push.listen({
      onReceived: vi.fn(),
      onActionPerformed: vi.fn(),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      await expect(result.data()).resolves.toBeUndefined()
    }
  })
})
