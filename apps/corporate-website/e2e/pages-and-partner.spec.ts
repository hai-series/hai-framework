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

  test('partner register and admin records flow works', async ({ page }) => {
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

    const recordsRes = await page.request.get('/api/partners/admin/records?page=1&pageSize=20')
    expect(recordsRes.ok()).toBeTruthy()
    const body = await recordsRes.json() as ApiResponse<{ items: Array<{ company_name: string }> }>
    expect(body.success).toBe(true)
    expect((body.data?.items ?? []).some(item => item.company_name === companyName)).toBe(true)
  })
})
