/** 单次用途凭据必须绑定到这一次调用，不能污染其它并发请求。 */
import { apiContract } from '@h-ai/api-contract'
import { expect, it } from 'vitest'
import { apiClient } from '../src/index.js'

it('per-call 再鉴别 header 在并发调用间隔离', async () => {
  const received: (string | null)[] = []
  const client = apiClient.create({ iam: apiContract.iam })
  expect((await client.init({ baseUrl: 'https://app.test/api', fetch: async (input) => {
    const request = input instanceof Request ? input : new Request(input)
    received.push(request.headers.get('x-hai-reauthentication'))
    return Response.json({ success: true })
  } })).success).toBe(true)
  try {
    const results = await Promise.all([
      client.iam.auth.logout({}, { context: { reauthentication: 'single-operation-proof' } }),
      client.iam.auth.logout({}),
    ])
    expect(results.every(result => result.success)).toBe(true)
    expect(received).toHaveLength(2)
    expect(received).toContain('single-operation-proof')
    expect(received).toContain(null)
  }
  finally { await client.close() }
})
