/**
 * 调试测试 - 捕获浏览器端 console 输出，定位登录报错原因
 */
import { expect, test } from '@playwright/test'
import { registerViaApi, uniqueUser } from './helpers'

test('调试登录 - 捕获浏览器 console', async ({ page, request }) => {
  const consoleMessages: string[] = []
  const pageErrors: string[] = []
  const networkRequests: string[] = []

  page.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  // 拦截网络请求和响应
  page.on('response', async (response) => {
    const url = response.url()
    const status = response.status()
    if (url.includes('/api/')) {
      let body = ''
      try {
        body = await response.text()
      }
      catch {
        body = '<unable to read>'
      }
      const hdrs = JSON.stringify(response.headers())
      networkRequests.push(`[${status}] ${response.request().method()} ${url}\n  Headers: ${hdrs}\n  Body: ${body}`)
    }
  })

  // 注册用户
  const user = uniqueUser('dbglogin')
  await registerViaApi(request, user)

  // 打开登录页
  await page.goto('/auth/login')
  await page.waitForLoadState('load')
  await page.waitForTimeout(2000)

  // 填写并提交
  await page.locator('#login-username').fill(user.username)
  await page.locator('input[type="password"]').first().fill(user.password)
  await page.locator('button[type="submit"]').click()

  // 等待结果
  await page.waitForTimeout(8000)

  // 打印所有浏览器输出
  // eslint-disable-next-line no-console
  console.log('\n=== BROWSER CONSOLE ===')
  // eslint-disable-next-line no-console
  consoleMessages.forEach(m => console.log(m))
  // eslint-disable-next-line no-console
  console.log('\n=== PAGE ERRORS ===')
  // eslint-disable-next-line no-console
  pageErrors.forEach(e => console.log(e))
  // eslint-disable-next-line no-console
  console.log('\n=== NETWORK REQUESTS ===')
  // eslint-disable-next-line no-console
  networkRequests.forEach(r => console.log(r))
  // eslint-disable-next-line no-console
  console.log('\n=== CURRENT URL ===')
  // eslint-disable-next-line no-console
  console.log(page.url())

  // 检查是否有 alert
  const alertEl = page.locator('[role="alert"], .alert')
  const alertCount = await alertEl.count()
  if (alertCount > 0) {
    const alertText = await alertEl.first().textContent()
    // eslint-disable-next-line no-console
    console.log('\n=== ALERT TEXT ===')
    // eslint-disable-next-line no-console
    console.log(alertText)
  }

  // 这个测试仅用于调试，总是通过
  expect(true).toBe(true)
})
