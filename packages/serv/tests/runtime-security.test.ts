import { describe, expect, it } from 'vitest'
import { createRuntimeSecurityPolicy } from '../src/serv-runtime-security.js'

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
    const policy = createRuntimeSecurityPolicy({
      environment: 'development',
      corsOrigin: '*',
    })

    expect(policy.allowOrigin('http://127.0.0.1:4173')).toBe(true)
    expect(policy.secureRefreshCookie).toBe(false)
    expect(policy.exposeApiDocs).toBe(true)
  })

  it('rejects origins containing credentials, paths, query or unsupported protocols', () => {
    expect(() => createRuntimeSecurityPolicy({ corsOrigin: 'https://example.com/path' })).toThrow()
    expect(() => createRuntimeSecurityPolicy({ nativeOrigins: 'capacitor://user@example.com' })).toThrow()
    expect(() => createRuntimeSecurityPolicy({ nativeOrigins: 'file://app.local' })).toThrow()
  })
})
