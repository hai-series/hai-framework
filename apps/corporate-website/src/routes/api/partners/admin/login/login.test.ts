import { getPartnerAdminSessionByToken } from '$lib/server/partner-service.js'
import { cache } from '@h-ai/cache'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './+server.js'

beforeEach(async () => {
  await cache.init({ type: 'memory' })
  vi.spyOn(core.config, 'validate').mockReturnValue(ok(undefined))
  vi.spyOn(core.config, 'getOrThrow').mockReturnValue({ username: 'partner-admin', password: 'ValidPassword1!', sessionTtlSeconds: 3600 })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await cache.close()
})

function loginEvent(): { event: Parameters<typeof POST>[0], setCookie: ReturnType<typeof vi.fn> } {
  const setCookie = vi.fn()
  return {
    event: {
      request: new Request('http://localhost/api/partners/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'partner-admin', password: 'ValidPassword1!' }),
      }),
      locals: { locale: 'en-US', requestId: 'session-persistence-test' },
      // handler 只使用 set；保持标准函数类型，spy 留在外部用于断言。
      cookies: { set: (...args: Parameters<Parameters<typeof POST>[0]['cookies']['set']>) => setCookie(...args) },
    } as Parameters<typeof POST>[0],
    setCookie,
  }
}

describe('partner admin session persistence', () => {
  it.each([ok(false), err(HaiCommonError.INTERNAL_ERROR, 'Cache unavailable')])('写入未生效或失败时返回 503 且不设置 cookie', async (failure) => {
    vi.spyOn(cache.kv, 'set').mockResolvedValueOnce(failure)
    const { event, setCookie } = loginEvent()
    const response = await POST(event)
    expect(response.status).toBe(503)
    expect(setCookie).not.toHaveBeenCalled()
    expect(await cache.kv.keys('*')).toMatchObject({ success: true, data: [] })
  })

  it('实际写入后设置的 token 可读取对应会话', async () => {
    const { event, setCookie } = loginEvent()
    const response = await POST(event)
    expect(response.status).toBe(200)
    expect(setCookie).toHaveBeenCalledOnce()
    const token = setCookie.mock.calls[0]![1] as string
    expect(await getPartnerAdminSessionByToken(token)).toMatchObject({ username: 'partner-admin', role: 'partner-admin' })
    const ttl = await cache.kv.ttl(`corp:partner:session:${token}`)
    expect(ttl.success && ttl.data > 0 && ttl.data <= 3600).toBe(true)
  })
})
