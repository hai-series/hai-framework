import type { ApiRequestRecord } from '../src/index.js'
import { apiContract } from '@h-ai/api-contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { apiClient } from '../src/index.js'

const contract = { task: apiContract.route({ method: 'POST', path: '/tasks' }).input(z.object({ token: z.string() })).output(apiContract.haiResultSchema(z.object({ id: z.string() }))) }

describe('logical request observations', () => {
  it('reports a 200 business failure with the same bounded request ID and no request secrets', async () => {
    const client = apiClient.create(contract)
    const records: ApiRequestRecord[] = []
    let requestId: string | null = null
    expect((await client.init({ baseUrl: 'https://service.test/api', fetch: async (input) => {
      requestId = new Request(input).headers.get('x-request-id')
      return Response.json({ success: false, error: { code: 'app:denied', message: 'Denied' } })
    } })).success).toBe(true)
    const stop = client.observeRequests(record => records.push(record))
    const stopBad = client.observeRequests(() => {
      throw new Error('observer failed')
    })
    try {
      const result = await client.task({ token: 'private-body-token' })
      expect(result.success).toBe(false)
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ requestId, procedure: 'task', success: false, errorCode: 'app:denied', method: 'POST', status: 200, attempts: 1 })
      expect(requestId).toMatch(/^[\w.:-]{1,128}$/)
      expect(JSON.stringify(records)).not.toContain('private-body-token')
      stop()
      await client.task({ token: 'private-body-token' })
      expect(records).toHaveLength(1)
    }
    finally {
      stop()
      stopBad()
      await client.close()
    }
  })

  it('emits one logical observation when token refresh retries the request', async () => {
    const client = apiClient.create(contract)
    const storage = apiClient.tokenStorage.memory()
    await storage.setAccessToken('old-access')
    await storage.setRefreshToken('refresh-only')
    const records: ApiRequestRecord[] = []
    const ids: string[] = []
    let attempts = 0
    expect((await client.init({ baseUrl: 'https://service.test/api', auth: { storage }, fetch: async (input) => {
      const request = new Request(input)
      if (request.url.endsWith('/auth/refresh'))
        return Response.json({ success: true, data: { accessToken: 'new-access', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresIn: 3600 } })
      ids.push(request.headers.get('x-request-id') ?? '')
      return ++attempts === 1 ? new Response(null, { status: 401 }) : Response.json({ success: true, data: { id: 'task-1' } })
    } })).success).toBe(true)
    const stop = client.observeRequests(record => records.push(record))
    try {
      expect((await client.task({ token: 'private-body-token' })).success).toBe(true)
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ attempts: 2, success: true, requestId: ids[0] })
      expect(ids).toEqual([ids[0], ids[0]])
    }
    finally {
      stop()
      await client.close()
    }
  })
})
