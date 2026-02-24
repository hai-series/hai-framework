/**
 * =============================================================================
 * E2E 测试 - 共用工具函数
 * =============================================================================
 */

import type { APIRequestContext, Page } from '@playwright/test'

/** 生成唯一测试用户 */
export function uniqueUser(prefix = 'e2e') {
  const ts = Date.now().toString(36)
  return {
    username: `${prefix}_${ts}`,
    email: `${prefix}_${ts}@test.local`,
    password: 'Test1234!@',
  }
}

/** 通过 API 注册用户 */
export async function registerViaApi(request: APIRequestContext, user: ReturnType<typeof uniqueUser>) {
  return request.post('/api/auth/register', {
    data: {
      username: user.username,
      email: user.email,
      password: user.password,
      confirmPassword: user.password,
    },
  })
}

/**
 * 在页面上完成登录流程
 *
 * 在浏览器上下文中通过 fetch 调用登录 API，cookie 自动生效。
 */
export async function loginOnPage(page: Page, username: string, password: string) {
  // 先导航到登录页以建立浏览器上下文
  await page.goto('/auth/login')
  await page.waitForLoadState('domcontentloaded')

  // 通过浏览器上下文调用登录 API（cookie 自动写入同源 cookie jar）
  const loginResult = await page.evaluate(async (creds: { identifier: string, password: string }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(creds),
    })
    return res.json()
  }, { identifier: username, password })

  if (!loginResult.success) {
    throw new Error(`Login failed: ${JSON.stringify(loginResult)}`)
  }

  // 导航到 /admin
  await page.goto('/admin')
  await page.waitForURL('**/admin**', { timeout: 15_000 })
}

/**
 * 注册 + 登录 一步到位
 */
export async function registerAndLogin(page: Page, request: APIRequestContext, prefix = 'e2e') {
  const user = uniqueUser(prefix)
  await registerViaApi(request, user)
  await loginOnPage(page, user.username, user.password)
  return user
}

/**
 * 通过 API 注册并登录（纯 API，不需要 page）
 * 适用于 API-only 的测试；同一 request 实例内 cookie 会自动保持
 */
export async function registerAndLoginViaApi(request: APIRequestContext, prefix = 'api') {
  const user = uniqueUser(prefix)
  await registerViaApi(request, user)
  await request.post('/api/auth/login', {
    data: { identifier: user.username, password: user.password },
  })
  return user
}
