import { afterEach, describe, expect, it, vi } from 'vitest'

const { transport } = vi.hoisted(() => ({ transport: vi.fn<typeof fetch>() }))
vi.mock('@h-ai/kit', () => ({ kit: { client: { create: () => ({ apiFetch: transport }) } } }))

const { apiFetch, observeAdminRequests } = await import('../src/lib/utils/api.js')
const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
  transport.mockReset()
})

describe('feedback request evidence', () => {
  it('hTTP200失败HaiResult记录业务失败和错误码，但不记录请求响应正文', async () => {
    transport.mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code: 'app:order:001', message: 'secret response' } }), { headers: { 'Content-Type': 'application/json' } }))
    const observed = vi.fn()
    cleanups.push(observeAdminRequests(observed))
    const response = await apiFetch('http://localhost/api/orders?token=secret', { method: 'POST', body: '{"password":"never-store"}' })
    expect((await response.json()).success).toBe(false)
    await vi.waitFor(() => expect(observed).toHaveBeenCalledOnce())
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({ status: 200, success: false, errorCode: 'app:order:001', url: 'http://localhost/api/orders' }))
    expect(JSON.stringify(observed.mock.calls)).not.toContain('secret response')
    expect(JSON.stringify(observed.mock.calls)).not.toContain('never-store')
    expect(transport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('反馈通道不递归采集自己，观察异常不改变业务响应', async () => {
    transport.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    const observed = vi.fn(() => {
      throw new Error('Observer failure')
    })
    cleanups.push(observeAdminRequests(observed))
    expect((await apiFetch('/api/feedback/reports')).ok).toBe(true)
    expect(observed).not.toHaveBeenCalled()
    expect((await apiFetch('/api/business')).ok).toBe(true)
    await vi.waitFor(() => expect(observed).toHaveBeenCalledOnce())
  })
})
