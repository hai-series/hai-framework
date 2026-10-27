/** Kit 只续接明确被认证拒绝的同源请求，认证本身和未知写入结果不递归重试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { createKitClient } from '../src/client/kit-client.js'

afterEach(() => vi.unstubAllGlobals())
const denied = (code = 'hai:iam:105') => Response.json({ success: false, error: { code, message: 'Rejected', httpStatus: 401 } }, { status: 401 })

it('恢复后保留POST正文与终端，只续接一次', async () => {
  const bodies: string[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    bodies.push(await request.text())
    expect(request.headers.get('x-hai-terminal')).toBe('desktop')
    return bodies.length === 1 ? denied() : Response.json({ success: true })
  })
  vi.stubGlobal('fetch', fetch)
  const recoverSession = vi.fn(async () => true)
  const client = createKitClient({ recoverSession, terminalType: 'desktop' })
  try {
    expect((await client.apiFetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"draft":"saved text"}' })).ok).toBe(true)
    expect(bodies).toEqual(['{"draft":"saved text"}', '{"draft":"saved text"}'])
    expect(recoverSession).toHaveBeenCalledTimes(1)
  }
  finally { client.destroy() }
})

it.each(['hai:iam:002', 'hai:iam:027'])('二次认证错误 %s 不打开重新登录弹窗', async (code) => {
  const fetch = vi.fn(async () => denied(code))
  vi.stubGlobal('fetch', fetch)
  const recoverSession = vi.fn(async () => true)
  const client = createKitClient({ recoverSession })
  try {
    await client.apiFetch('/api/reauthenticate', { method: 'POST' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(recoverSession).not.toHaveBeenCalled()
  }
  finally { client.destroy() }
})

it('取消、跨源、认证端点及网络异常不续接请求', async () => {
  const fetch = vi.fn(async () => denied())
  vi.stubGlobal('fetch', fetch)
  const recoverSession = vi.fn(async () => false)
  const client = createKitClient({ recoverSession })
  try {
    await client.apiFetch('/api/save', { method: 'POST' })
    expect(recoverSession).toHaveBeenCalledTimes(1)
    await client.apiFetch('https://other.test/api/save', { method: 'POST' })
    await client.apiFetch('/api/auth/login', { method: 'POST' }, { recoverSession: false })
    expect(recoverSession).toHaveBeenCalledTimes(1)
    fetch.mockRejectedValueOnce(new TypeError('Disconnected'))
    await expect(client.apiFetch('/api/save', { method: 'POST' })).rejects.toThrow('Disconnected')
    expect(recoverSession).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(4)
  }
  finally { client.destroy() }
})
