import { ok } from '@h-ai/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { list, checkPermission, getContext } = vi.hoisted(() => ({ list: vi.fn(), checkPermission: vi.fn(), getContext: vi.fn() }))
vi.mock('@h-ai/feedback', () => ({ feedback: { list } }))
vi.mock('@h-ai/kit', () => ({ kit: { guard: { check: checkPermission } } }))
vi.mock('../src/lib/server/feedback.js', () => ({ getFeedbackContext: getContext }))

const { load } = await import('../src/routes/admin/feedback/+page.server.js')

// 鉴权与身份入口已替换为可控边界；此 loader 的事件参数只读取 URL 和 locals.session。
function event(query: string) {
  return { url: new URL(`http://localhost/admin/feedback${query}`), locals: {} } as Parameters<typeof load>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  checkPermission.mockReturnValue(true)
  getContext.mockReturnValue({ scopeId: 'admin-console', userId: 'admin', permissions: ['feedback:read'] })
  list.mockResolvedValue(ok({ items: [], total: 0, page: 1, pageSize: 20 }))
})

describe('feedback notification deep link', () => {
  it('邮件链接可携带报告编号定位参数，列表仍按公开分页契约查询', async () => {
    await expect(load(event('?feedback=fb_report-1&pageSize=1'))).resolves.toMatchObject({ feedbackId: 'fb_report-1' })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 1 }), expect.objectContaining({ scopeId: 'admin-console' }))
    expect(list.mock.calls[0]![0]).not.toHaveProperty('feedback')
  })

  it('普通列表不产生详情定位，不放宽未知查询字段', async () => {
    await expect(load(event('?page=2'))).resolves.toMatchObject({ feedbackId: undefined })
    await expect(load(event('?unknown=value'))).rejects.toMatchObject({ status: 400 })
  })

  it('过长或空的详情标识在读取列表前拒绝', async () => {
    await expect(load(event(`?feedback=${'x'.repeat(129)}`))).rejects.toMatchObject({ status: 400 })
    await expect(load(event('?feedback='))).rejects.toMatchObject({ status: 400 })
    expect(list).not.toHaveBeenCalled()
  })

  it('定位参数不会绕过反馈管理权限', async () => {
    checkPermission.mockReturnValue(false)
    await expect(load(event('?feedback=fb_report-1'))).rejects.toMatchObject({ status: 403 })
    expect(list).not.toHaveBeenCalled()
  })
})
