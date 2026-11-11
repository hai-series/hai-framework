import type { APIResponse, Request, Response } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { transportAdmin, waitForHydration } from './helpers'

test.describe('Transport enabled E2E', () => {
  test.describe.configure({ timeout: 60_000 })

  test('shows browser upgrade before the login application can load', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 Chrome/100.0.4896.75 Safari/537.36 Edg/100.0.1185.36',
      })
    })
    await page.route('**/_app/**', route => route.abort())
    await page.goto('/auth/login', { waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/_hai\/browser-check\/update\.html#zh$/)
    await expect(page.getByRole('heading', { name: '浏览器版本过低' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Microsoft Edge 100.0.1185.36')
    await expect(page.getByRole('main')).toContainText('Microsoft Edge 111')
    await expect(page.getByRole('link', { name: '查看官方更新说明' })).toHaveAttribute('href', 'https://support.microsoft.com/edge/microsoft-edge-update-settings')
    await page.screenshot({
      path: testInfo.outputPath('browser-update-mobile.png'),
    })
  })

  async function loginViaUi(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/auth/login')
    await page.waitForLoadState('load')
    await waitForHydration(page)
    await page.locator('#login-username').fill(transportAdmin.username)
    await page.locator('input[type="password"]').first().fill(transportAdmin.password)
    const [loginResponse] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST').then(response => expectEncrypted(response, response.request())),
      page.locator('button[type="submit"]').click(),
    ])
    expect(loginResponse.status()).toBe(200)
    await page.waitForURL('**/admin**', { timeout: 15_000 })

    // `waitForHydration` 的 transport 标记由根布局设置，会跨路由保留；这里再等待
    // 登录后侧边栏的实际业务入口，避免在 `/admin` 页面尚未完成客户端挂载时继续操作。
    await page.locator('a[href="/admin/iam/roles"]').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  async function expectEncrypted<T extends Response | APIResponse>(response: T, request: Request): Promise<T> {
    expect(response.ok()).toBe(true)
    const payload = await response.json()
    const requestHeaders = await request.allHeaders()
    expect(requestHeaders['x-client-id']).toBeTruthy()
    expect(requestHeaders['x-encrypted']).toBe('true')
    expect(response.headers()['x-encrypted']).toBe('true')
    expect(payload).toMatchObject({
      direction: 'response',
      status: response.status(),
      encryptedKey: expect.any(String),
      ciphertext: expect.any(String),
      iv: expect.any(String),
      context: expect.objectContaining({ version: 2 }),
      tag: expect.any(String),
      signature: expect.any(String),
    })
    return response
  }

  test('shows server time when the device clock rejects encrypted login', async ({ page }) => {
    await page.goto('/auth/login')
    await waitForHydration(page)
    await page.evaluate(() => {
      const now = Date.now.bind(Date)
      Date.now = () => now() + 600_000
    })
    await page.locator('#login-username').fill(transportAdmin.username)
    await page.locator('input[type="password"]').first().fill(transportAdmin.password)
    const [rejected] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'),
      page.locator('button[type="submit"]').click(),
    ])
    expect(rejected.status()).toBe(400)
    expect(rejected.headers()['x-encrypted']).toBe('true')
    const advice = page.getByRole('alert').filter({ hasText: '请开启设备的自动校时或手工修改时间' })
    await expect(advice).toContainText(/服务器时间为 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/)
    await expect(page).toHaveURL(/\/auth\/login/)
    await loginViaUi(page)
  })

  test('renews transport before SvelteKit navigation after idle', async ({ page }) => {
    await loginViaUi(page)
    await expect(page.getByTestId('app-environment-badge')).toBeVisible()

    // 在收到响应时立即读取密文，避免页面跳转后 Chrome 已释放旧请求的响应体。
    const [networkMe, me] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/me') && response.request().method() === 'GET').then(response => expectEncrypted(response, response.request())),
      page.evaluate(async () => {
        const response = await fetch('/api/auth/me')
        return { status: response.status, body: await response.json() }
      }),
    ])
    expect(me.status).toBe(200)
    expect(me.body.success).toBe(true)
    expect(me.body.user?.username ?? me.body.data?.user?.username).toBe(transportAdmin.username)
    const initialHeaders = await networkMe.request().allHeaders()
    expect(initialHeaders['x-hai-transport']).toBeTruthy()

    // 在放行导航数据前读取并校验密文，避免 Chrome 在切换路由后回收响应体。
    // route.fetch 保留真实服务端加密响应；fulfill 将相同响应交给浏览器解密。
    await page.route('**/admin/iam/roles/__data.json*', async (route) => {
      const response = await route.fetch()
      await expectEncrypted(response, route.request())
      expect((await route.request().allHeaders())['x-hai-transport']).toBeTruthy()
      await route.fulfill({ response })
    })
    const networkDataPromise = page.waitForResponse(response => response.url().includes('/admin/iam/roles/__data.json'))
    const exchangePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/_hai/key-exchange').then(async (response) => {
      expect(response.ok()).toBe(true)
      return response.json() as Promise<{ clientId: string, clientKeyTtlSeconds: number }>
    })
    // 模拟浏览器空闲一小时的经过时间，保留请求签发使用的实际系统时间。
    await page.evaluate(() => {
      const now = performance.now.bind(performance)
      performance.now = () => now() + 3600_000
    })
    await page.locator('a[href="/admin/iam/roles"]').first().click()
    const [exchange, navigation] = await Promise.all([exchangePromise, networkDataPromise])
    expect(exchange.clientKeyTtlSeconds).toBe(3600)
    expect(exchange.clientId).not.toBe(initialHeaders['x-client-id'])
    expect((await navigation.request().allHeaders())['x-client-id']).toBe(exchange.clientId)
    await expect(page).toHaveURL(/\/admin\/iam\/roles/)
    await expect(page.locator('table')).toBeVisible()
  })

  test('renders Mermaid document/code demos in UI gallery scenes with transport enabled', async ({ page }) => {
    await loginViaUi(page)

    await page.goto('/admin/ui-gallery/scenes')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('AiDocumentEditor · Mermaid 文档')).toBeVisible()
    await expect(page.getByText('AiDocumentEditor · Mermaid 代码')).toBeVisible()

    const documentDemo = page.getByTestId('mermaid-document-demo')
    await expect(documentDemo).toBeVisible()
    await expect(documentDemo.locator('.hai-md-mermaid svg').first()).toBeVisible({ timeout: 15_000 })

    const codeDemo = page.getByTestId('mermaid-code-demo')
    await expect(codeDemo).toBeVisible()
    await expect(codeDemo.locator('code')).toContainText('stateDiagram-v2')

    await codeDemo.locator('[data-code-view-toggle][data-code-view="preview"]').first().click()
    await expect(codeDemo.locator('.hai-md-mermaid-preview svg')).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText('MarkdownRenderer · 字号与 HTML 标签')).toBeVisible()
    await expect(page.getByText('AiDocumentEditor · 字号与 HTML 标签')).toBeVisible()

    const markdownHtmlOffDemo = page.getByTestId('markdown-html-off-demo')
    const markdownHtmlOnDemo = page.getByTestId('markdown-html-on-demo')
    await expect(markdownHtmlOffDemo.locator('b')).toHaveCount(0)
    await expect(markdownHtmlOnDemo.locator('b').first()).toHaveText('粗体强调')

    const markdownOffFontSize = await markdownHtmlOffDemo.locator('.hai-markdown').evaluate(
      element => window.getComputedStyle(element).fontSize,
    )
    const markdownOnFontSize = await markdownHtmlOnDemo.locator('.hai-markdown').evaluate(
      element => window.getComputedStyle(element).fontSize,
    )
    expect(Number.parseFloat(markdownOnFontSize)).toBeGreaterThan(Number.parseFloat(markdownOffFontSize))

    const aiDocumentHtmlOffDemo = page.getByTestId('ai-document-html-off-demo')
    const aiDocumentHtmlOnDemo = page.getByTestId('ai-document-html-on-demo')
    await expect(aiDocumentHtmlOffDemo.locator('article b')).toHaveCount(0)
    await expect(aiDocumentHtmlOnDemo.locator('article b').first()).toHaveText('重点')
  })
})
