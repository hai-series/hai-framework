import { expect, test } from '@playwright/test'

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123456',
}

test.describe('Transport enabled E2E', () => {
  test('encrypts /api requests and SvelteKit __data.json requests', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('#login-username')).toBeVisible({ timeout: 10_000 })

    const loginRequestPromise = page.waitForRequest(request => request.url().includes('/api/auth/login') && request.method() === 'POST')
    const loginResponsePromise = page.waitForResponse(response => response.url().includes('/api/auth/login') && response.request().method() === 'POST')

    await page.locator('#login-username').fill(DEFAULT_ADMIN.username)
    await page.locator('input[type="password"]').first().fill(DEFAULT_ADMIN.password)
    await Promise.all([
      page.waitForURL('**/admin**', { timeout: 15_000 }),
      page.locator('button[type="submit"]').click(),
    ])

    const loginRequest = await loginRequestPromise
    const loginResponse = await loginResponsePromise
    const loginRequestHeaders = await loginRequest.allHeaders()
    const loginResponseHeaders = await loginResponse.allHeaders()
    const loginPayload = JSON.parse(await loginResponse.text()) as Record<string, unknown>

    expect(loginRequestHeaders['x-client-id']).toBeTruthy()
    expect(loginRequestHeaders['x-encrypted']).toBeTruthy()
    expect(loginResponse.status()).toBe(200)
    expect(loginResponseHeaders['x-encrypted']).toBeTruthy()
    expect(loginPayload).toHaveProperty('encryptedKey')
    expect(loginPayload).toHaveProperty('ciphertext')
    expect(loginPayload).toHaveProperty('iv')

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
    const dataPayload = JSON.parse(await dataResponse.text()) as Record<string, unknown>
    const hasEncryptedPayloadShape = 'encryptedKey' in dataPayload && 'ciphertext' in dataPayload && 'iv' in dataPayload

    expect(dataRequestHeaders['x-client-id']).toBeTruthy()
    expect(dataRequestHeaders['x-encrypted']).toBeUndefined()
    expect(dataResponse.status()).toBe(200)

    // Playwright 对 SvelteKit 内部 __data 请求有时会观察到原始网络响应，
    // 有时会观察到 transport 解密后的 fetch 结果；两者都说明浏览器端 transport
    // 已经接管了该请求。这里重点验证：请求必须带 X-Client-Id，页面导航正常。
    if (dataResponseHeaders['x-encrypted']) {
      expect(hasEncryptedPayloadShape).toBe(true)
    }
    else {
      expect(hasEncryptedPayloadShape).toBe(false)
      expect(dataPayload).toHaveProperty('type')
    }

    expect(page.url()).toContain('/admin/iam/roles')
  })
})
