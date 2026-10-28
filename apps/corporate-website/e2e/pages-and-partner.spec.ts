import { expect, test } from '@playwright/test'

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

test.describe('Corporate pages and partner flow', () => {
  test('partner login uses safe Toast for both credential failures on narrow and wide screens', async ({ page }, testInfo) => {
    await page.route('**/api/partners/admin/login', route => route.fulfill({
      status: 401,
      json: { success: false, error: { code: 'AUTH_FAILED', message: 'Private credential field details', traceId: 'partner-login-request' } },
    }))
    await page.goto('/partners/admin/login')
    await page.waitForLoadState('networkidle')
    for (const [username, width] of [['missing-user', 390], ['partner-admin', 1440]] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.locator('#admin-username').fill(username)
      await page.locator('#admin-password').fill('Incorrect-test-password!')
      await page.locator('button[type=submit]').click()
      const notification = page.locator('.hai-toast-item[data-variant=error]')
      await expect(notification.locator('.hai-toast-message')).toHaveText('用户名或密码不正确')
      await expect(notification.locator('code')).toHaveCount(0)
      await expect(notification).not.toContainText('partner-login-request')
      await expect(notification).not.toContainText('AUTH_FAILED')
      await expect(notification).not.toContainText('Private')
      await expect(notification).toBeInViewport({ ratio: 1 })
      await expect(page.locator('form .alert-error')).toHaveCount(0)
      await expect(page.locator('#admin-username')).toHaveValue(username)
      await page.screenshot({ path: testInfo.outputPath(`partner-login-toast-${width}.png`), fullPage: true })
      const diagnostics = notification.getByRole('button', { name: '查看排查信息', exact: true })
      await expect(diagnostics).toHaveAttribute('aria-expanded', 'false')
      await diagnostics.click()
      await expect(diagnostics).toHaveAttribute('aria-expanded', 'true')
      await expect(notification.locator('code')).toHaveText('partner-login-request')
      await expect(notification.getByText('联系客户支持或开发人员时，请提供此编号，便于定位相关记录。', { exact: true })).toBeVisible()
      await expect(notification).not.toContainText('Private')
      await expect(notification).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: testInfo.outputPath(`partner-login-diagnostics-${width}.png`), fullPage: true })
      await notification.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(notification).toHaveCount(0)
    }
  })

  test('contact delivery failure preserves input and success clears it', async ({ page }) => {
    let sent = false
    await page.route('**/api/contact', route => route.fulfill({
      json: { success: true, data: { sent } },
    }))
    await page.goto('/contact')
    await page.locator('#name').fill('Contact tester')
    await page.locator('#email').fill('contact@example.com')
    await page.locator('#message').fill('Please contact me about your services.')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.hai-toast-item[data-variant="error"]')).toBeVisible()
    await expect(page.locator('#name')).toHaveValue('Contact tester')
    await expect(page.locator('#email')).toHaveValue('contact@example.com')
    await expect(page.locator('#message')).toHaveValue('Please contact me about your services.')
    sent = true
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.hai-toast-item[data-variant="success"]')).toBeVisible()
    await expect(page.locator('#name')).toHaveValue('')
    await expect(page.locator('#email')).toHaveValue('')
    await expect(page.locator('#message')).toHaveValue('')
  })

  test('public pages render and support locale switch', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/海纳智企|Hai Enterprise/)

    await page.goto('/about')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/关于我们|About Us/)

    await page.goto('/services')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/我们的服务|Our Services/)

    await page.goto('/news')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/新闻动态|News/)

    await page.goto('/contact')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/联系我们|Contact Us/)

    await page.goto('/')
    await page.context().addCookies([
      {
        name: 'PARAGLIDE_LOCALE',
        value: 'en-US',
        path: '/',
        domain: 'localhost',
      },
    ])
    await page.reload()
    await expect(page.getByRole('link', { name: 'About' }).first()).toBeVisible()
  })

  test('partner register and admin records flow works', async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await page.goto('/partners')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/合作登记|Partner Registration/)

    const companyName = `E2E Corp ${Date.now()}`

    const registerRes = await page.request.post('/api/partners/register', {
      data: {
        companyName,
        contactName: 'E2E Tester',
        email: 'e2e@example.com',
        phone: '13800138000',
        cooperationType: 'solution',
        budgetRange: '100k-500k',
        message: 'This is an end-to-end test partnership request with sufficient details.',
        source: 'e2e',
      },
    })
    expect(registerRes.status()).toBe(201)
    const registerBody = await registerRes.json() as ApiResponse<{ id: string }>
    expect(registerBody.success).toBe(true)
    expect(registerBody.data?.id).toBeTruthy()
    const another = await page.request.post('/api/partners/register', { data: { companyName: `${companyName} Z`, contactName: 'Second Tester', email: 'second@example.com', phone: '13800138001', cooperationType: 'solution', budgetRange: '100k-500k', message: 'Second partnership request for sorting acceptance.', source: 'e2e' } })
    expect(another.status()).toBe(201)

    const unauthorized = await page.request.get('/api/partners/admin/records')
    expect([401, 403]).toContain(unauthorized.status())

    const loginRes = await page.request.post('/api/partners/admin/login', {
      form: {
        username: 'partner-admin',
        password: 'CHANGE_ME_STRONG_PASSWORD',
      },
    })
    expect(loginRes.ok()).toBeTruthy()
    const loginBody = await loginRes.json() as ApiResponse<{ username: string, loggedIn: boolean, expiresIn: number }>
    expect(loginBody.success).toBe(true)
    expect(loginBody.data?.loggedIn).toBe(true)

    await page.goto('/partners/admin')
    await expect(page).toHaveURL(/\/partners\/admin/)
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('table')).toContainText(companyName)

    const filters = page.getByTestId('partner-filters')
    const disclosure = filters.locator('button[aria-controls]')
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await disclosure.click()
    const status = filters.getByRole('combobox')
    await status.click()
    const pending = page.getByRole('option').nth(1)
    const selectedStatus = (await pending.textContent())?.trim() ?? ''
    expect(selectedStatus).not.toBe('')
    await pending.click()
    await disclosure.click()
    await expect(status).toBeHidden()
    await disclosure.click()
    await expect(status).toHaveValue(selectedStatus)
    await filters.getByTestId('partner-search').locator('input').fill(companyName)
    await filters.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/status=pending/)
    await expect(page.locator('table')).toContainText(companyName)
    await filters.getByRole('button', { name: /重置|Reset|リセット/, exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.has('status')).toBe(false)
    await expect.poll(() => new URL(page.url()).searchParams.has('search')).toBe(false)

    const companyHeader = page.getByRole('columnheader', { name: /公司|Company/ })
    await companyHeader.getByRole('button').click()
    await expect(companyHeader).toHaveAttribute('aria-sort', 'ascending')
    await expect(page.locator('tbody tr').first()).toContainText(companyName)
    await companyHeader.getByRole('button').click()
    await expect(companyHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(page.locator('tbody tr').first()).toContainText(`${companyName} Z`)
    const ascending = await page.request.get('/api/partners/admin/records?page=1&pageSize=20&sortBy=company_name&sortDirection=asc')
    const ascendingData = await ascending.json() as ApiResponse<{ items: Array<{ company_name: string }> }>
    expect(ascendingData.data?.items[0]?.company_name).toBe(companyName)
    const invalidSort = await page.request.get('/api/partners/admin/records?sortBy=company_name%3BDROP&sortDirection=asc')
    expect(invalidSort.status()).toBe(400)
    for (const width of [390, 1440, 1920, 2560, 3840]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('.hai-pagination__navigation')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`partners-unified-${width}.png`), animations: 'disabled' })
    }
    const recordsRes = await page.request.get('/api/partners/admin/records?page=1&pageSize=20')
    expect(recordsRes.ok()).toBeTruthy()
    const body = await recordsRes.json() as ApiResponse<{ items: Array<{ company_name: string }> }>
    expect(body.success).toBe(true)
    expect((body.data?.items ?? []).some(item => item.company_name === companyName)).toBe(true)
  })
})
