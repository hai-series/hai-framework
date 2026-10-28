import { expect, test } from '@playwright/test'

test.describe('h5-app core flows', () => {
  test('bottom tabs navigate between pages', async ({ page }) => {
    await page.goto('/')
    const bottomNav = page.getByRole('navigation')

    await bottomNav.getByRole('button', { name: /识图|Vision/ }).click()
    await expect(page).toHaveURL(/\/discover$/)

    await bottomNav.getByRole('button', { name: /记录|Records/ }).click()
    await expect(page).toHaveURL(/\/cart$/)

    await bottomNav.getByRole('button', { name: /我的|Profile/ }).click()
    await expect(page).toHaveURL(/\/profile$/)

    await bottomNav.getByRole('button', { name: /首页|Home/ }).click()
    await expect(page).toHaveURL(/\/$/)
    for (const width of [390, 1440, 1920, 2560, 3840]) {
      await page.setViewportSize({ width, height: 960 })
      const availableWidth = await page.evaluate(() => document.documentElement.clientWidth)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await page.locator('.hai-mobile-shell').boundingBox())!.width).toBeGreaterThan(availableWidth - 2)
      expect((await bottomNav.boundingBox())!.width).toBeGreaterThan(availableWidth - 2)
    }
  })

  test('paraglide locale cookie renders english copy', async ({ context, page, baseURL }) => {
    if (!baseURL)
      throw new Error('baseURL is required for locale cookie test')

    await context.addCookies([
      {
        name: 'PARAGLIDE_LOCALE',
        value: 'en-US',
        url: baseURL,
      },
    ])

    await page.goto('/')
    await expect(page.getByPlaceholder('Search products')).toBeVisible()

    await page.goto('/profile')
    await expect(page.getByText('Not logged in')).toBeVisible()
  })

  test('discover page shows no-file validation and history api works', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const registerRes = await page.request.post('/api/auth/register', {
      data: {
        username: `h5e2e${uniqueSuffix}`,
        email: `h5e2e_${uniqueSuffix}@test.local`,
        password: 'test123456',
      },
    })

    expect(registerRes.ok()).toBeTruthy()

    // history 仅在客户端 onMount 后请求；等待它可确保 Svelte 已完成 hydration，
    // 避免 SSR 按钮尚未绑定 onclick 时过早点击。
    const initialHistoryResponse = page.waitForResponse(response =>
      response.request().method() === 'GET'
      && response.url().endsWith('/api/vision/history'))

    await page.goto('/discover')
    await initialHistoryResponse

    await page.getByRole('button', { name: /开始识别|Analyze/ }).click()

    const errorAlert = page.locator('.hai-toast-item[data-variant=error]')
    await expect(errorAlert).toBeVisible()
    await expect(errorAlert).toContainText(/请先选择或拍摄一张图片|Please select or capture an image first/)

    const historyRes = await page.request.get('/api/vision/history')
    expect(historyRes.ok()).toBeTruthy()

    const historyBody = await historyRes.json() as {
      success: boolean
      data?: unknown[]
    }

    expect(historyBody.success).toBe(true)
    expect(Array.isArray(historyBody.data)).toBe(true)
  })
})
