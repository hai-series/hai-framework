import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** 独立测试账号只用于本轮隔离数据库，录像开始前完成认证。 */
export async function signupWorkbench(page: Page, name = `workbench-${Date.now()}-${Math.floor(Math.random() * 10000)}`) {
  const initial = await page.goto('/')
  expect(initial?.status()).toBe(200)
  await page.getByLabel('Username', { exact: true }).fill(name)
  await page.getByLabel('Password', { exact: true }).fill('Reliable-Passphrase-42')
  // Vite 首次优化可能在认证后重载页面，先等真实工作台读取完成。
  const ready = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith('/api/workspace') && !url.search && response.request().method() === 'GET'
  })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect((await ready).status()).toBe(200)
  await expect(page.getByRole('button', { name: 'New task', exact: true })).toBeEnabled()
}

/** 通过真实业务入口创建模板，不用 route.fulfill 替代持久化。 */
export async function createWorkbenchArtifact(page: Page, title: string, kind: 'markdown' | 'html' | 'table' | 'chart' = 'markdown') {
  if (!await page.getByRole('region', { name: 'Artifact workspace', exact: true }).isVisible())
    await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Artifacts', exact: true }).click()
  await page.getByRole('button', { name: 'New artifact', exact: true }).click()
  await page.getByLabel('Artifact title', { exact: true }).fill(title)
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption(kind)
  const response = page.waitForResponse(response => response.url().includes('/api/workspace') && response.request().method() === 'POST'
    && response.request().postDataJSON()?.type === 'artifact-create')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  const created = await response
  expect(created.status()).toBe(200)
  const document = await created.json() as { id: string, version: number, content: string, mediaType: string }
  expect(document.id).toBeTruthy()
  await expect(page.getByRole('combobox', { name: 'Choose an artifact', exact: true })).toHaveValue(document.id)
  return document
}

/** 用源码入口精确修改复杂 Markdown，后续再验收可视编辑的往返保留。 */
export async function sourceWorkbenchArtifact(page: Page) {
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Source', exact: true })
  await expect(source).toBeVisible()
  return source
}

/** 保存由真实版本服务确认，不把按钮状态当持久化成功。 */
export async function saveWorkbenchArtifact(page: Page) {
  const response = page.waitForResponse(response => response.url().includes('/api/workspace') && response.request().method() === 'POST'
    && response.request().postDataJSON()?.type === 'artifact-save')
  await page.getByRole('button', { name: 'Save version', exact: true }).click()
  const saved = await response
  return { response: saved, body: await saved.json() }
}

/** 与浏览器共享会话的 API 请求，用于制造真实并发版本，不伪造关键返回。 */
export async function postWorkbench(page: Page, data: Record<string, unknown>) {
  return page.request.post('/api/workspace', {
    headers: { Origin: new URL(page.url()).origin },
    data,
  })
}

/** 验证页面横向滚动范围；表格自身的横向滚动不属于整页溢出。 */
export async function expectWorkbenchWidth(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

/** iframe 内单次真实手势顺序发送，避免 traced Chromium 并发 down/up 丢失释放事件；不重试点击。 */
export async function clickWorkbenchPreview(page: Page, target: Locator) {
  await target.hover()
  await page.mouse.down()
  await page.mouse.up()
}
