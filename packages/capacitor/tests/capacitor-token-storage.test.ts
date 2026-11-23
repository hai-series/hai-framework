/**
 * =============================================================================
 * @h-ai/capacitor - Token Storage 测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  vi.mocked(SecureStorage.getItem).mockReset().mockImplementation(async key => secureStore.get(key) ?? null)
  vi.mocked(SecureStorage.setItem).mockReset().mockImplementation(async (key, value) => {
    secureStore.set(key, value)
  })
  vi.mocked(SecureStorage.removeItem).mockReset().mockImplementation(async (key) => {
    secureStore.delete(key)
  })
})

describe('capacitor.createTokenStorage', () => {
  it('原生环境使用 secure storage 设置和读取 access token', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

    await storage.setAccessToken('test-access')
    const token = await storage.getAccessToken()
    expect(token).toBe('test-access')
    expect(vi.mocked(SecureStorage.setItem)).toHaveBeenCalledWith('hai_access_token', 'test-access')
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled()
  })

  it('原生环境使用 secure storage 设置和读取 refresh token', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

    await storage.setRefreshToken('test-refresh')
    const token = await storage.getRefreshToken()
    expect(token).toBe('test-refresh')
    expect(vi.mocked(SecureStorage.setItem)).toHaveBeenCalledWith('hai_refresh_token', 'test-refresh')
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled()
  })

  it('clear 仅清除 secure storage 中的 token', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

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

    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

    await expect(storage.setAccessToken('web-access')).rejects.toThrow()
    await expect(storage.getAccessToken()).rejects.toThrow()
    await expect(storage.setRefreshToken('web-refresh')).rejects.toThrow()
    await expect(storage.getRefreshToken()).rejects.toThrow()
    await expect(storage.clear()).rejects.toThrow()

    expect(vi.mocked(SecureStorage.setItem)).not.toHaveBeenCalled()
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled()
    expect(vi.mocked(Preferences.get)).not.toHaveBeenCalled()
  })

  it('secure storage 读取异常向调用方传播，不能伪装成没有凭据', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

    vi.mocked(SecureStorage.getItem).mockRejectedValueOnce(new Error('native error'))
    await expect(storage.getAccessToken()).rejects.toThrow('native error')
  })

  it('secure storage 写入异常向调用方传播', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

    vi.mocked(SecureStorage.setItem).mockRejectedValueOnce(new Error('native error'))
    await expect(storage.setAccessToken('x')).rejects.toThrow('native error')
  })

  it('真实 TokenManager 部分写入失败后屏蔽整对凭据，删除失败仍不恢复访问', async () => {
    const { apiClient } = await import('@h-ai/api-client')
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()
    const client = apiClient.create({})
    const initialized = await client.init({
      baseUrl: 'https://api.test.invalid',
      auth: { storage },
    })
    expect(initialized.success).toBe(true)

    try {
      vi.mocked(SecureStorage.setItem).mockImplementation(async (key, value) => {
        if (key === 'hai_refresh_token')
          throw new Error('refresh write failed')
        secureStore.set(key, value)
      })
      await expect(client.auth.setTokens({
        accessToken: 'partial-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
        tokenType: 'Bearer',
      })).rejects.toThrow('refresh write failed')
      expect(secureStore.get('hai_access_token')).toBe('partial-access')
      expect(await storage.getAccessToken()).toBeNull()
      expect(await storage.getRefreshToken()).toBeNull()

      vi.mocked(SecureStorage.removeItem).mockRejectedValue(new Error('native remove failed'))
      await expect(client.auth.clear()).rejects.toThrow()
      expect(secureStore.get('hai_access_token')).toBe('partial-access')
      expect(await storage.getAccessToken()).toBeNull()
      expect(await storage.getRefreshToken()).toBeNull()
    }
    finally {
      await client.close()
    }
  })

  it('clear 删除失败时传播错误并屏蔽当前实例的旧凭据', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()

    await storage.setAccessToken('old-access')
    await storage.setRefreshToken('old-refresh')
    vi.mocked(SecureStorage.removeItem).mockRejectedValue(new Error('native error'))
    await expect(storage.clear()).rejects.toThrow()
    expect(secureStore.size).toBe(2)
    expect(await storage.getAccessToken()).toBeNull()
    expect(await storage.getRefreshToken()).toBeNull()

    // 成功写入只重新开放相应 key，不能顺带恢复旧账号另一类凭据。
    await storage.setAccessToken('new-access')
    expect(await storage.getAccessToken()).toBe('new-access')
    expect(await storage.getRefreshToken()).toBeNull()
    await storage.setRefreshToken('new-refresh')
    expect(await storage.getRefreshToken()).toBe('new-refresh')
  })

  it('clear 等待全部原生删除结束后才返回失败', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    let completeRemove: () => void = () => {}
    const delayedRemove = new Promise<void>((resolve) => {
      completeRemove = resolve
    })
    vi.mocked(SecureStorage.removeItem).mockImplementation(key => key === 'hai_access_token'
      ? Promise.reject(new Error('native error'))
      : delayedRemove)
    let settled = false
    const pending = capacitor.createTokenStorage().clear().catch((error: unknown) => {
      settled = true
      return error
    })
    await vi.waitFor(() => expect(SecureStorage.removeItem).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    completeRemove()
    expect(await pending).toBeInstanceOf(Error)
  })

  it('平台插件首次失败后同一实例可重试恢复', async () => {
    const { Capacitor } = await import('@capacitor/core')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()
    vi.mocked(Capacitor.isNativePlatform).mockImplementationOnce(() => {
      throw new Error('bridge unavailable')
    })
    await expect(storage.setAccessToken('first')).rejects.toThrow('bridge unavailable')
    await storage.setAccessToken('retry')
    expect(await storage.getAccessToken()).toBe('retry')
  })

  it('clear 开始后屏蔽已经在途的旧凭据读取', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const storage = capacitor.createTokenStorage()
    let finishRead: (value: string) => void = () => {}
    const delayedRead = new Promise<string>((resolve) => {
      finishRead = resolve
    })
    vi.mocked(SecureStorage.getItem).mockReturnValueOnce(delayedRead)
    const pending = storage.getAccessToken()
    await vi.waitFor(() => expect(SecureStorage.getItem).toHaveBeenCalledOnce())
    await storage.clear()
    finishRead('old-access')
    expect(await pending).toBeNull()
  })

  it.each([false, true])('clear 等待此前原生写入并删除迟到凭据（跨实例=%s）', async (separateInstance) => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const { capacitor } = await import('../src/index.js')
    const writer = capacitor.createTokenStorage()
    const clearer = separateInstance
      ? capacitor.createTokenStorage()
      : writer
    let releaseWrite: () => void = () => {}
    const delayed = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    vi.mocked(SecureStorage.setItem).mockImplementationOnce(async (key, value) => {
      await delayed
      secureStore.set(key, value)
    })
    const writing = writer.setAccessToken('old-access')
    await vi.waitFor(() => expect(SecureStorage.setItem).toHaveBeenCalledOnce())
    let cleared = false
    const clearing = clearer.clear().then(() => {
      cleared = true
    })
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(cleared).toBe(false)
      expect(SecureStorage.removeItem).not.toHaveBeenCalled()
    }
    finally {
      releaseWrite()
      await Promise.all([writing, clearing])
    }
    expect(await capacitor.createTokenStorage().getAccessToken()).toBeNull()
    expect(secureStore.size).toBe(0)
  })
})

describe('capacitor.preferences', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', { Capacitor: {} })
    const { capacitor } = await import('../src/index.js')
    expect((await capacitor.init()).success).toBe(true)
  })

  afterEach(async () => {
    const { capacitor } = await import('../src/index.js')
    await capacitor.close()
    vi.unstubAllGlobals()
  })

  it('保存后读取返回原值', async () => {
    const { capacitor } = await import('../src/index.js')
    expect((await capacitor.preferences.set('test_key', 'test_value')).success).toBe(true)
    const result = await capacitor.preferences.get('test_key')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('test_value')
    }
  })

  it('读取异常返回 err', async () => {
    const { Preferences } = await import('@capacitor/preferences')
    const { capacitor, HaiCapacitorError } = await import('../src/index.js')

    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('fail'))
    const result = await capacitor.preferences.get('key')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiCapacitorError.PREFERENCES_GET_FAILED.code)
  })

  it('删除后读取返回 null', async () => {
    const { capacitor } = await import('../src/index.js')
    expect((await capacitor.preferences.set('key', 'value')).success).toBe(true)
    expect((await capacitor.preferences.remove('key')).success).toBe(true)
    expect(await capacitor.preferences.get('key')).toEqual({ success: true, data: null })
  })
})
