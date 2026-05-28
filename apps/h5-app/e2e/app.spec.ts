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

    await page.goto('/discover')

    await page.getByRole('button', { name: /开始识别|Analyze/ }).click()

    const errorAlert = page.locator('.alert-error')
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
