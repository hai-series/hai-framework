import { err, ok } from '@h-ai/core'
import { HaiIamError } from '@h-ai/iam'
import { beforeEach, expect, it, vi } from 'vitest'
import { actions } from '../src/routes/+page.server.js'

vi.mock('$app/paths', () => ({
  resolve: () => '/agent/',
}))
const { revoke } = vi.hoisted(() => ({
  revoke: vi.fn(),
}))
vi.mock('@h-ai/iam', async load => ({
  ...await load<typeof import('@h-ai/iam')>(),
  iam: {
    auth: { logout: revoke },
  },
}))

function event(token?: string) {
  const cookies = {
    get: vi.fn(() => token),
    delete: vi.fn(),
  }
  // 此 action 只读取 Cookie，经由 SvelteKit 的真实 fail/redirect 返回结果。
  return { cookies } as Parameters<NonNullable<typeof actions.logout>>[0] & { cookies: typeof cookies }
}

beforeEach(() => revoke.mockReset())

it('撤销未确认时保留当前 Cookie，恢复后可以按同一凭据重试', async () => {
  revoke
    .mockResolvedValueOnce(err(HaiIamError.REPOSITORY_ERROR, 'Storage unavailable'))
    .mockResolvedValueOnce(ok(undefined))
  const request = event('held-session')

  expect(await actions.logout(request)).toMatchObject({
    status: 503,
    data: {
      error: 'logout-unconfirmed',
      traceId: expect.any(String),
    },
  })
  expect(request.cookies.delete).not.toHaveBeenCalled()

  await expect(actions.logout(request)).rejects.toMatchObject({ status: 303, location: '/agent/' })
  expect(revoke.mock.calls).toEqual([
    ['held-session'],
    ['held-session'],
  ])
  expect(request.cookies.delete).toHaveBeenCalledWith('agent_session', { path: '/agent/' })
})

it('没有 Cookie 时幂等登出', async () => {
  await expect(actions.logout(event())).rejects.toMatchObject({ status: 303, location: '/agent/' })
  expect(revoke).not.toHaveBeenCalled()
})
