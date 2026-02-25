/**
 * =============================================================================
 * E2E 测试 - 共用工具函数
 * =============================================================================
 */

import type { APIRequestContext, Page } from '@playwright/test'

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

/** 生成唯一测试用户 */
export function uniqueUser(prefix = 'e2e') {
  const safePrefix = (prefix.replace(/[^a-zA-Z0-9_]/g, '') || 'e2e').slice(0, 8)
  const entropy = `${Date.now().toString(36)}${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const id = entropy.slice(-10)
  const username = `${safePrefix}_${id}`.slice(0, 20)
  return {
    username,
    email: `${safePrefix}_${id}@test.local`,
    password: 'Test1234!@',
  }
}

/** 通过 API 注册用户 */
export async function registerViaApi(request: APIRequestContext, user: ReturnType<typeof uniqueUser>) {
  for (let i = 0; i < 3; i++) {
    const response = await request.post('/api/auth/register', {
      data: {
        username: user.username,
        email: user.email,
        password: user.password,
        confirmPassword: user.password,
      },
    })

    if (response.status() === 429 && i < 2) {
      await sleep(300 * (i + 1))
      continue
    }

    return response
  }

  throw new Error('registerViaApi retry exhausted')
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

  // 通过 page.request 调用登录 API（与当前浏览器上下文共享 cookie 存储）
  let loginRes = await page.request.post('/api/auth/login', {
    data: { identifier: username, password },
  })
  if (loginRes.status() === 429) {
    await sleep(300)
    loginRes = await page.request.post('/api/auth/login', {
      data: { identifier: username, password },
    })
  }

  const loginResult = await loginRes.json()
  if (!loginRes.ok() || !loginResult.success) {
    throw new Error(`Login failed: ${loginRes.status()} ${JSON.stringify(loginResult)}`)
  }

  // 显式验证会话已建立，避免后续 /admin 导航被重定向
  const meRes = await page.request.get('/api/auth/me')
  const meBody = await meRes.json()
  if (!meRes.ok() || !meBody.success || !meBody.user) {
    throw new Error(`Session not established on page: ${meRes.status()} ${JSON.stringify(meBody)}`)
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
  const registerRes = await registerViaApi(request, user)
  const registerBody = await registerRes.json()
  if (!registerRes.ok() || !registerBody.success) {
    throw new Error(`Register failed: ${registerRes.status()} ${JSON.stringify(registerBody)}`)
  }

  await loginOnPage(page, user.username, user.password)
  return user
}

/**
 * 通过 API 注册并登录（纯 API，不需要 page）
 * 适用于 API-only 的测试；同一 request 实例内 cookie 会自动保持
 */
export async function registerAndLoginViaApi(request: APIRequestContext, prefix = 'api') {
  const user = uniqueUser(prefix)
  const registerRes = await registerViaApi(request, user)
  const registerBody = await registerRes.json()
  if (!registerRes.ok() || !registerBody.success) {
    throw new Error(`Register failed: ${registerRes.status()} ${JSON.stringify(registerBody)}`)
  }

  let loginRes = await request.post('/api/auth/login', {
    data: { identifier: user.username, password: user.password },
  })
  if (loginRes.status() === 429) {
    await sleep(300)
    loginRes = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: user.password },
    })
  }

  const loginBody = await loginRes.json()
  if (!loginRes.ok() || !loginBody.success) {
    throw new Error(`Login failed: ${loginRes.status()} ${JSON.stringify(loginBody)}`)
  }

  const meRes = await request.get('/api/auth/me')
  const meBody = await meRes.json()
  if (!meRes.ok() || !meBody.success || !meBody.user) {
    throw new Error(`Session not established: ${meRes.status()} ${JSON.stringify(meBody)}`)
  }

  return user
}
