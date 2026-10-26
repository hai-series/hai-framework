import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKitAuthActions } from '../src/client/kit-client-auth.js'

afterEach(() => vi.unstubAllGlobals())

describe('standard Cookie login actions', () => {
  it.each([
    { method: 'password', path: '/login', body: { identifier: 'alice', password: 'ExamplePassword123' } },
    { method: 'ldap', path: '/login/ldap', body: { username: 'alice', password: 'ExamplePassword123' } },
    { method: 'email', path: '/login/otp', body: { identifier: 'alice', code: '123456' } },
    { method: 'sms', path: '/login/otp', body: { identifier: 'alice', code: '123456' } },
  ] as const)('$method 仅发送该认证方式的有效字段', async ({ method, path, body }) => {
    const requests: Request[] = []
    const actions = createKitAuthActions({
      apiFetch: async (input, init) => {
        requests.push(new Request(new URL(String(input), 'https://app.test'), init))
        return Response.json({ success: true })
      },
    })
    const result = await actions.login({ identifier: 'alice', password: 'ExamplePassword123', method, code: '123456' })
    expect(result.success).toBe(true)
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0]!.url).pathname).toBe(`/api/auth${path}`)
    expect(await requests[0]!.json()).toEqual(body)
    expect((await actions.login({ identifier: 'alice', password: 'ExamplePassword123', method, code: '123456', captcha: 'opaque-single-use-proof' })).success).toBe(true)
    expect(requests).toHaveLength(2)
    expect(await requests[1]!.json()).toEqual({ ...body, captcha: 'opaque-single-use-proof' })
  })
})

it.each([false, true])('cookie 页面离开开关=%s；保留既有fetch管线并清理监听', async (enabled) => {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const requests: { url: string, init?: RequestInit }[] = []
  const actions = createKitAuthActions({ apiFetch: async (url, init) => {
    requests.push({ url: String(url), init })
    return Response.json({ success: true })
  } })
  const stop = actions.bindPageExit({ enabled })
  try {
    const restored = new Event('pagehide')
    Object.defineProperty(restored, 'persisted', { value: true })
    target.dispatchEvent(restored)
    expect(requests).toHaveLength(0)
    target.dispatchEvent(new Event('pagehide'))
    target.dispatchEvent(new Event('pagehide'))
    expect(requests).toHaveLength(enabled ? 1 : 0)
    if (enabled)
      expect(requests[0]).toMatchObject({ url: '/api/auth/session/close', init: { keepalive: true, method: 'POST', body: '{}' } })
    stop()
    target.dispatchEvent(new Event('pagehide'))
    expect(requests).toHaveLength(enabled ? 1 : 0)
  }
  finally { stop() }
})
