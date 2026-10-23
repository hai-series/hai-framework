import type { IamAuthLoginInput } from '../src/index.js'
import { apiContract } from '@h-ai/api-contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { apiClient } from '../src/index.js'

describe('iAM login action input', () => {
  it.each([
    { method: 'password', path: '/auth/login', body: { identifier: 'alice', password: 'ExamplePassword123' } },
    { method: 'ldap', path: '/auth/login/ldap', body: { username: 'alice', password: 'ExamplePassword123' } },
    { method: 'email', path: '/auth/login/otp', body: { identifier: 'alice', code: '123456' } },
    { method: 'sms', path: '/auth/login/otp', body: { identifier: 'alice', code: '123456' } },
  ] as const)('$method 仅发送该认证方式的有效字段', async ({ method, path, body }) => {
    const requests: Request[] = []
    const client = apiClient.create({ iam: apiContract.iam })
    const initialized = await client.init({
      baseUrl: 'https://api.test/api',
      fetch: async (input, init) => {
        requests.push(input instanceof Request ? input : new Request(input, init))
        return Response.json({ success: false, error: { code: 'test:denied', message: 'Denied', httpStatus: 403 } })
      },
    })
    expect(initialized.success).toBe(true)
    try {
      const actions = apiClient.createAuthActions(client)
      const result = await actions.login({ identifier: 'alice', password: 'ExamplePassword123', method, code: '123456' })
      expect(result.success).toBe(false)
      expect(requests).toHaveLength(1)
      expect(new URL(requests[0]!.url).pathname).toBe(`/api${path}`)
      expect(await requests[0]!.json()).toEqual(body)
      expectTypeOf<Extract<'rememberMe', keyof IamAuthLoginInput>>().toEqualTypeOf<never>()
    }
    finally {
      await client.close()
    }
  })
})
