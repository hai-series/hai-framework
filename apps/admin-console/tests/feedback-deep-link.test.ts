import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

const { check } = vi.hoisted(() => ({
  check: vi.fn(() => true),
}))
vi.mock('@h-ai/kit', () => ({
  kit: {
    guard: { check },
  },
}))
vi.mock('#lib/paraglide/messages.js', () => ({
  feedback_forbidden: () => 'Forbidden',
  feedback_invalid_query: () => 'Invalid query',
}))

const { load } = await import('../src/routes/admin/feedback/+page.server.js')
function open(query: string) {
  return Promise.resolve().then(() => load({
    url: new URL(`http://app.test/admin/feedback${query}`),
    locals: {},
  } as Parameters<typeof load>[0]))
}

describe('处理页面反馈定位', () => {
  it('通过 UUID 打开指定反馈，普通列表不指定详情', async () => {
    const feedbackId = randomUUID()
    await expect(open(`?feedback=${feedbackId}`)).resolves.toEqual({ feedbackId })
    await expect(open('')).resolves.toEqual({ feedbackId: undefined })
    await expect(open('?feedback=other')).rejects.toMatchObject({ status: 400 })
  })

  it('定位仍受管理权限约束', async () => {
    check.mockReturnValueOnce(false)
    await expect(open(`?feedback=${randomUUID()}`)).rejects.toMatchObject({ status: 403 })
  })
})
