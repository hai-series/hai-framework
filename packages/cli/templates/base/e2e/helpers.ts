/**
 * E2E 测试 - 共用工具函数
 */

import type { APIRequestContext, Page } from '@playwright/test'

/** 生成唯一测试用户 */
export function uniqueUser(prefix = 'e2e') {
  const safePrefix = (prefix.replace(/\W/g, '') || 'e2e').slice(0, 8)
  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const id = entropy.slice(-10)
  const username = `${safePrefix}_${id}`.slice(0, 20)
  return {
    username,
    email: `${safePrefix}_${id}@test.local`,
    password: 'Test1234!@',
  }
}

/** 通过 API 注册用户 */
export async function registerViaApi(
  request: APIRequestContext,
  user: ReturnType<typeof uniqueUser>,
) {
  return request.post('/api/auth/register', {
    data: {
      username: user.username,
      email: user.email,
      password: user.password,
      confirmPassword: user.password,
    },
  })
}

/** 注册并登录，返回已认证的 Page */
export async function registerAndLogin(
  page: Page,
  request: APIRequestContext,
  prefix = 'e2e',
) {
  const user = uniqueUser(prefix)
  await registerViaApi(request, user)
  await page.goto('/login')
  await page.fill('[name="username"]', user.username)
  await page.fill('[name="password"]', user.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
  return user
}
