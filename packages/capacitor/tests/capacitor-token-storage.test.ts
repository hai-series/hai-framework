/**
 * =============================================================================
 * @h-ai/capacitor - Token Storage 测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const preferencesStore = new Map<string, string>()
const secureStore = new Map<string, string>()

// mock @capacitor/preferences
vi.mock('@capacitor/preferences', () => {
  return {
    Preferences: {
      get: vi.fn(async ({ key }: { key: string }) => ({ value: preferencesStore.get(key) ?? null })),
      set: vi.fn(async ({ key, value }: { key: string, value: string }) => { preferencesStore.set(key, value) }),
      remove: vi.fn(async ({ key }: { key: string }) => { preferencesStore.delete(key) }),
    },
  }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'android'),
    isNativePlatform: vi.fn(() => true),
  },
}))

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    getItem: vi.fn(async (key: string) => secureStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { secureStore.set(key, value) }),
    removeItem: vi.fn(async (key: string) => { secureStore.delete(key) }),
  },
}))

beforeEach(async () => {
  preferencesStore.clear()
  secureStore.clear()
  vi.resetModules()

  const { Capacitor } = await import('@capacitor/core')
  vi.mocked(Capacitor.getPlatform).mockReturnValue('android')
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)

  const { Preferences } = await import('@capacitor/preferences')
  vi.mocked(Preferences.get).mockClear()
  vi.mocked(Preferences.set).mockClear()
  vi.mocked(Preferences.remove).mockClear()

  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  vi.mocked(SecureStorage.getItem).mockClear()
  vi.mocked(SecureStorage.setItem).mockClear()
  vi.mocked(SecureStorage.removeItem).mockClear()
})

describe('createCapacitorTokenStorage', () => {
  it('原生环境使用 secure storage 设置和读取 access token', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setAccessToken('test-access')
    const token = await storage.getAccessToken()
    expect(token).toBe('test-access')
    expect(vi.mocked(SecureStorage.setItem)).toHaveBeenCalledWith('hai_access_token', 'test-access')
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled()
  })

  it('原生环境使用 secure storage 设置和读取 refresh token', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setRefreshToken('test-refresh')
    const token = await storage.getRefreshToken()
    expect(token).toBe('test-refresh')
    expect(vi.mocked(SecureStorage.setItem)).toHaveBeenCalledWith('hai_refresh_token', 'test-refresh')
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled()
  })

  it('clear 仅清除 secure storage 中的 token', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setAccessToken('a')
    await storage.setRefreshToken('r')
    await storage.clear()

    expect(await storage.getAccessToken()).toBeNull()
    expect(await storage.getRefreshToken()).toBeNull()
    expect(vi.mocked(SecureStorage.removeItem)).toHaveBeenCalledWith('hai_access_token')
    expect(vi.mocked(SecureStorage.removeItem)).toHaveBeenCalledWith('hai_refresh_token')
  })

  it('非原生环境不回退到 Preferences 或 localStorage', async () => {
    const { Capacitor } = await import('@capacitor/core')
    const { Preferences } = await import('@capacitor/preferences')
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setAccessToken('web-access')
    const token = await storage.getAccessToken()

    expect(token).toBeNull()
    expect(vi.mocked(SecureStorage.setItem)).not.toHaveBeenCalled()
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled()
    expect(vi.mocked(Preferences.get)).not.toHaveBeenCalled()
  })

  it('secure storage 异常时 get 返回 null 不崩溃', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    vi.mocked(SecureStorage.getItem).mockRejectedValueOnce(new Error('native error'))
    const token = await storage.getAccessToken()
    expect(token).toBeNull()
  })

  it('secure storage 异常时 set 不抛出', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(new Error('native error'))
    await expect(storage.setAccessToken('x')).resolves.toBeUndefined()
  })

  it('secure storage 异常时 clear 不抛出', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    vi.mocked(SecureStorage.removeItem).mockRejectedValueOnce(new Error('native error'))
    await expect(storage.clear()).resolves.toBeUndefined()
  })
})

describe('safeGetPreference / safeSetPreference / safeRemovePreference', () => {
  it('safeGetPreference 成功返回 ok', async () => {
    const { safeSetPreference, safeGetPreference } = await import('../src/capacitor-token-storage.js')
    await safeSetPreference('test_key', 'test_value')
    const result = await safeGetPreference('test_key')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('test_value')
    }
  })

  it('safeGetPreference 异常返回 err', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { safeGetPreference } = await import('../src/capacitor-token-storage.js')

    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('fail'))
    const result = await safeGetPreference('key')
    expect(result.success).toBe(false)
  })

  it('safeRemovePreference 成功返回 ok', async () => {
    const { safeRemovePreference } = await import('../src/capacitor-token-storage.js')
    const result = await safeRemovePreference('key')
    expect(result.success).toBe(true)
  })
})
