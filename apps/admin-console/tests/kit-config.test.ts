import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('admin runtime kit config', () => {
  it('从 _kit.yml 读取并校验公开 transport 默认值', async () => {
    const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
    expect(getAdminKitConfig().transport).toMatchObject({ keyExchangePath: '/api/_hai/key-exchange' })
    expect(getAdminKitConfig()).not.toHaveProperty('server')
  })
  it('同一源码产物支持运行时关闭加密，不使用构建期测试开关', async () => {
    vi.stubEnv('HAI_KIT_TRANSPORT', 'false')
    const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
    expect(getAdminKitConfig().transport).toBe(false)
  })
  it('运行时公开路径经过同一 Schema 验证', async () => {
    vi.stubEnv('HAI_KIT_TRANSPORT', '{ keyExchangePath: /custom-exchange }')
    const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
    expect(getAdminKitConfig().transport).toMatchObject({ keyExchangePath: '/custom-exchange' })
  })
})
