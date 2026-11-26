import type { kit } from '@h-ai/kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { transport } = vi.hoisted(() => ({
  transport: vi.fn<ReturnType<typeof kit.client.create>['apiFetch']>(),
}))
vi.mock('@h-ai/kit', () => ({
  kit: {
    client: {
      create: () => ({ apiFetch: transport }),
    },
  },
}))

const { apiFetch } = await import('../src/lib/utils/api.js')

afterEach(() => transport.mockReset())

describe('管理台请求', () => {
  it('恢复选项只传给本次请求，后续请求不继承禁用状态', async () => {
    transport.mockResolvedValue(new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    }))
    const options = { recoverSession: false }
    await apiFetch('/api/auth/login', { method: 'POST' }, options)
    expect(transport).toHaveBeenLastCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      headers: expect.any(Headers),
    }), options)
    await apiFetch('/api/business')
    expect(transport).toHaveBeenLastCalledWith('/api/business', expect.objectContaining({
      headers: expect.any(Headers),
    }), undefined)
  })
})
