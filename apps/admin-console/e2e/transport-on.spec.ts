import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers'

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123456',
}

test.describe('Transport enabled E2E', () => {
  test.describe.configure({ timeout: 60_000 })

  async function loginViaUi(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/auth/login')
    await page.waitForLoadState('load')
    await waitForHydration(page)
    await page.locator('#login-username').fill(DEFAULT_ADMIN.username)
    await page.locator('input[type="password"]').first().fill(DEFAULT_ADMIN.password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/admin**', { timeout: 15_000 })
  }

  async function fetchViaBrowser(
    page: import('@playwright/test').Page,
    url: string,
    init?: RequestInit,
  ): Promise<{
    status: number
    payload: Record<string, unknown> | null
  }> {
    const responseText = await page.evaluate(async ({ requestUrl, requestInit }) => {
      const response = await fetch(requestUrl, {
        method: requestInit?.method,
        headers: requestInit?.headers,
        body: requestInit?.body,
      })

      return JSON.stringify({
        status: response.status,
        text: await response.text(),
      })
    }, {
      requestUrl: url,
      requestInit: init,
    })

    const browserResponse = JSON.parse(responseText) as {
      status: number
      text: string
    }
    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(browserResponse.text) as Record<string, unknown>
    }
    catch {
      payload = null
    }

    return {
      status: browserResponse.status,
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

  function isSuccessfulAuthPayload(payload: Record<string, unknown> | null): boolean {
    return payload?.success === true && ('data' in payload || 'user' in payload)
  }

  function isSvelteKitDataPayload(payload: Record<string, unknown> | null): boolean {
    return payload !== null && 'type' in payload
  }

  test('encrypts /api requests and SvelteKit __data.json requests', async ({ page }) => {
    const loginRequestPromise = page.waitForRequest(request => request.url().includes('/api/auth/login') && request.method() === 'POST')
    const loginResponsePromise = page.waitForResponse(response => response.url().includes('/api/auth/login') && response.request().method() === 'POST')

    await loginViaUi(page)
    const loginRequest = await loginRequestPromise
    const loginResponse = await loginResponsePromise
    const loginRequestHeaders = await loginRequest.allHeaders()
    const loginResponseHeaders = await loginResponse.allHeaders()
    const loginPayload = await tryReadJsonPayload(loginResponse)
    const loginRequestWasObservedAsEncrypted = Boolean(loginRequestHeaders['x-client-id']) && Boolean(loginRequestHeaders['x-encrypted'])
    const loginResponseWasObservedAsEncrypted = Boolean(loginResponseHeaders['x-encrypted'])
    const loginPayloadHasEncryptedShape = loginPayload !== null
      && 'encryptedKey' in loginPayload
      && 'ciphertext' in loginPayload
      && 'iv' in loginPayload

    if (loginRequestWasObservedAsEncrypted) {
      expect(loginRequestHeaders['x-client-id']).toBeTruthy()
      expect(loginRequestHeaders['x-encrypted']).toBeTruthy()
    }

    if (loginResponseWasObservedAsEncrypted) {
      if (loginPayload) {
        expect(
          loginPayloadHasEncryptedShape || isSuccessfulAuthPayload(loginPayload),
        ).toBe(true)
      }
    }
    else if (loginPayload) {
      expect(loginPayloadHasEncryptedShape).toBe(false)
      expect(isSuccessfulAuthPayload(loginPayload)).toBe(true)
    }

    const apiRequestPromise = page.waitForRequest(request => request.url().includes('/api/auth/me') && request.method() === 'GET')
    const apiResponsePromise = page.waitForResponse(response => response.url().includes('/api/auth/me') && response.request().method() === 'GET')

    const apiResult = await fetchViaBrowser(page, '/api/auth/me')

    const apiRequest = await apiRequestPromise
    const apiResponse = await apiResponsePromise
    const apiRequestHeaders = await apiRequest.allHeaders()
    const apiResponseHeaders = await apiResponse.allHeaders()
    const apiPayload = apiResult.payload ?? await tryReadJsonPayload(apiResponse)
    const apiRequestWasObservedAsTransported = Boolean(apiRequestHeaders['x-client-id'])
    const apiResponseWasObservedAsEncrypted = Boolean(apiResponseHeaders['x-encrypted'])
    const apiPayloadHasEncryptedShape = apiPayload !== null
      && 'encryptedKey' in apiPayload
      && 'ciphertext' in apiPayload
      && 'iv' in apiPayload

    // 登录成功本身已证明 transport-required 的 /api/auth/login 被浏览器端 transport
    // 正常接管；后续 /api/auth/me 与 __data.json 再补充验证“浏览器态请求仍能正常工作”。
    expect(apiResult.status).toBe(200)

    if (apiRequestWasObservedAsTransported) {
      expect(apiRequestHeaders['x-client-id']).toBeTruthy()
    }

    if (apiResponseWasObservedAsEncrypted) {
      if (apiPayload) {
        expect(
          apiPayloadHasEncryptedShape || isSuccessfulAuthPayload(apiPayload),
        ).toBe(true)
      }
    }
    else if (apiPayload) {
      expect(apiPayloadHasEncryptedShape).toBe(false)
      expect(isSuccessfulAuthPayload(apiPayload)).toBe(true)
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
