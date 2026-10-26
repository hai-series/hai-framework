/** 页面离开策略复用认证与传输链路，不能在退出时重新刷新出新会话。 */
import { setTimeout } from 'node:timers/promises'
import { apiContract } from '@h-ai/api-contract'
import { afterEach, expect, it, vi } from 'vitest'
import { apiClient } from '../src/index.js'

afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('页面离开策略=%s：keepalive、重复事件、BFCache 与清理', async (enabled) => {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const add = vi.spyOn(target, 'addEventListener')
  const requests: { request: Request, init?: RequestInit }[] = []
  const storage = apiClient.tokenStorage.memory()
  const client = apiClient.create({ iam: apiContract.iam })
  expect((await client.init({ baseUrl: 'https://app.test/api', auth: { storage }, fetch: async (request, init) => {
    requests.push({ request: request instanceof Request ? request : new Request(request, init), init })
    return Response.json({ success: true })
  } })).success).toBe(true)
  await client.auth.setTokens({ accessToken: 'exit-access', refreshToken: 'exit-refresh', expiresIn: 3600, tokenType: 'Bearer' })
  const stop = apiClient.createAuthActions(client).bindPageExit({ enabled })
  try {
    if (!enabled)
      expect(add).not.toHaveBeenCalled()
    const persisted = new Event('pagehide')
    Object.defineProperty(persisted, 'persisted', { value: true })
    target.dispatchEvent(persisted)
    await setTimeout(0)
    expect(requests).toHaveLength(0)
    target.dispatchEvent(new Event('pagehide'))
    target.dispatchEvent(new Event('pagehide'))
    if (enabled) {
      await vi.waitFor(() => expect(requests).toHaveLength(1))
      expect(requests[0].init?.keepalive).toBe(true)
      expect(new URL(requests[0].request.url).pathname).toBe('/api/auth/session/close')
      expect(requests[0].request.headers.get('authorization')).toBe('Bearer exit-access')
      expect(await storage.getAccessToken()).toBe('exit-access')
    }
    else {
      await setTimeout(0)
      expect(requests).toHaveLength(0)
      expect(await storage.getAccessToken()).toBe('exit-access')
    }
    stop()
    target.dispatchEvent(new Event('pagehide'))
    await setTimeout(0)
    expect(requests).toHaveLength(enabled ? 1 : 0)
  }
  finally {
    stop()
    await client.close()
  }
})

it('页面离开收到401不刷新凭据，不把失败当作服务端已撤销', async () => {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const urls: string[] = []
  const storage = apiClient.tokenStorage.memory()
  const client = apiClient.create({ iam: apiContract.iam })
  expect((await client.init({ baseUrl: 'https://app.test/api', auth: { storage }, fetch: async (request) => {
    urls.push(request instanceof Request ? request.url : String(request))
    return Response.json({ success: false, error: { code: 'test:denied', message: 'Denied', httpStatus: 401 } }, { status: 401 })
  } })).success).toBe(true)
  await client.auth.setTokens({ accessToken: 'exit-access', refreshToken: 'exit-refresh', expiresIn: 3600, tokenType: 'Bearer' })
  const stop = apiClient.createAuthActions(client).bindPageExit({ enabled: true })
  try {
    target.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(() => expect(urls).toHaveLength(1))
    await setTimeout(0)
    expect(urls[0]).toBe('https://app.test/api/auth/session/close')
    expect(await storage.getAccessToken()).toBe('exit-access')
  }
  finally {
    stop()
    await client.close()
  }
})

it('实例关闭只清理自己的监听，旧页面响应不清空后来设置的新凭据', async () => {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  let release: ((response: Response) => void) | undefined
  const storage = apiClient.tokenStorage.memory()
  const first = apiClient.create({ iam: apiContract.iam })
  const second = apiClient.create({ iam: apiContract.iam })
  let firstCalls = 0
  let secondCalls = 0
  expect((await first.init({ baseUrl: 'https://app.test/api', auth: {}, fetch: async () => {
    firstCalls++
    return Response.json({ success: true })
  } })).success).toBe(true)
  expect((await second.init({ baseUrl: 'https://app.test/api', auth: { storage }, fetch: async () => {
    secondCalls++
    return new Promise<Response>((resolve) => {
      release = resolve
    })
  } })).success).toBe(true)
  apiClient.createAuthActions(first).bindPageExit({ enabled: true })
  apiClient.createAuthActions(second).bindPageExit({ enabled: true })
  try {
    await first.close()
    target.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(() => expect(secondCalls).toBe(1))
    expect(firstCalls).toBe(0)
    await second.auth.setTokens({ accessToken: 'new-login', refreshToken: 'new-refresh', expiresIn: 3600, tokenType: 'Bearer' })
    release?.(Response.json({ success: true }))
    await setTimeout(0)
    expect(await storage.getAccessToken()).toBe('new-login')
  }
  finally {
    release?.(Response.json({ success: true }))
    await first.close()
    await second.close()
  }
})
