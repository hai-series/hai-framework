import { expect, test } from '@playwright/test'
import { clickWorkbenchPreview, createWorkbenchArtifact, expectWorkbenchWidth, postWorkbench, saveWorkbenchArtifact, signupWorkbench, sourceWorkbenchArtifact } from './workbench-flow.js'

test.describe.configure({ timeout: 60_000 })
test.use({
  viewport: { width: 1440, height: 900 },
})

test('keeps the header aligned and mobile artifact controls and document readable', async ({ page }) => {
  await signupWorkbench(page)
  await createWorkbenchArtifact(page, 'A readable mobile guide')
  const layout = page.locator('.hai-workspace')
  // 不可见的工具提示也不能撑宽裁剪祖先，否则焦点滚动会让整个内容区左移。
  await expect.poll(() => layout.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('textbox', { name: 'Select a passage and describe how to rewrite it', exact: true })
    .fill('Improve the selected paragraph while preserving its meaning. '.repeat(6))
  await expect.poll(() => layout.evaluate(element => element.scrollLeft)).toBe(0)
  await page.setViewportSize({ width: 390, height: 844 })
  const picker = page.getByRole('combobox', { name: 'Choose an artifact', exact: true })
  await expect.poll(() => picker.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(318)
  await expect(page.locator('.hai-artifact-workspace .hai-ai-doc-outline')).toHaveCount(0)
  const heading = page.locator('.hai-artifact-workspace article h1').first()
  await heading.scrollIntoViewIfNeeded()
  await expect(heading).toBeVisible()
  expect(await heading.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
    return !!target && (target === element || element.contains(target))
  })).toBe(true)
  await page.getByRole('button', { name: 'Show outline', exact: true }).click()
  await expect(page.locator('.hai-artifact-workspace .hai-ai-doc-outline')).toBeVisible()
  await page.getByRole('button', { name: 'Hide', exact: true }).click()
  await expect(page.locator('.hai-artifact-workspace .hai-ai-doc-outline')).toHaveCount(0)
  await expectWorkbenchWidth(page)
  await page.getByRole('button', { name: 'Show tasks', exact: true }).click()
  await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Tool workspace', exact: true }).click()
  const tools = page.getByRole('region', { name: 'Tool workspace', exact: true })
  const toolPicker = tools.getByRole('combobox', { name: 'Choose a tool', exact: true })
  await expect.poll(() => toolPicker.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(318)
  await expect.poll(() => layout.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
})

test('saves Markdown visual edits without losing complex blocks and restores a historical version', async ({ page }) => {
  await signupWorkbench(page)
  const created = await createWorkbenchArtifact(page, 'Product guide')
  const content = '# Product guide\n\nOriginal **paragraph**.\n\n```ts\nconst answer = 42\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\n| Name | Value |\n| --- | --- |\n| A | 10 |\n\n<div>Keep this exact source</div>\n'
  const source = await sourceWorkbenchArtifact(page)
  await source.fill(content)
  expect((await saveWorkbenchArtifact(page)).response.status()).toBe(200)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const paragraph = page.locator('.hai-artifact-workspace article p').first()
  await expect(paragraph).toBeEditable()
  await paragraph.fill('Visible edit from the user.')
  const saved = await saveWorkbenchArtifact(page)
  expect(saved.response.status()).toBe(200)
  expect(saved.body.document.version).toBe(3)
  expect(saved.body.document.content).toContain('Visible edit from the user.')
  expect(saved.body.document.content).toContain('```ts\nconst answer = 42\n```')
  expect(saved.body.document.content).toContain('```mermaid\ngraph TD; A-->B\n```')
  expect(saved.body.document.content).toContain('| A | 10 |')
  expect(saved.body.document.content).toContain('<div>Keep this exact source</div>')
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Artifacts', exact: true }).click()
  await page.getByRole('combobox', { name: 'Choose an artifact', exact: true }).selectOption(created.id)
  await expect(page.locator('.hai-artifact-workspace article')).toContainText('Visible edit from the user.')
  await page.getByRole('button', { name: 'Version history', exact: true }).click()
  await page.getByRole('button', { name: 'Version 2', exact: true }).click()
  await expect(page.getByText('Viewing a historical version. This content is read-only.', { exact: true })).toBeVisible()
  await expect(page.locator('.hai-artifact-workspace article')).toHaveAttribute('contenteditable', 'false')
  await page.getByRole('button', { name: 'Use this version as a draft', exact: true }).click()
  const restored = await saveWorkbenchArtifact(page)
  expect(restored.body.document.version).toBe(4)
  expect(restored.body.document.content).toBe(content)
  await expectWorkbenchWidth(page)
})

test('keeps a local draft after a real version conflict and enforces artifact ownership', async ({ browser, page }) => {
  await signupWorkbench(page)
  const created = await createWorkbenchArtifact(page, 'Conflict recovery')
  const source = await sourceWorkbenchArtifact(page)
  await source.fill('# My local draft\n\nDo not lose these edits.\n')
  const concurrent = await postWorkbench(page, {
    type: 'artifact-save',
    id: created.id,
    baseVersion: 1,
    content: '# Concurrent saved version\n',
  })
  expect(concurrent.status()).toBe(200)
  const conflict = await saveWorkbenchArtifact(page)
  expect(conflict.response.status()).toBe(409)
  expect(conflict.body.currentVersion).toBe(2)
  await expect(source).toHaveValue('# My local draft\n\nDo not lose these edits.\n')
  await expect(page.getByText('Version 2 is now current. Copy your draft before loading the latest content.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Load latest content', exact: true }).click()
  const confirmation = page.getByRole('dialog')
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Source', exact: true })).toHaveCount(0)
  await expect(page.locator('.hai-artifact-workspace article')).toContainText('Concurrent saved version')
  const other = await browser.newContext({ locale: 'en-US', baseURL: new URL(page.url()).origin })
  try {
    expect((await other.request.get(`/api/workspace?artifact=${created.id}`)).status()).toBe(401)
    const secondPage = await other.newPage()
    await signupWorkbench(secondPage)
    expect((await secondPage.request.get(`/api/workspace?artifact=${created.id}`)).status()).toBe(404)
    expect((await secondPage.request.get(`/api/workspace?artifactHistory=${created.id}`)).status()).toBe(404)
    expect((await postWorkbench(secondPage, {
      type: 'artifact-save',
      id: created.id,
      baseVersion: 2,
      content: 'unauthorized',
    })).status()).toBe(404)
  }
  finally { await other.close() }
})

test('edits a table immediately, renders a chart, and keeps HTML interaction isolated and offline', async ({ page, context }) => {
  await signupWorkbench(page)
  await createWorkbenchArtifact(page, 'Editable table', 'table')
  await page.locator('.hai-artifact-workspace td input').first().fill('Immediate final edit')
  const tableSource = await sourceWorkbenchArtifact(page)
  expect(JSON.parse(await tableSource.inputValue()).table_rows[0].name).toBe('Immediate final edit')
  const saved = await saveWorkbenchArtifact(page)
  expect(saved.response.status()).toBe(200)
  await createWorkbenchArtifact(page, 'Sales chart', 'chart')
  await expect(page.locator('.hai-artifact-workspace .hai-chart-viewport').getByRole('figure').first()).toBeVisible()
  await createWorkbenchArtifact(page, 'Interactive page', 'html')
  let forbiddenRequests = 0
  let escapeRequests = 0
  await context.route('https://forbidden-workbench.invalid/**', async (route) => {
    forbiddenRequests++
    await route.abort()
  })
  await context.route('https://preview-escape.invalid/**', async (route) => {
    escapeRequests++
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Unexpected preview navigation</p>' })
  })
  const response = await page.request.get('/')
  expect(response.headers()['content-security-policy']).toContain('frame-src \'self\'')
  const html = '<!doctype html><html><body><h1>Isolated page</h1><button onclick="document.querySelector(\'output\').textContent=Number(document.querySelector(\'output\').textContent)+1">Count</button><output>0</output><button onclick="location.href=\'https://preview-escape.invalid/\'">Escape preview</button><img src="https://forbidden-workbench.invalid/image.png"><script>fetch("https://forbidden-workbench.invalid/fetch").catch(()=>{})</script></body></html>'
  const htmlSource = await sourceWorkbenchArtifact(page)
  await htmlSource.fill(html)
  expect((await saveWorkbenchArtifact(page)).response.status()).toBe(200)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const frame = page.frameLocator('.hai-artifact-workspace iframe')
  await clickWorkbenchPreview(page, frame.getByRole('button', { name: 'Count', exact: true }))
  await expect(frame.locator('output')).toHaveText('1')
  await clickWorkbenchPreview(page, frame.getByRole('button', { name: 'Escape preview', exact: true }))
  // Chrome 可把阻止导航的子框架替换为错误页；主应用须保持可用并能重新加载安全预览。
  const recoveredSource = await sourceWorkbenchArtifact(page)
  await expect(recoveredSource).toHaveValue(html)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await clickWorkbenchPreview(page, frame.getByRole('button', { name: 'Count', exact: true }))
  await expect(frame.locator('output')).toHaveText('1')
  expect(escapeRequests).toBe(0)
  await expect(page.locator('.hai-artifact-workspace iframe')).toHaveAttribute('sandbox', 'allow-scripts')
  const actualFrame = await page.locator('.hai-artifact-workspace iframe').elementHandle().then(handle => handle!.contentFrame())
  expect(await actualFrame!.evaluate(() => {
    try {
      return window.parent.document.title
    }
    catch { return 'isolated' }
  })).toBe('isolated')
  expect(forbiddenRequests).toBe(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectWorkbenchWidth(page)
})

test('protects artifact drafts from sidebar, new-task and logout navigation', async ({ page }) => {
  await signupWorkbench(page)
  await createWorkbenchArtifact(page, 'A protected draft')
  const source = await sourceWorkbenchArtifact(page)
  await source.fill('# My unsaved draft\n\nKeep this text.\n')
  const navigation = page.getByRole('navigation', { name: 'Workspace', exact: true })
  for (const leave of [
    () => navigation.getByRole('button', { name: 'Tool workspace', exact: true }).click(),
    () => navigation.getByRole('button', { name: 'Files', exact: true }).click(),
    () => page.getByRole('button', { name: 'New task', exact: true }).click(),
    () => page.getByRole('button', { name: 'Sign out', exact: true }).click(),
  ]) {
    await leave()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(source).toHaveValue('# My unsaved draft\n\nKeep this text.\n')
  }
  await navigation.getByRole('button', { name: 'Tool workspace', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Tool workspace', exact: true })).toBeVisible()
})
