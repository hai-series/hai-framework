import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiCapacitorError } from '../src/capacitor-types.js'

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

describe('capacitor.device.getAppVersion', () => {
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

  it('成功返回应用版本信息', async () => {
    vi.doMock('@capacitor/app', () => ({
      App: {
        getInfo: vi.fn(async () => ({ version: '1.2.3', build: '45' })),
      },
    }))

    const { capacitor } = await import('../src/capacitor-main.js')
    const initResult = await capacitor.init()
    expect(initResult.success).toBe(true)

    const result = await capacitor.device.getAppVersion()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.version).toBe('1.2.3')
      expect(result.data.build).toBe('45')
    }
  })

  it('失败时返回 APP_VERSION_FAILED', async () => {
    vi.doMock('@capacitor/app', () => ({
      App: {
        getInfo: vi.fn(async () => { throw new Error('app failed') }),
      },
    }))

    const { capacitor } = await import('../src/capacitor-main.js')
    const initResult = await capacitor.init()
    expect(initResult.success).toBe(true)

    const result = await capacitor.device.getAppVersion()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.APP_VERSION_FAILED.code)
    }
  })
})
