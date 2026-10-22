/** 实际 Admin/H5 路由必须保留 Kit 的服务端撤销失败，不能只返回本地退出成功。 */
import type { RequestEvent } from '@sveltejs/kit'
import { err, ok } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { afterEach, expect, it, vi } from 'vitest'
import { POST as h5Logout } from '../../h5-app/src/routes/api/auth/logout/+server.js'
import { POST as adminLogout } from '../src/routes/api/auth/logout/+server.js'

/** 只模拟这两个路由及 Kit 异常边界实际读取的请求字段；不运行 SvelteKit 跟踪/adapter。 */
function event(): RequestEvent {
  const url = new URL('https://app.example.com/api/auth/logout')
  const locals: RequestEvent['locals'] = { requestId: 'logout-route-test', accessToken: 'held-token' }
  const cookies: Pick<RequestEvent['cookies'], 'get' | 'set' | 'delete'> = { get: () => 'held-token', set: vi.fn(), delete: vi.fn() }
  return {
    url,
    request: new Request(url, { method: 'POST' }),
    getClientAddress: () => '127.0.0.1',
    locals,
    cookies,
  } as RequestEvent
}

afterEach(() => vi.restoreAllMocks())

for (const [name, handler] of [['Admin', adminLogout], ['H5', h5Logout]] as const) {
  it(`${name}实际路由返回撤销失败及对应HTTP状态`, async () => {
    const failure = err({ code: 'TEST_SESSION_UNAVAILABLE', message: 'Session state unavailable', httpStatus: 503 })
    const logout = vi.spyOn(kit.auth, 'logout').mockResolvedValueOnce(failure)
    const request = event()
    const response = await handler(request)
    expect(logout).toHaveBeenCalledWith(request.cookies, 'held-token')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'TEST_SESSION_UNAVAILABLE' } })
  })

  it(`${name}实际路由仅在确认撤销成功后返回退出成功`, async () => {
    vi.spyOn(kit.auth, 'logout').mockResolvedValueOnce(ok(undefined))
    const response = await handler(event())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true })
  })
}
