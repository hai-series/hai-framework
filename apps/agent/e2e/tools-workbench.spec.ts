import type { ToolRun } from '@h-ai/ui'
import type { Page } from '@playwright/test'
import type { AgentResource, WorkspacePage } from '../src/lib/workspace.js'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { expectWorkbenchWidth, postWorkbench, signupWorkbench } from './workbench-flow.js'

test.describe.configure({ timeout: 60_000 })

/** 用实际目录选择稳定协议名称，界面仍显示工具的可读标题。 */
async function chooseTool(page: Page, name: string) {
  const workspace = page.getByRole('region', { name: 'Tool workspace', exact: true })
  if (!await workspace.isVisible())
    await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Tool workspace', exact: true }).click()
  await workspace.getByRole('combobox', { name: 'Choose a tool', exact: true }).selectOption(name)
  return workspace
}

/** 验收真实提交回执、进度和终态，不通过模拟结果或固定等待推进。 */
async function runTool(page: Page): Promise<ToolRun> {
  const accepted = page.waitForResponse(response => response.url().includes('/api/workspace') && response.request().method() === 'POST'
    && response.request().postDataJSON()?.type === 'tool-run')
  await page.getByRole('button', { name: 'Run tool', exact: true }).click()
  const response = await accepted
  expect(response.status()).toBe(200)
  const initial = await response.json() as ToolRun
  expect(['queued', 'running']).toContain(initial.status)
  const result = page.getByRole('region', { name: 'Execution result', exact: true })
  await expect(result.getByRole('progressbar', { name: 'Execution progress', exact: true })).toBeVisible()
  await expect(result.getByRole('status')).toContainText('Completed')
  const persisted = await page.request.get(`/api/workspace?toolRun=${encodeURIComponent(initial.id)}`)
  expect(persisted.status()).toBe(200)
  const completed = await persisted.json() as ToolRun
  expect(completed.id).toBe(initial.id)
  expect(completed.status).toBe('succeeded')
  return completed
}

