/**
 * =============================================================================
 * E2E 测试 - 共用工具函数
 * =============================================================================
 */

import type { APIRequestContext, Page } from '@playwright/test'

/** 加密验收使用符合 IAM 默认密码策略的独立管理员凭据。 */
export const transportAdmin = { username: 'admin', password: 'TransportAdmin123!' }

/** 各职责使用独立账号，管理权限由真实启动种子配置。 */
export const dutyAccounts = {
  audit: { username: 'audit_admin', password: 'Audit-test-Admin123!' },
  config: { username: 'config_admin', password: 'Config-test-Admin123!' },
  operator: { username: 'business_operator', password: 'Operator-test-Admin123!' },
} as const

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function extractMeUser(meBody: unknown) {
  if (!meBody || typeof meBody !== 'object') {
    return null
  }

  const body = meBody as {
    success?: boolean
    user?: unknown
    data?: { user?: unknown }
  }

  if (body.success !== true) {
    return null
  }

  return body.user ?? body.data?.user ?? null
}

/** 等待 SvelteKit 客户端完成 hydration，避免操作仅由 SSR 渲染的控件。 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => '__haiAdminTransportInstalled' in window)
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

/** 生成唯一测试用户 */
export function uniqueUser(prefix = 'e2e') {
  const safePrefix = (prefix.replace(/\W/g, '') || 'e2e').slice(0, 8)
  // eslint-disable-next-line node/prefer-global/process -- e2e 测试运行在 Node 环境
  const entropy = `${Date.now().toString(36)}${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const id = entropy.slice(-10)
  const username = `${safePrefix}${id}`.slice(0, 20)
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
 * page.request 与浏览器上下文共享 Cookie，后续导航使用真实服务端会话。
 */
export async function loginOnPage(page: Page, username: string, password: string, options: { keepGuide?: boolean } = {}) {
  // 通过 page.request 调用登录 API
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

  // 与页面真实认证一致：只通过登录响应设置的 httpOnly Cookie 验证会话。
  const meRes = await page.request.get('/api/auth/me')
  const meBody = await meRes.json()
  const meUser = extractMeUser(meBody)
  if (!meRes.ok() || !meUser) {
    throw new Error(`Session not established on page: ${meRes.status()} ${JSON.stringify(meBody)}`)
  }

  // 导航到 /admin，并确认客户端布局已稳定渲染。预览服务高负载时偶发返回空白文档，重试一次导航。
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/admin')
    await page.waitForURL('**/admin**', { timeout: 15_000 })
    await waitForHydration(page)
    try {
      await page.locator('.user-menu-container > button').first().waitFor({ state: 'visible', timeout: 5_000 })
      break
    }
    catch (error) {
      if (attempt === 1) {
        throw error
      }
    }
  }
  // 业务用例先暂缓首次提示，专门的引导用例保留默认体验。
  if (!options.keepGuide && await page.getByTestId('guide-later').isVisible())
    await page.getByTestId('guide-later').click()
}

/**
 * 注册 + 登录 一步到位
 */
export async function registerAndLogin(page: Page, request: APIRequestContext, prefix = 'e2e', options: { keepGuide?: boolean } = {}) {
  const user = uniqueUser(prefix)
  const registerRes = await registerViaApi(request, user)
  const registerBody = await registerRes.json()
  if (!registerRes.ok() || !registerBody.success) {
    throw new Error(`Register failed: ${registerRes.status()} ${JSON.stringify(registerBody)}`)
  }

  await loginOnPage(page, user.username, user.password, options)
  return user
}

/**
 * 通过 API 注册并登录（纯 API，不需要 page）
 * 通过响应设置的 httpOnly Cookie 验证会话，不改写 request 方法。
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
  const meUser = extractMeUser(meBody)
  if (!meRes.ok() || !meUser) {
    throw new Error(`Session not established: ${meRes.status()} ${JSON.stringify(meBody)}`)
  }

  return user
}
