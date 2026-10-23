import { expect, test } from '@playwright/test'
import { transportAdmin, waitForHydration } from './helpers'

test.describe('Transport enabled E2E', () => {
  test.describe.configure({ timeout: 60_000 })

  async function loginViaUi(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/auth/login')
    await page.waitForLoadState('load')
    await waitForHydration(page)
    await page.locator('#login-username').fill(transportAdmin.username)
    await page.locator('input[type="password"]').first().fill(transportAdmin.password)
    const [loginResponse] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'),
      page.locator('button[type="submit"]').click(),
    ])
    expect(loginResponse.status()).toBe(200)
    await page.waitForURL('**/admin**', { timeout: 15_000 })

    // `waitForHydration` 的 transport 标记由根布局设置，会跨路由保留；这里再等待
    // 登录后侧边栏的实际业务入口，避免在 `/admin` 页面尚未完成客户端挂载时继续操作。
    await page.locator('a[href="/admin/iam/roles"]').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  async function expectEncrypted(response: import('@playwright/test').Response) {
    expect(response.ok()).toBe(true)
    const requestHeaders = await response.request().allHeaders()
    expect(requestHeaders['x-client-id']).toBeTruthy()
    expect(requestHeaders['x-encrypted']).toBe('true')
    expect((await response.allHeaders())['x-encrypted']).toBe('true')
    const payload = await response.json()
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
  }

  test('encrypts login, API GET and SvelteKit navigation while the browser receives usable data', async ({ page }) => {
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST')
    await loginViaUi(page)
    await expect(page.getByTestId('app-environment-badge')).toBeVisible()
    await expectEncrypted(await loginResponse)

    const meResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/me') && response.request().method() === 'GET')
    const me = await page.evaluate(async () => {
      const response = await fetch('/api/auth/me')
      return { status: response.status, body: await response.json() }
    })
    expect(me.status).toBe(200)
    expect(me.body.success).toBe(true)
    expect(me.body.user?.username ?? me.body.data?.user?.username).toBe(transportAdmin.username)
    const networkMe = await meResponse
    expect((await networkMe.request().allHeaders())['x-hai-transport']).toBeTruthy()
    await expectEncrypted(networkMe)

    const dataResponse = page.waitForResponse(response => response.url().includes('/admin/iam/roles/__data.json'))
    await page.locator('a[href="/admin/iam/roles"]').first().click()
    await expect(page).toHaveURL(/\/admin\/iam\/roles/)
    await expect(page.locator('table')).toBeVisible()
    const networkData = await dataResponse
    expect((await networkData.request().allHeaders())['x-hai-transport']).toBeTruthy()
    await expectEncrypted(networkData)
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
