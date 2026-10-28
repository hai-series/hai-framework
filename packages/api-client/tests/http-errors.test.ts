import { apiContract } from '@h-ai/api-contract'
import { describe, expect, it } from 'vitest'
import { apiClient, HaiApiClientError } from '../src/index.js'

const contract = { save: apiContract.route({ method: 'POST', path: '/save' }).output(apiContract.voidResultSchema) }

describe('非 2xx HTTP 失败包络', () => {
  it.each([409, 422, 429])('响应 %s 保留服务端业务错误和 traceId', async (status) => {
    const client = apiClient.create(contract)
    expect((await client.init({ baseUrl: 'https://service.test', fetch: async () => Response.json({
      success: false,
      error: { code: 'app:retry', message: '请刷新后重试', traceId: 'server-request-1' },
    }, { status }) })).success).toBe(true)
    try {
      const result = await client.save()
      expect(result).toMatchObject({ success: false, error: { code: 'app:retry', httpStatus: status, traceId: 'server-request-1', message: '请刷新后重试 (traceId: server-request-1)' } })
    }
    finally { await client.close() }
  })

  it('真实 HTTP 500 优先于正文声称的 400，保留错误码但隐藏内部诊断', async () => {
    const client = apiClient.create(contract)
    expect((await client.init({ baseUrl: 'https://service.test', fetch: async () => Response.json({
      success: false,
      error: { code: 'app:database', httpStatus: 400, message: 'PRIVATE_DATABASE_DIAGNOSTIC', cause: { sql: 'PRIVATE_SQL' }, traceId: 'server-request-2' },
    }, { status: 500 }) })).success).toBe(true)
    try {
      const result = await client.save()
      expect(result).toMatchObject({ success: false, error: { code: 'app:database', httpStatus: 500, traceId: 'server-request-2' } })
      expect(JSON.stringify(result)).not.toContain('PRIVATE_')
    }
    finally { await client.close() }
  })

  it('无有效失败包络时保留客户端失败，不把非 2xx 当成功', async () => {
    const client = apiClient.create(contract)
    expect((await client.init({ baseUrl: 'https://service.test', fetch: async () => Response.json({ success: true, data: 'PRIVATE_RESPONSE' }, { status: 500 }) })).success).toBe(true)
    try {
      const result = await client.save()
      expect(result).toMatchObject({ success: false, error: { code: HaiApiClientError.SERVER_ERROR.code } })
      expect(JSON.stringify(result)).not.toContain('PRIVATE_RESPONSE')
    }
    finally { await client.close() }
  })
})
