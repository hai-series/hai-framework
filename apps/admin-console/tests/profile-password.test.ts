/** 个人改密必须收到可信结果包络，不能把异常响应当作成功。 */
import { beforeEach, expect, it, vi } from 'vitest'
import { changeProfilePassword } from '../src/lib/services/profile-api.js'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('$lib/utils/api', () => ({ apiFetch: request }))
vi.mock('../src/lib/services/sensitive-actions.svelte.js', () => ({ sensitiveFetch: vi.fn() }))

const input = { old_password: ' Current-example123! ', new_password: 'New-example123!', confirm_password: 'New-example123!' }
beforeEach(() => vi.resetAllMocks())

it('原样保留密码空白，并返回服务端确认的重新登录要求', async () => {
  request.mockResolvedValue(Response.json({ success: true, data: { reloginRequired: true } }))
  expect(await changeProfilePassword(input)).toEqual({ success: true, data: { reloginRequired: true } })
  expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual(input)
})

it('凭据失败保留统一错误码和追踪编号，供 UI 安全映射', async () => {
  request.mockResolvedValue(Response.json({ success: false, error: { code: 'hai:iam:002', message: 'Private field detail', traceId: 'profile-credentials' } }, { status: 401 }))
  expect(await changeProfilePassword(input)).toMatchObject({ success: false, error: { code: 'hai:iam:002', traceId: 'profile-credentials' } })
})

it.each([
  () => Response.json({ success: true, data: { reloginRequired: true } }, { status: 500 }),
  () => Response.json({ success: true, data: { unexpected: true } }),
  () => new Response('Private proxy detail', { status: 502 }),
])('异常 HTTP 状态或包络不能触发成功改密', async (response) => {
  request.mockResolvedValue(response())
  const result = await changeProfilePassword(input)
  expect(result.success).toBe(false)
  expect(JSON.stringify(result)).not.toContain('Private proxy detail')
})
