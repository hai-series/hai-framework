import { expect, test } from '@playwright/test'

test.describe('h5-app core flows', () => {
  test('bottom tabs navigate between pages', async ({ page }) => {
    await page.goto('/')

    await page.locator('a[href="/discover"]').click()
    await expect(page).toHaveURL(/\/discover$/)

    await page.locator('a[href="/cart"]').click()
    await expect(page).toHaveURL(/\/cart$/)

    await page.locator('a[href="/profile"]').click()
    await expect(page).toHaveURL(/\/profile$/)

    await page.locator('a[href="/"]').click()
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

  test('discover page shows no-file validation and history api works', async ({ page, request }) => {
    await page.goto('/discover')

    await page.getByRole('button', { name: /开始识别|Analyze/ }).click()

    const errorAlert = page.locator('.alert-error')
    await expect(errorAlert).toBeVisible()
    await expect(errorAlert).toContainText(/请先选择或拍摄一张图片|Please select or capture an image first/)

    const historyRes = await request.get('/api/vision/history')
    expect(historyRes.ok()).toBeTruthy()

    const historyBody = await historyRes.json() as {
      success: boolean
      data?: unknown[]
    }

    expect(historyBody.success).toBe(true)
    expect(Array.isArray(historyBody.data)).toBe(true)
  })
})
