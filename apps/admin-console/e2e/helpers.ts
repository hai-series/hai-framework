/**
 * =============================================================================
 * E2E 测试 - 共用工具函数
 * =============================================================================
 */

import type { APIRequestContext, Page } from '@playwright/test'

const ADMIN_TOKEN_KEY = 'access_token'

interface LoginBody {
  success?: boolean
  data?: {
    accessToken?: string
  }
}

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
 * 在浏览器上下文中通过 fetch 调用登录 API，cookie 自动生效。
 */
export async function loginOnPage(page: Page, username: string, password: string) {
  // 先导航到登录页以建立浏览器上下文
  await page.goto('/auth/login')
  await page.waitForLoadState('domcontentloaded')

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

  const accessToken = (loginResult as LoginBody).data?.accessToken
  if (accessToken) {
    await page.evaluate((tokenKeyAndValue) => {
      localStorage.setItem(tokenKeyAndValue.key, tokenKeyAndValue.value)
    }, { key: ADMIN_TOKEN_KEY, value: accessToken })
  }

  // 显式验证令牌可用，避免后续 /admin 导航失败
  const meRes = await page.request.get('/api/auth/me', accessToken
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : undefined)
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
 * 会为当前 request 实例自动补充 Authorization 头
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

  const accessToken = (loginBody as LoginBody).data?.accessToken

  const requestWithAuth = request as APIRequestContext & {
    __authState?: {
      accessToken: string
      originalGet: APIRequestContext['get']
      originalPost: APIRequestContext['post']
      originalPut: APIRequestContext['put']
      originalPatch: APIRequestContext['patch']
      originalDelete: APIRequestContext['delete']
    }
    get: APIRequestContext['get']
    post: APIRequestContext['post']
    put: APIRequestContext['put']
    patch: APIRequestContext['patch']
    delete: APIRequestContext['delete']
  }

  if (accessToken && !requestWithAuth.__authState) {
    const authState = {
      accessToken,
      originalGet: request.get.bind(request),
      originalPost: request.post.bind(request),
      originalPut: request.put.bind(request),
      originalPatch: request.patch.bind(request),
      originalDelete: request.delete.bind(request),
    }

    const withAuthHeaders = (options: Parameters<APIRequestContext['get']>[1] = {}) => ({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: options.headers?.Authorization ?? `Bearer ${authState.accessToken}`,
      },
    })

    requestWithAuth.get = ((url, options) => authState.originalGet(url, withAuthHeaders(options))) as APIRequestContext['get']
    requestWithAuth.post = ((url, options) => authState.originalPost(url, withAuthHeaders(options as Parameters<APIRequestContext['get']>[1]))) as APIRequestContext['post']
    requestWithAuth.put = ((url, options) => authState.originalPut(url, withAuthHeaders(options as Parameters<APIRequestContext['get']>[1]))) as APIRequestContext['put']
    requestWithAuth.patch = ((url, options) => authState.originalPatch(url, withAuthHeaders(options as Parameters<APIRequestContext['get']>[1]))) as APIRequestContext['patch']
    requestWithAuth.delete = ((url, options) => authState.originalDelete(url, withAuthHeaders(options))) as APIRequestContext['delete']
    requestWithAuth.__authState = authState
  }
  else if (accessToken && requestWithAuth.__authState) {
    requestWithAuth.__authState.accessToken = accessToken
  }

  const meRes = await request.get('/api/auth/me')
  const meBody = await meRes.json()
  const meUser = extractMeUser(meBody)
  if (!meRes.ok() || !meUser) {
    throw new Error(`Session not established: ${meRes.status()} ${JSON.stringify(meBody)}`)
  }

  return user
}