test('runs a document preset, opens its artifact, selects it by name and enforces run ownership', async ({ browser, page }) => {
  await signupWorkbench(page)
  const title = `A document from a tool ${Date.now()}`
  const workspace = await chooseTool(page, 'artifact_create')
  await workspace.getByRole('button', { name: 'Markdown note', exact: true }).click()
  await workspace.getByRole('textbox', { name: /^Title\s*\*?$/ }).fill(title)
  const created = await runTool(page)
  expect(created.artifacts).toHaveLength(1)
  const artifact = created.artifacts![0]!
  expect(artifact.title).toBe(title)
  await page.getByRole('region', { name: 'Execution result', exact: true }).getByRole('button', { name: title, exact: true }).click()
  await expect(page.locator('.hai-artifact-workspace article')).toContainText('Write your first draft here.')
  const reader = await chooseTool(page, 'artifact_read')
  const picker = reader.getByRole('combobox', { name: /^Existing artifact\s*\*?$/ })
  await picker.fill(title)
  await page.getByRole('option').filter({ hasText: title }).click()
  await expect(picker).toHaveValue(title)
  const read = await runTool(page)
  expect(read.result).toMatchObject({ id: artifact.id, version: 1, content: '# Project note\n\nWrite your first draft here.' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectWorkbenchWidth(page)

  const other = await browser.newContext({ locale: 'en-US', baseURL: new URL(page.url()).origin })
  try {
    expect((await other.request.get(`/api/workspace?toolRun=${encodeURIComponent(created.id)}`)).status()).toBe(401)
    const secondPage = await other.newPage()
    await signupWorkbench(secondPage)
    const denied = await secondPage.request.get(`/api/workspace?toolRun=${encodeURIComponent(created.id)}`)
    expect([403, 404]).toContain(denied.status())
    expect((await denied.text())).not.toContain('Write your first draft here.')
    const cancelled = await postWorkbench(secondPage, { type: 'tool-cancel', id: created.id })
    expect([403, 404]).toContain(cancelled.status())
  }
  finally { await other.close() }
})

test('runs the data example and opens the actual generated table and chart', async ({ page }) => {
  await signupWorkbench(page)
  const workspace = await chooseTool(page, 'data_analyze')
  await workspace.getByRole('button', { name: 'Monthly sales', exact: true }).click()
  const title = `Sales analysis ${Date.now()}`
  await workspace.getByRole('textbox', { name: /^Title\s*\*?$/ }).fill(title)
  await expect(workspace.getByRole('textbox', { name: /^Category field\s*\*?$/ })).toHaveValue('month')
  const run = await runTool(page)
  expect(run.result).toMatchObject({
    statistics: {
      count: 2,
      sum: 30,
      mean: 15,
      min: 10,
      max: 20,
    },
  })
  expect(run.artifacts).toHaveLength(2)
  const table = run.artifacts!.find(artifact => artifact.kind === 'table')!
  const chart = run.artifacts!.find(artifact => artifact.kind === 'chart')!
  await page.getByRole('region', { name: 'Execution result', exact: true }).getByRole('button', { name: table.title, exact: true }).click()
  await expect(page.locator('.hai-artifact-workspace td input').first()).toHaveValue('Jan')
  await page.getByRole('combobox', { name: 'Choose an artifact', exact: true }).selectOption(chart.id)
  await expect(page.locator('.hai-artifact-workspace .hai-chart-viewport').getByRole('figure').first()).toBeVisible()
})

test('recovers a real accepted request after its HTTP response is lost and after reload', async ({ page }) => {
  await signupWorkbench(page)
  const workspace = await chooseTool(page, 'artifact_create')
  await workspace.getByRole('button', { name: 'Markdown note', exact: true }).click()
  const title = `One accepted request ${Date.now()}`
  await workspace.getByRole('textbox', { name: /^Title\s*\*?$/ }).fill(title)
  let receipt: ToolRun | undefined
  let submissions = 0
  // 请求真实到达服务并完成受理，仅丢弃返回通道，检验未知提交恢复。
  await page.route('**/api/workspace', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST' || request.postDataJSON()?.type !== 'tool-run') {
      await route.continue()
      return
    }
    submissions++
    const accepted = await route.fetch()
    expect(accepted.status()).toBe(200)
    receipt = await accepted.json() as ToolRun
    await route.abort('failed')
  })
  await workspace.getByRole('button', { name: 'Run tool', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Execution result', exact: true })).toContainText('Submission is unconfirmed.')
  await expect(page).toHaveURL(/toolKey=/)
  await page.reload()
  const result = page.getByRole('region', { name: 'Execution result', exact: true })
  await expect(result.getByRole('status')).toContainText('Completed')
  expect(receipt?.id).toBeTruthy()
  expect(new URL(page.url()).searchParams.get('toolRun')).toBe(receipt!.id)
  expect(new URL(page.url()).searchParams.has('toolKey')).toBe(false)
  await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Files', exact: true }).click()
  await chooseTool(page, 'artifact_create')
  await expect(page.getByRole('region', { name: 'Execution result', exact: true }).getByRole('status')).toContainText('Completed')
  const artifacts = await page.request.get('/api/workspace?pane=artifacts')
  const resources = await artifacts.json() as WorkspacePage<AgentResource>
  expect(resources.items.filter(item => item.title === title)).toHaveLength(1)
  expect(submissions).toBe(1)
})

test('rejects a previously available tool on a real node with its tool groups disabled', async ({ page }) => {
  const disabledOrigin = process.env.AGENT_E2E_DISABLED_TOOLS_URL
  test.skip(!disabledOrigin, 'Requires a second API node sharing the test database and storage, with workbench.selection: {}.')
  await signupWorkbench(page)
  const catalog = await page.request.get('/api/workspace?catalog=1')
  expect(catalog.status()).toBe(200)
  expect(await catalog.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'artifact_create' }),
  ]))
  const disabledUrl = new URL('/api/workspace', disabledOrigin!).href
  const disabled = await page.request.get(`${disabledUrl}?catalog=1`)
  expect(disabled.status()).toBe(200)
  expect(await disabled.json()).toEqual([])
  const rejected = await page.request.post(disabledUrl, {
    headers: { Origin: new URL(disabledOrigin!).origin },
    data: {
      type: 'tool-run',
      name: 'artifact_create',
      input: { title: 'Disabled tool', kind: 'markdown', content: '# Must not be created' },
      idempotencyKey: `disabled-${Date.now()}`,
    },
  })
  expect(rejected.status()).toBe(403)
  const artifacts = await page.request.get('/api/workspace?pane=artifacts')
  const resources = await artifacts.json() as WorkspacePage<AgentResource>
  expect(resources.items).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ title: 'Disabled tool' }),
  ]))
})
