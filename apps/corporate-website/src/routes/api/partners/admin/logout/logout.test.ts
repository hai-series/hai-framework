import { getPartnerAdminSessionByToken } from '$lib/server/partner-service.js'
import { cache } from '@h-ai/cache'
import { err, HaiCommonError } from '@h-ai/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './+server.js'

beforeEach(async () => {
  await cache.init({ type: 'memory' })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await cache.close()
})

it('a failed revocation is reported and the cookie remains available for retry', async () => {
  const token = 'review-session'
  await cache.kv.set(`corp:partner:session:${token}`, JSON.stringify({ username: 'admin', role: 'partner-admin' }))
  const removeCookie = vi.fn()
  type RequestEvent = Parameters<typeof POST>[0]
  // 平台其余成员由 SvelteKit 提供；显式声明本夹具覆盖的事件部分与完整 Cookie 契约。
  const event: Pick<RequestEvent, 'request' | 'locals' | 'cookies'> = {
    request: new Request('http://localhost/logout', { method: 'POST' }),
    locals: { locale: 'en-US', requestId: 'logout-retry-test' },
    cookies: { get: () => token, getAll: () => [], set: vi.fn(), delete: removeCookie, serialize: () => '' },
  }
  vi.spyOn(cache.kv, 'del').mockResolvedValueOnce(err(HaiCommonError.INTERNAL_ERROR, 'Cache unavailable'))
  expect((await POST(event as RequestEvent)).status).toBe(500)
  expect(removeCookie).not.toHaveBeenCalled()
  expect(await getPartnerAdminSessionByToken(token)).not.toBeNull()
  expect((await POST(event as RequestEvent)).status).toBe(200)
  expect(removeCookie).toHaveBeenCalledOnce()
  expect(await getPartnerAdminSessionByToken(token)).toBeNull()
})
