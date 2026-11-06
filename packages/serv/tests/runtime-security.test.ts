import { afterEach, describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

const { createRuntimeSecurityPolicy } = serv

afterEach(() => vi.unstubAllEnvs())

describe('runtime security policy', () => {
  it('rejects wildcard or empty production origins', () => {
    expect(() => createRuntimeSecurityPolicy({
      environment: 'production',
      corsOrigin: '*',
    })).toThrow(/serv\.cors\.origin/)

    expect(() => createRuntimeSecurityPolicy({
      environment: 'production',
      corsOrigin: '',
    })).toThrow(/serv\.cors\.origin/)
  })

  it('matches normalized web and native origins exactly in production', () => {
    vi.stubEnv('HAI_SERV_REFRESH_COOKIE_SECURE', undefined)
    const policy = createRuntimeSecurityPolicy({
      environment: 'production',
      corsOrigin: 'https://app.example.com, https://admin.example.com',
      nativeOrigins: 'https://app.native.local, capacitor://app.native.local, tauri://app.native.local',
    })

    expect(policy.allowOrigin('https://app.example.com')).toBe(true)
    expect(policy.allowOrigin('https://app.example.com.attacker.test')).toBe(false)
    expect(policy.allowOrigin('https://app.native.local')).toBe(true)
    expect(policy.allowOrigin('capacitor://app.native.local')).toBe(true)
    expect(policy.allowOrigin('tauri://app.native.local')).toBe(true)
    expect(policy.isNativeOrigin('capacitor://app.native.local')).toBe(true)
    expect(policy.isNativeOrigin('https://app.example.com')).toBe(false)
    expect(policy.secureRefreshCookie).toBe(true)
    expect(policy.exposeApiDocs).toBe(false)
  })

  it('keeps wildcard CORS and API docs available in development', () => {
    vi.stubEnv('HAI_SERV_REFRESH_COOKIE_SECURE', undefined)
    const policy = createRuntimeSecurityPolicy({
      environment: 'development',
      corsOrigin: '*',
    })

    expect(policy.allowOrigin('http://127.0.0.1:4173')).toBe(true)
    expect(policy.secureRefreshCookie).toBe(false)
    expect(policy.exposeApiDocs).toBe(true)
  })

  it('allows HTTP refresh cookies with an explicit production opt-out and keeps CORS and docs policy', () => {
    vi.stubEnv('HAI_SERV_REFRESH_COOKIE_SECURE', 'false')
    const corsOrigin = 'http://192.0.2.10:12348'
    const policy = createRuntimeSecurityPolicy({ environment: 'production', corsOrigin })

    expect(policy.secureRefreshCookie).toBe(false)
    expect(policy.exposeApiDocs).toBe(false)
    expect(policy.allowOrigin(corsOrigin)).toBe(true)
    expect(policy.allowOrigin('http://192.0.2.10:8080')).toBe(false)
    expect(() => createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: '*' })).toThrow(/serv\.cors\.origin/)
  })

  it.each([
    { environment: 'development', value: 'true', secure: true },
    { environment: 'production', value: '0', secure: true },
    { environment: 'production', value: '', secure: true },
  ])('uses Secure=$secure in $environment when the variable is "$value"', ({ environment, value, secure }) => {
    vi.stubEnv('HAI_SERV_REFRESH_COOKIE_SECURE', value)
    const policy = createRuntimeSecurityPolicy({ environment, corsOrigin: 'https://app.example.com' })
    expect(policy.secureRefreshCookie).toBe(secure)
  })

  it('rejects origins containing credentials, paths, query or unsupported protocols', () => {
    expect(() => createRuntimeSecurityPolicy({ corsOrigin: 'https://example.com/path' })).toThrow()
    expect(() => createRuntimeSecurityPolicy({ nativeOrigins: 'capacitor://user@example.com' })).toThrow()
    expect(() => createRuntimeSecurityPolicy({ nativeOrigins: 'file://app.local' })).toThrow()
  })
})
