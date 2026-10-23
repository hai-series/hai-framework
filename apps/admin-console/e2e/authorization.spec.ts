import { expect, test } from '@playwright/test'
import { registerAndLoginViaApi, uniqueUser } from './helpers'

test('匿名访问返回 401，无角色用户返回 403，管理员仍可读取同一资源', async ({ request, playwright, baseURL }) => {
  await registerAndLoginViaApi(request, 'authz')
  const user = uniqueUser('limited')
  const created = await request.post('/api/iam/users', { data: { ...user, roles: [] } })
  expect(created.ok()).toBe(true)
  const { data: member } = await created.json()
  const limited = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } })
  try {
    const anonymous = await limited.get('/api/iam/users')
    expect(anonymous.status()).toBe(401)
    const login = await limited.post('/api/auth/login', { data: { identifier: user.username, password: user.password } })
    expect(login.ok()).toBe(true)
    for (const path of ['/api/iam/users', '/api/iam/roles', '/api/iam/permissions']) {
      expect((await limited.get(path)).status()).toBe(403)
      expect((await request.get(path)).ok()).toBe(true)
    }
    const denied = await limited.post('/api/iam/roles', { data: { name: uniqueUser('denied').username } })
    expect(denied.status()).toBe(403)
  }
  finally {
    await limited.dispose()
    const deleted = await request.delete(`/api/iam/users/${member.id}`)
    expect(deleted.ok()).toBe(true)
  }
})
