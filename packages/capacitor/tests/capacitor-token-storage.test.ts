/**
 * =============================================================================
 * @h-ai/capacitor - Token Storage 测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'

// mock @capacitor/preferences
vi.mock('@capacitor/preferences', () => {
  const store = new Map<string, string>()
  return {
    Preferences: {
      get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
      set: vi.fn(async ({ key, value }: { key: string, value: string }) => { store.set(key, value) }),
      remove: vi.fn(async ({ key }: { key: string }) => { store.delete(key) }),
    },
  }
})

describe('createCapacitorTokenStorage', () => {
  it('设置和读取 access token', async () => {
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setAccessToken('test-access')
    const token = await storage.getAccessToken()
    expect(token).toBe('test-access')
  })

  it('设置和读取 refresh token', async () => {
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setRefreshToken('test-refresh')
    const token = await storage.getRefreshToken()
    expect(token).toBe('test-refresh')
  })

  it('clear 清除所有 token', async () => {
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    await storage.setAccessToken('a')
    await storage.setRefreshToken('r')
    await storage.clear()

    expect(await storage.getAccessToken()).toBeNull()
    expect(await storage.getRefreshToken()).toBeNull()
  })

  it('preferences 异常时 get 返回 null 不崩溃', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('native error'))
    const token = await storage.getAccessToken()
    expect(token).toBeNull()
  })

  it('preferences 异常时 set 不抛出', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    vi.mocked(Preferences.set).mockRejectedValueOnce(new Error('native error'))
    await expect(storage.setAccessToken('x')).resolves.toBeUndefined()
  })

  it('preferences 异常时 clear 不抛出', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { createCapacitorTokenStorage } = await import('../src/capacitor-token-storage.js')
    const storage = createCapacitorTokenStorage()

    vi.mocked(Preferences.remove).mockRejectedValueOnce(new Error('native error'))
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
