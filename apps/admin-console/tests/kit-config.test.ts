import { describe, expect, it } from 'vitest'
import { adminConsoleKitConfig } from '../src/lib/config/kit-config.js'

describe('admin console kit config', () => {
  it('从 _kit.yml 读取 transport 配置', () => {
    expect(adminConsoleKitConfig.transport).not.toBe(false)
    if (adminConsoleKitConfig.transport === false)
      return

    expect(adminConsoleKitConfig.transport.keyExchangePath).toBe('/api/_hai/key-exchange')
    expect(adminConsoleKitConfig.transport.requireEncryption).toBe(true)
    expect(adminConsoleKitConfig.transport.encryptResponse).toBe(true)
    expect(adminConsoleKitConfig.transport.maxClients).toBe(10000)
    expect(adminConsoleKitConfig.transport.excludePaths).toEqual([
      '/api/storage',
      '/api/public',
      '/api/auth/profile/avatar',
    ])
  })
})
