import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { POST as createApiKey, GET as listApiKeys } from '../src/routes/api/iam/apikeys/+server.js'
import { GET as getApiKey, DELETE as revokeApiKey } from '../src/routes/api/iam/apikeys/[id]/+server.js'
import { createRequestEvent } from './fixtures/request-event.js'

it('管理端旧路径保留分页和状态码，创建响应禁止缓存明文密钥', async () => {
  try {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    expect((await iam.init({
      login: { apikey: true },
    })).success).toBe(true)
    const user = await iam.user.createUser({ username: 'api-key-fixture', password: 'ExampleOnly123!' })
    if (!user.success)
      throw new Error(user.error.message)
    const userId = user.data.user.id
    const locals = {
      session: {
        userId,
        permissions: ['*'],
        roles: [],
      },
    }
    const url = 'https://app.test/api/iam/apikeys'
    const created = await createApiKey(createRequestEvent({
      request: new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, name: 'Report key' }),
      }),
      locals,
    }))
    expect(created.status).toBe(201)
    expect(created.headers.get('cache-control')).toBe('no-store')
    expect(await created.json()).toMatchObject({
      success: true,
      data: {
        rawKey: expect.any(String),
      },
    })

    const listed = await listApiKeys(createRequestEvent({
      url: new URL(`${url}?userId=${userId}&enabled=true&sortBy=name`),
      locals,
    }))
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({
      success: true,
      data: {
        total: 1,
        page: 1,
        pageSize: 20,
        apiKeys: [
          { name: 'Report key', expiresAt: null, lastUsedAt: null },
        ],
      },
    })
    const keys = await iam.apiKey.listApiKeys(userId)
    if (!keys.success || !keys.data.items[0])
      throw new Error('Expected a stored API Key')
    const { id } = keys.data.items[0]
    const detail = await getApiKey(createRequestEvent({
      params: { id },
      locals,
    }))
    expect(detail.status).toBe(200)
    const publicResult: unknown = await detail.json()
    expect(publicResult).toMatchObject({
      success: true,
      data: { id, name: 'Report key' },
    })
    expect(publicResult).not.toHaveProperty('data.rawKey')
    expect(publicResult).not.toHaveProperty('data.keyHash')
    const revoked = await revokeApiKey(createRequestEvent({
      request: new Request(`${url}/${id}`, { method: 'DELETE' }),
      params: { id },
      locals,
    }))
    expect(revoked.status).toBe(204)
    expect((await getApiKey(createRequestEvent({
      params: { id },
      locals,
    }))).status).toBe(404)
  }
  finally {
    await iam.close()
    await cache.close()
    await reldb.close()
  }
})
