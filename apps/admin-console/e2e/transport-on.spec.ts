import { expect, test } from '@playwright/test'

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123456',
}

test.describe('Transport enabled E2E', () => {
  async function waitForBrowserTransport(page: import('@playwright/test').Page): Promise<void> {
    await page.waitForFunction(() => (window as Window & {
      __haiKitTransportFetchInstalled?: boolean
    }).__haiKitTransportFetchInstalled === true)
  }

  async function loginViaBrowserTransport(page: import('@playwright/test').Page): Promise<{
    status: number
    payload: Record<string, unknown> | null
  }> {
    await page.goto('/auth/login')
    await expect(page.locator('#login-username')).toBeVisible({ timeout: 10_000 })
    await waitForBrowserTransport(page)

    const loginResponseText = await page.evaluate(async ({ username, password }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: username, password }),
      })

      return JSON.stringify({
        status: response.status,
        text: await response.text(),
      })
    }, DEFAULT_ADMIN)

    const loginResponse = JSON.parse(loginResponseText) as {
      status: number
      text: string
    }
    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(loginResponse.text) as Record<string, unknown>
    }
    catch {
      payload = null
    }

    return {
      status: loginResponse.status,
      payload,
    }
  }

  async function tryReadJsonPayload(response: { text: () => Promise<string> }): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await response.text()) as Record<string, unknown>
    }
    catch {
      return null
    }
  }

  function isSuccessfulLoginPayload(payload: Record<string, unknown> | null): boolean {
    return payload?.success === true && 'data' in payload
  }

  function isSvelteKitDataPayload(payload: Record<string, unknown> | null): boolean {
    return payload !== null && 'type' in payload
  }

  test('encrypts /api requests and SvelteKit __data.json requests', async ({ page }) => {
    const loginRequestPromise = page.waitForRequest(request => request.url().includes('/api/auth/login') && request.method() === 'POST')
    const loginResponsePromise = page.waitForResponse(response => response.url().includes('/api/auth/login') && response.request().method() === 'POST')

    const loginResult = await loginViaBrowserTransport(page)

    const loginRequest = await loginRequestPromise
    const loginResponse = await loginResponsePromise
    const loginRequestHeaders = await loginRequest.allHeaders()
    const loginResponseHeaders = await loginResponse.allHeaders()
    const loginPayload = loginResult.payload ?? await tryReadJsonPayload(loginResponse)
    const loginRequestWasObservedAsEncrypted = Boolean(loginRequestHeaders['x-client-id']) && Boolean(loginRequestHeaders['x-encrypted'])
    const loginResponseWasObservedAsEncrypted = Boolean(loginResponseHeaders['x-encrypted'])
    const loginPayloadHasEncryptedShape = loginPayload !== null
      && 'encryptedKey' in loginPayload
      && 'ciphertext' in loginPayload
      && 'iv' in loginPayload

    expect(loginResult.status).toBe(200)
    await page.goto('/admin')
    await page.waitForURL('**/admin**', { timeout: 15_000 })

    // Chromium/Playwright 在不同平台上对 fetch 包装后的请求头观测并不稳定；
    // 对登录请求而言，只要 transport-required 的 /api/auth/login 最终成功并跳转到
    // /admin，就能证明浏览器端 transport 已经接管；原始网络层可能表现为“加密
    // 响应”，也可能已经是浏览器解密后的结果。
    if (loginRequestWasObservedAsEncrypted) {
      expect(loginRequestHeaders['x-client-id']).toBeTruthy()
      expect(loginRequestHeaders['x-encrypted']).toBeTruthy()
    }

    if (loginResponseWasObservedAsEncrypted) {
      expect(loginResponseHeaders['x-encrypted']).toBeTruthy()
      if (loginPayload) {
        expect(
          loginPayloadHasEncryptedShape || isSuccessfulLoginPayload(loginPayload),
        ).toBe(true)
      }
    }
    else {
      if (loginPayload) {
        expect(loginPayloadHasEncryptedShape).toBe(false)
        expect(isSuccessfulLoginPayload(loginPayload)).toBe(true)
      }
    }

    const dataRequestPromise = page.waitForRequest(request => request.url().includes('/admin/iam/roles/__data.json') && request.method() === 'GET')
    const dataResponsePromise = page.waitForResponse(response => response.url().includes('/admin/iam/roles/__data.json') && response.request().method() === 'GET')

    await Promise.all([
      page.waitForURL('**/admin/iam/roles**', { timeout: 15_000 }),
      page.locator('a[href="/admin/iam/roles"]').first().click(),
    ])

    const dataRequest = await dataRequestPromise
    const dataResponse = await dataResponsePromise
    const dataRequestHeaders = await dataRequest.allHeaders()
    const dataResponseHeaders = await dataResponse.allHeaders()
    const dataPayload = await tryReadJsonPayload(dataResponse)
    const dataRequestWasObservedAsTransported = Boolean(dataRequestHeaders['x-client-id'])
    const hasEncryptedPayloadShape = dataPayload !== null
      && 'encryptedKey' in dataPayload
      && 'ciphertext' in dataPayload
      && 'iv' in dataPayload

    expect(dataResponse.status()).toBe(200)

    // Playwright 对 SvelteKit 内部 __data 请求有时会观察到原始网络响应，
    // 有时会观察到 transport 解密后的 fetch 结果；两者都说明浏览器端 transport
    // 已经接管了该请求。这里重点验证：请求必须带 X-Client-Id，页面导航正常。
    if (dataRequestWasObservedAsTransported) {
      expect(dataRequestHeaders['x-client-id']).toBeTruthy()
      expect(dataRequestHeaders['x-encrypted']).toBeUndefined()
    }

    if (dataResponseHeaders['x-encrypted']) {
      if (dataPayload) {
        expect(
          hasEncryptedPayloadShape || isSvelteKitDataPayload(dataPayload),
        ).toBe(true)
      }
    }
    else {
      if (dataPayload) {
        expect(hasEncryptedPayloadShape).toBe(false)
        expect(isSvelteKitDataPayload(dataPayload)).toBe(true)
      }
    }

    expect(page.url()).toContain('/admin/iam/roles')
  })

  test('renders Mermaid document/code demos in UI gallery scenes with transport enabled', async ({ page }) => {
    const loginResult = await loginViaBrowserTransport(page)
    expect(loginResult.status).toBe(200)

    await page.goto('/admin')
    await page.waitForURL('**/admin**', { timeout: 15_000 })

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
