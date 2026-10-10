/**
 * 对 CLI 实际生成的 fullstack 项目执行交互及截图验收。
 * 先启动 serv 与各端 Vite preview，传入项目路径、截图目录及可选各端 URL。
 * 所有创建的数据均属于独立验收项目，不访问工作区应用数据库。
 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const [projectDirectory, outputDirectory, webUrl = 'http://127.0.0.1:4173', appUrl = 'http://127.0.0.1:4180', desktopUrl = 'http://127.0.0.1:4181'] = process.argv.slice(2)
assert(projectDirectory && outputDirectory, 'A generated project and screenshot output directory are required')
const require = createRequire(path.join(path.resolve(projectDirectory), 'package.json'))
const { chromium, expect } = require('@playwright/test')

const browser = await chromium.launch({ channel: 'chrome' })
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'Scaffold-test-Admin123!'
const password = 'Visual-test-User123!'
const screenshots = []
const pageErrors = []
const consoleErrors = []
const requestFailures = []
const expectedAuthResponses = new Set()
const runId = randomUUID().slice(0, 8)
await mkdir(outputDirectory, { recursive: true })

function observe(page) {
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() === 401 && /\/auth\/(?:me|refresh|login)$/.test(new URL(response.url()).pathname))
      expectedAuthResponses.add(response.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push({ message: message.text(), url: message.location().url })
  })
  page.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
}

async function login(page, username, secret) {
  const form = page.getByTestId('login-form')
  await expect(form).toBeVisible()
  await page.locator('#login-username').fill(username)
  await form.locator('input[type="password"]').fill(secret)
  await form.getByRole('button', { name: /登录|Sign in|Login|Log in/i }).click()
}

async function snapshot(page, name, { fullPage = false } = {}) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(outputDirectory, `${name}.png`), fullPage, animations: 'disabled' })
  const overflow = await page.evaluate(() => [...document.querySelectorAll('main *, header *')].map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter(element => element.right > innerWidth + 1).slice(0, 12))
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    process.stdout.write(`Overflow ${name}: ${JSON.stringify(overflow)}\n`)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  screenshots.push({ name, viewport: page.viewportSize(), fullPage, title: await page.title(), documentWidth: await page.evaluate(() => document.documentElement.scrollWidth) })
  process.stdout.write(`Captured ${name}\n`)
}

async function createUser(page, username, displayName, email) {
  await page.getByTestId('create-user').click()
  await page.getByTestId('user-username').locator('input').fill(username)
  await page.getByTestId('user-display-name').locator('input').fill(displayName)
  await page.getByTestId('user-email').locator('input').fill(email)
  await page.getByTestId('user-password').locator('input').fill(password)
  await page.getByTestId('user-save').click()
  await expect(page.getByTestId('user-editor')).not.toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: username })).toBeVisible()
}

try {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await adminContext.newPage()
  observe(page)
  await page.goto(webUrl)
  await expect(page.getByTestId('login-form')).toBeVisible()
  await snapshot(page, '01-login-desktop')
  await login(page, 'admin', 'Incorrect-test-password!')
  await expect(page.getByTestId('login-form')).toContainText(/不正确|incorrect/)
  await snapshot(page, '02-login-feedback')
  await login(page, 'admin', adminPassword)
  await expect(page.getByTestId('users-page')).toBeVisible()
  await page.getByTestId('create-user').click()
  await snapshot(page, '03-create-user-dialog')
  await page.getByTestId('user-editor').getByRole('button', { name: /取消|Cancel/, exact: true }).click()
  await expect(page.getByTestId('user-editor')).not.toBeVisible()
  const usernames = [1, 2, 3].map(index => `visual-${runId}-${index}`)
  for (const [index, name] of ['林晓', '陈雨', 'Alex Chen'].entries())
    await createUser(page, usernames[index], name, `${usernames[index]}@example.com`)
  const userRow = page.getByRole('row').filter({ hasText: usernames[0] })
  await userRow.getByTestId('user-avatar-input').setInputFiles(path.resolve('apps/desktop-app/src-tauri/icons/128x128.png'))
  await expect.poll(() => userRow.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  await snapshot(page, '04-users-desktop')
  await userRow.getByRole('button', { name: /编辑|Edit/, exact: true }).click()
  await snapshot(page, '05-edit-user-dialog')
  await page.getByTestId('user-editor').getByRole('button', { name: /取消|Cancel/, exact: true }).click()
  await page.getByTestId('users-search').locator('input').fill(`missing-${runId}`)
  await page.getByTestId('users-page').getByRole('button', { name: /查询|Search/ }).click()
  await expect(page.getByRole('row').filter({ hasText: usernames[0] })).toHaveCount(0)
  await snapshot(page, '06-users-empty-search')
  await page.getByTestId('users-search').locator('input').fill('')
  await page.getByTestId('users-page').getByRole('button', { name: /查询|Search/ }).click()
  await expect(userRow).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await snapshot(page, '07-users-mobile')
  await page.getByTestId('mobile-menu').click()
  await expect(page.getByTestId('nav-users')).toBeVisible()
  await snapshot(page, '08-mobile-navigation')
  await page.getByTestId('nav-users').click()
  await page.getByTestId('create-user').click()
  await snapshot(page, '09-create-user-mobile')
  await page.getByTestId('user-editor').getByRole('button', { name: /取消|Cancel/, exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByTestId('nav-roles').click()
  await expect(page.getByTestId('roles-page')).toBeVisible()
  await expect(page.getByTestId('roles-page').getByRole('heading', { name: /管理员|Administrator/, exact: true })).toBeVisible()
  await snapshot(page, '10-roles-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await snapshot(page, '10-roles-mobile', { fullPage: true })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByTestId('roles-page').getByRole('button', { name: /编辑说明|Edit description/ }).first().click()
  await snapshot(page, '11-role-description-dialog')
  await page.getByRole('dialog').getByRole('button', { name: /取消|Cancel/, exact: true }).click()
  await page.getByTestId('nav-audit').click()
  await expect(page.getByTestId('audit-page')).toBeVisible()
  await page.getByTestId('audit-resource').locator('input').fill('users')
  await page.getByTestId('audit-page').getByRole('button', { name: /查询|Search/ }).click()
  await expect(page.getByTestId('audit-page')).toContainText('create')
  await snapshot(page, '12-audit-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await snapshot(page, '12-audit-mobile')
  await page.getByTestId('audit-page').getByRole('button', { name: /详情|Details/ }).first().click()
  await snapshot(page, '13-audit-details-dialog')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.locator('#audit-start').fill('2026-10-12')
  await page.locator('#audit-end').fill('2026-10-10')
  await page.getByTestId('audit-page').getByRole('button', { name: /查询|Search/ }).click()
  await expect(page.getByTestId('error')).toContainText(/不能早于|before/)
  await snapshot(page, '14-audit-date-feedback')
  await page.getByTestId('nav-users').click()
  await userRow.getByRole('button', { name: /删除|Delete/, exact: true }).click()
  await snapshot(page, '15-delete-confirmation')
  await page.getByRole('dialog').getByRole('button', { name: /取消|Cancel/, exact: true }).click()

  const userContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const userPage = await userContext.newPage()
  observe(userPage)
  await userPage.goto(webUrl)
  await login(userPage, usernames[0], password)
  await expect(userPage.getByTestId('settings-page')).toBeVisible()
  for (const name of ['nav-users', 'nav-roles', 'nav-audit'])
    await expect(userPage.getByTestId(name)).toHaveCount(0)
  await snapshot(userPage, '16-settings-desktop', { fullPage: true })
  const fileChooser = userPage.waitForEvent('filechooser')
  await userPage.getByTestId('profile-form').getByRole('button', { name: /上传头像|Upload avatar/ }).click()
  await (await fileChooser).setFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid avatar') })
  await expect(userPage.getByTestId('error')).toContainText(/PNG/)
  await snapshot(userPage, '17-avatar-validation')
  await userPage.getByTestId('profile-form').locator('input[name="displayName"]').fill('林晓 · Workspace')
  await userPage.getByTestId('profile-form').getByRole('button', { name: /保存|Save/, exact: true }).click()
  await expect(userPage.getByTestId('notice')).toBeVisible()
  await userPage.getByTestId('profile-language').click()
  await userPage.getByRole('option', { name: 'English', exact: true }).click()
  await expect(userPage.getByTestId('nav-settings')).toHaveText('Personal settings')
  await userPage.getByTestId('profile-theme').click()
  await userPage.getByRole('option').nth(1).click()
  await expect(userPage.locator('html')).toHaveAttribute('data-theme', 'dark')
  await userPage.reload()
  await expect(userPage.getByTestId('settings-page')).toBeVisible()
  await expect(userPage.getByTestId('profile-form').locator('input[name="displayName"]')).toHaveValue('林晓 · Workspace')
  await expect(userPage.locator('html')).toHaveAttribute('data-theme', 'dark')
  await snapshot(userPage, '18-settings-english-dark', { fullPage: true })
  await userPage.setViewportSize({ width: 390, height: 844 })
  await snapshot(userPage, '19-settings-mobile-dark', { fullPage: true })
  await userPage.setViewportSize({ width: 320, height: 568 })
  await snapshot(userPage, '20-settings-small-screen', { fullPage: true })
  await userContext.close()
  await adminContext.close()

  for (const [platform, url, viewport] of [['app', appUrl, { width: 390, height: 844 }], ['desktop', desktopUrl, { width: 1280, height: 800 }]]) {
    const context = await browser.newContext({ viewport })
    const hostPage = await context.newPage()
    observe(hostPage)
    await hostPage.goto(url)
    await expect(hostPage.getByTestId('login-form')).toBeVisible()
    await snapshot(hostPage, `21-${platform}-login`)
    await login(hostPage, 'admin', adminPassword)
    await expect(hostPage.getByTestId('users-page')).toBeVisible()
    await snapshot(hostPage, `22-${platform}-workspace`)
    await context.close()
  }
  assert.deepEqual(pageErrors, [], 'All reviewed pages must remain free of uncaught browser errors')
  const unexpectedConsoleErrors = consoleErrors.filter(error => !error.message.includes('401') || !expectedAuthResponses.has(error.url))
  assert.deepEqual(unexpectedConsoleErrors, [], 'Only observed authentication probes and invalid-credential responses may return HTTP 401')
  assert.deepEqual(requestFailures, [], 'All reviewed pages must remain free of failed network requests')
}
finally {
  await writeFile(path.join(outputDirectory, 'evidence.json'), `${JSON.stringify({ screenshots, pageErrors, consoleErrors, expectedAuthResponses: [...expectedAuthResponses], requestFailures }, null, 2)}\n`)
  await browser.close()
}
process.stdout.write(`Visual interaction verification passed: ${screenshots.length} screenshots\n`)
