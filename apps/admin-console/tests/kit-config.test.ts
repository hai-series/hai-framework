import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('admin runtime kit config', () => {
  it('服务端保留完整配置，SSR 只投影公开 transport，不泄露规则和代理', async () => {
    vi.stubEnv('HAI_KIT_ACCESS', '{"rules":[{"id":"private-network-label","paths":["/api/private/**"],"allowIps":["192.0.2.0/24"]}]}')
    vi.stubEnv('HAI_KIT_TRUSTEDPROXIES', '["192.0.2.10"]')
    const { getAdminKitConfig } = await import('../src/lib/server/kit-config.js')
    const configured = getAdminKitConfig()
    expect(configured.transport).toMatchObject({ keyExchangePath: '/api/_hai/key-exchange' })
    expect(configured.server).toMatchObject({ host: '127.0.0.1', port: 3000 })
    expect(configured.access).toMatchObject({ rules: [{ id: 'private-network-label' }] })
    const { load } = await import('../src/routes/+layout.server.js')
    const publicData = load()
    expect(Object.keys(publicData.kitConfig)).toEqual(['transport'])
    expect(publicData.kitConfig.transport).toEqual(configured.transport)
    expect(JSON.stringify(publicData)).not.toContain('private-network-label')
    expect(JSON.stringify(publicData)).not.toContain('192.0.2.')
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
