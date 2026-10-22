import { describe, expect, it } from 'vitest'
import { createKitAuthActions } from '../src/client/kit-client-auth.js'

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
  })
})
