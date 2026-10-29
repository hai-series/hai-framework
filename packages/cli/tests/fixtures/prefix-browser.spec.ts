/** 实际生成工程的子目录验收；由门禁复制并替换应用类型与公开路径。 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'

const kind: string = 'SCAFFOLD_KIND'
const prefix = '/yyy'

test('挂载目录下资源、运行配置、认证和刷新保持有效', async ({ page, request, context }, testInfo) => {
  const screenshot = (name: string) => process.env.HAI_AUTH_EVIDENCE_DIR ? path.join(process.env.HAI_AUTH_EVIDENCE_DIR, name) : testInfo.outputPath(name)
  const invalidAssets: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', (entry) => {
    const url = new URL(entry.url())
    if (['script', 'stylesheet', 'image', 'font'].includes(entry.resourceType()) && url.origin === new URL(page.url()).origin && !url.pathname.startsWith(`${prefix}/`))
      invalidAssets.push(url.pathname)
  })
  if (kind === 'sveltekit') {
    const denied = await request.get(`${prefix}/api/prefix-probe`, { maxRedirects: 0 })
    expect(denied.status()).toBe(401)
    expect(denied.headers().location).toBeUndefined()
    const diagnostic = await context.newPage()
    try {
      expect((await diagnostic.goto(`${prefix}/api/prefix-probe`))?.status()).toBe(401)
      await diagnostic.screenshot({ path: screenshot('sveltekit-prefix-api-401.png') })
    }
    finally { await diagnostic.close() }
    const protectedPage = await request.get(`${prefix}/admin`, { maxRedirects: 0 })
    expect(protectedPage.status()).toBe(302)
    expect(protectedPage.headers().location).toMatch(/^\/yyy\/auth\/login\?/)
    expect((await page.goto(`${prefix}/auth/login`))?.status()).toBe(200)
    await expect(page.locator('#login-username')).toBeVisible()
    expect((await page.reload())?.status()).toBe(200)
    await page.screenshot({ path: screenshot('sveltekit-prefix-login.png'), fullPage: true })
    await page.getByRole('link', { name: /立即注册|Register now/i }).click()
    await expect(page).toHaveURL(/\/yyy\/auth\/register(?:\?|$)/)
    const form = page.locator('.register-form')
    const username = `pref${randomUUID().replaceAll('-', '').slice(0, 12)}`
    const password = `Prefix-${randomUUID()}!`
    await form.locator('#register-username').fill(username)
    await form.locator('#register-email').fill(`${username}@example.invalid`)
    await form.locator('#register-password').fill(password)
    await form.locator('#register-confirm-password').fill(password)
    await form.locator('button[type="submit"]').click()
    await expect(form).not.toBeVisible()
    expect((await page.request.get(`${prefix}/api/auth/me`)).status()).toBe(200)
    await context.clearCookies()
    await page.goto(`${prefix}/auth/login`)
    await page.reload()
    await page.locator('#login-username').fill(username)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('.login-form button[type="submit"]').click()
    await expect(page.locator('.login-form')).not.toBeVisible()
    expect((await page.request.get(`${prefix}/api/auth/me`)).status()).toBe(200)
    expect(new URL(page.url()).pathname.startsWith(`${prefix}/`)).toBe(true)
  }
  else {
    expect((await request.get('/runtime-config.js')).status()).toBe(404)
    const runtime = await request.get(`${prefix}/runtime-config.js`)
    expect(runtime.status()).toBe(200)
    expect(runtime.headers()['cache-control']).toBe('no-store')
    await page.goto(`${prefix}/`)
    await expect(page.getByTestId('login-form')).toBeVisible()
    expect(await page.evaluate(() => (globalThis as typeof globalThis & { __HAI_PUBLIC_CONFIG__?: { apiBase?: string } }).__HAI_PUBLIC_CONFIG__?.apiBase)).toBe(`${new URL(page.url()).origin}/api/v1`)
    expect((await page.reload())?.status()).toBe(200)
    await expect(page.getByTestId('login-form')).toBeVisible()
    await page.screenshot({ path: screenshot('vite-prefix-login.png'), fullPage: true })
    const configuration = await context.newPage()
    try {
      expect((await configuration.goto(`${prefix}/runtime-config.js`))?.status()).toBe(200)
      await configuration.screenshot({ path: screenshot('vite-prefix-runtime-config.png') })
    }
    finally { await configuration.close() }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  // 等待浏览器实际布局过渡结束，避免把桌面侧栏收起的中间帧当作手机布局。
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
  })
  if (kind === 'sveltekit') {
    const sidebar = page.locator('#admin-sidebar')
    const menu = page.getByRole('button', { name: /打开侧栏|Open sidebar/i })
    await expect(sidebar).not.toBeVisible()
    await menu.click()
    await expect(sidebar).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sidebar).not.toBeVisible()
    await expect(menu).toBeFocused()
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
    })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: screenshot(`${kind}-prefix-mobile.png`), fullPage: true })
  expect(invalidAssets).toEqual([])
  expect(errors).toEqual([])
})
