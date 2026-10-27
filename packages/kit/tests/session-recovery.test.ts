/** Kit 只续接明确被认证拒绝的同源请求，认证本身和未知写入结果不递归重试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { createKitClient } from '../src/client/kit-client.js'

afterEach(() => vi.unstubAllGlobals())
const denied = (code = 'hai:iam:105') => Response.json({ success: false, error: { code, message: 'Rejected', httpStatus: 401 } }, { status: 401 })

it.each([true, undefined])('成功或无有效失败包络时不因额外错误字段重放写入：success=%s', async (success) => {
  const fetch = vi.fn(async () => Response.json({ success, data: { saved: true }, error: { code: 'hai:iam:027' } }))
  vi.stubGlobal('fetch', fetch)
  const reauthorize = vi.fn(async () => 'unused-proof')
  const client = createKitClient({ recoverSession: async () => true })
  try {
    await client.apiFetch('/api/save', { method: 'POST', body: 'draft' }, { reauthorize })
    expect(fetch).toHaveBeenCalledOnce()
    expect(reauthorize).not.toHaveBeenCalled()
  }
  finally { client.destroy() }
})

it.each(['expired-session', 'rotated-proof'])('敏感请求 %s 只在重新确认后使用新证明重试', async (scenario) => {
  const proofs: (string | null)[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    proofs.push(new Request(input, init).headers.get('x-hai-reauthentication'))
    return proofs.length === 1 ? denied(scenario === 'rotated-proof' ? 'hai:iam:027' : undefined) : Response.json({ success: true })
  }))
  const recoverSession = vi.fn(async () => true)
  const reauthorize = vi.fn(async () => 'new-proof')
  const client = createKitClient({ recoverSession })
  try {
    expect((await client.apiFetch('/api/save', { method: 'POST', headers: { 'x-hai-reauthentication': 'old-proof' }, body: 'draft' }, { reauthorize })).ok).toBe(true)
    expect(proofs).toEqual(['old-proof', 'new-proof'])
    expect(reauthorize).toHaveBeenCalledOnce()
    expect(recoverSession).toHaveBeenCalledTimes(scenario === 'expired-session' ? 1 : 0)
  }
  finally { client.destroy() }
})

it('敏感请求没有重新授权回调时不把旧证明重放到新会话', async () => {
  const fetch = vi.fn(async () => denied())
  vi.stubGlobal('fetch', fetch)
  const client = createKitClient({ recoverSession: async () => true })
  try {
    await client.apiFetch('/api/save', { method: 'POST', headers: { 'x-hai-reauthentication': 'old-proof' } })
    expect(fetch).toHaveBeenCalledOnce()
  }
  finally { client.destroy() }
})

it('恢复后取消用途确认不再发送写入', async () => {
  const fetch = vi.fn(async () => denied())
  vi.stubGlobal('fetch', fetch)
  const client = createKitClient({ recoverSession: async () => true })
  const reauthorize = vi.fn(async () => null)
  try {
    await client.apiFetch('/api/save', { method: 'POST', body: 'kept input', headers: { 'x-hai-reauthentication': 'old-proof' } }, { reauthorize })
    expect(fetch).toHaveBeenCalledOnce()
    expect(reauthorize).toHaveBeenCalledOnce()
  }
  finally { client.destroy() }
})

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
