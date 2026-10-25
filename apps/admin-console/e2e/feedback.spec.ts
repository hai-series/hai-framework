import type { FeedbackAttachmentData, FeedbackDetail, FeedbackEvidence, FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { Page, TestInfo } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { readFeedbackBundle } from '@h-ai/feedback/bundle'
import { expect, test } from '@playwright/test'
import { readAdminBuildFacts } from './build-metadata'
import { loginOnPage, registerViaApi, uniqueUser, waitForHydration } from './helpers'

let buildFacts: ReturnType<typeof readAdminBuildFacts>

test('Desktop 默认 CSP 允许 Blob 截图预览、像素遮挡和下载，并保持脚本来源限制', async ({ page }) => {
  const template = await readFile(new URL('../../../packages/cli/templates/apps/fullstack/apps/{{projectName}}-desktop/src-tauri/tauri.conf.json.hbs', import.meta.url), 'utf8')
  const policy = /"csp":\s*"([^"]+)"/.exec(template)?.[1]
  expect(policy).toBeTruthy()
  expect(policy!.split(';').find(value => value.trim().startsWith('script-src'))).not.toContain('blob:')
  await page.route('https://desktop-csp.test/', route => route.fulfill({ status: 200, headers: { 'Content-Security-Policy': policy! }, contentType: 'text/html', body: '<!doctype html><title>Desktop capture</title><body></body>' }))
  await page.goto('https://desktop-csp.test/')
  const pixels = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 80
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 100, 80)
    context.fillStyle = '#111111'
    context.fillRect(20, 20, 10, 10)
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'))
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.src = url
    await image.decode()
    document.body.append(image)
    const link = document.createElement('a')
    link.href = url
    link.download = 'desktop-feedback.png'
    link.textContent = 'Save screenshot'
    document.body.append(link)
    return { naturalWidth: image.naturalWidth, mask: [...context.getImageData(25, 25, 1, 1).data] }
  })
  expect(pixels).toEqual({ naturalWidth: 100, mask: [17, 17, 17, 255] })
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Save screenshot' }).click()
  expect((await download).suggestedFilename()).toBe('desktop-feedback.png')
})
test.beforeAll(async ({ browserName }, testInfo) => {
  buildFacts = readAdminBuildFacts()
  await testInfo.attach('admin-build-facts', { body: JSON.stringify({ browserName, ...buildFacts }, null, 2), contentType: 'application/json' })
})

/** 公开证据接口分别校验浏览器和服务产物，不能以相同空值冒充一致。 */
async function expectReportBuildFacts(page: Page, id: string): Promise<void> {
  await expect.poll(async () => {
    const response = await page.request.get(`/api/feedback/reports/${id}/evidence`, { params: { kind: 'environment', page: 1, pageSize: 100 } })
    const result: HaiResult<PaginatedResult<FeedbackEvidence>> = await response.json()
    if (!result.success)
      return { error: result.error.code }
    const browser = result.data.items.find(item => item.source.startsWith('browser:'))
    const server = result.data.items.find(item => item.source.startsWith('server:'))
    return { browser: browser?.data, server: server?.data.service }
  }, { timeout: 15_000, message: 'Each environment must describe its actual compiled artifact' }).toMatchObject({ browser: buildFacts.client, server: buildFacts.server })
}

async function capture(page: Page, name: string, testInfo: TestInfo) {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function openFeedback(page: Page) {
  await page.getByTestId('feedback-open').click()
  await expect(page.locator('.feedback-form textarea[name="description"]')).toBeVisible()
  await expect(page.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true })).toBeInViewport({ ratio: 1 })
}

async function submitFeedback(page: Page, description = '') {
  await openFeedback(page)
  if (description)
    await page.locator('.feedback-form textarea[name="description"]').fill(description)
  await page.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true }).click()
  const receipt = page.locator('.feedback-form [role="status"]').first()
  await expect(receipt).toContainText(/已受理：FB-/)
  const number = (await receipt.textContent())?.match(/FB-[\w-]+/)?.[0]
  expect(number).toBeTruthy()
  await page.locator('.feedback-form').getByRole('button', { name: '关闭', exact: true }).click()
  return number!
}

/** 校验实际上传材料；不会以页面截图或缺失标记代替诊断 PNG。 */
async function storedPng(page: Page, number: string, name: string): Promise<Buffer> {
  const listed = await page.request.get('/api/feedback/reports', { params: { page: 1, pageSize: 20, search: number } })
  expect(listed.ok()).toBe(true)
  const reports: HaiResult<PaginatedResult<FeedbackReport>> = await listed.json()
  expect(reports.success).toBe(true)
  if (!reports.success)
    throw new Error(reports.error.message)
  const acceptedReport = reports.data.items.find(item => item.number === number)
  expect(acceptedReport).toBeDefined()
  await expectReportBuildFacts(page, acceptedReport!.id)
  let attachmentId = ''
  await expect.poll(async () => {
    const response = await page.request.get(`/api/feedback/reports/${acceptedReport!.id}`)
    const body: HaiResult<FeedbackDetail> = await response.json()
    if (!body.success)
      return body.error.code
    const attachment = body.data.attachments.find(item => item.name === name)
    attachmentId = attachment?.id ?? ''
    return attachment?.status ?? 'attachment-missing'
  }, { timeout: 20_000, message: `The actual ${name} must be captured, uploaded and available` }).toBe('available')
  const response = await page.request.get(`/api/feedback/reports/${acceptedReport!.id}/attachments/${attachmentId}`)
  expect(response.ok()).toBe(true)
  const attachment: HaiResult<FeedbackAttachmentData> = await response.json()
  expect(attachment.success).toBe(true)
  if (!attachment.success)
    throw new Error(attachment.error.message)
  expect(attachment.data.contentType).toBe('image/png')
  const png = Buffer.from(attachment.data.dataBase64, 'base64')
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return png
}

test('无说明反馈受理，分页管理详情可处理和撤销且保留历史', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capture(page, 'native-before-feedback.png', testInfo)
  await openFeedback(page)
  await testInfo.attach('feedback-capture-summary', { body: await page.locator('.feedback-form').textContent() ?? '', contentType: 'text/plain' })
  await expect(page.locator('.feedback-form img[alt="screenshot.png"]')).toBeVisible()
  await capture(page, 'feedback-collect-desktop.png', testInfo)
  await page.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true }).click()
  const receipt = page.locator('.feedback-form [role="status"]').first()
  await expect(receipt).toContainText(/已受理：FB-/)
  const number = (await receipt.textContent())?.match(/FB-[\w-]+/)?.[0]
  expect(number).toBeTruthy()
  await capture(page, 'feedback-accepted.png', testInfo)
  // 读取实际由 html2canvas 生成并上传的材料，页面截图不能替代诊断截图验收。
  const png = await storedPng(page, number!, 'screenshot.png')
  const diagnosticImage = testInfo.outputPath('captured-diagnostic.png')
  await writeFile(diagnosticImage, png)
  await testInfo.attach('captured-diagnostic', { path: diagnosticImage, contentType: 'image/png' })
  await page.locator('.feedback-form').getByRole('button', { name: '关闭', exact: true }).click()
  await page.goto('/admin/feedback?pageSize=1')
  await waitForHydration(page)
  const search = page.getByPlaceholder('搜索编号或说明')
  await search.fill(number!)
  await search.press('Enter')
  const row = page.locator('tbody tr').filter({ hasText: number! })
  await expect(row).toHaveCount(1)
  await capture(page, 'feedback-list.png', testInfo)
  await row.getByRole('button', { name: '查看详情', exact: true }).click()
  const detail = page.locator('.feedback-detail')
  await expect(detail).toContainText(number!)
  await detail.getByRole('tab', { name: '处理与投递', exact: true }).click()
  const note = `verified-${number}`
  await detail.locator('textarea').fill(note)
  await detail.getByRole('button', { name: '标记已处理', exact: true }).click()
  await expect(detail.getByRole('button', { name: '撤销处理', exact: true })).toBeEnabled()
  await expect(detail).toContainText(note)
  await capture(page, 'feedback-handled.png', testInfo)
  await detail.getByRole('button', { name: '撤销处理', exact: true }).click()
  await expect(detail.getByRole('button', { name: '标记已处理', exact: true })).toBeEnabled()
  await expect(detail.locator('ol li')).toHaveCount(2)
  await expect(detail).toContainText(note)
  await capture(page, 'feedback-reopened.png', testInfo)
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'feedback-detail-mobile.png', testInfo)
})

test('当前截图、换页补图、材料内容、真实编码录屏和页面回放完成同一反馈流程', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const description = `capture-${uniqueUser('flow').username}`
  // 在真实当前页面放置颜色探针，检查采集的PNG内容，避免只验证文件存在。
  await page.evaluate(() => {
    const marker = document.createElement('div')
    marker.id = 'feedback-current-page-probe'
    marker.style.cssText = 'position:fixed;left:200px;top:180px;width:80px;height:80px;background:rgb(19,221,119);z-index:900'
    document.body.append(marker)
  })
  await openFeedback(page)
  const form = page.locator('.feedback-form')
  await expect(form.locator('section img').first()).toHaveAttribute('alt', 'screenshot.png')
  const pixel = await form.locator('img[alt="screenshot.png"]').evaluate(async (image) => {
    const source = image as HTMLImageElement
    await source.decode()
    const canvas = document.createElement('canvas')
    canvas.width = source.naturalWidth
    canvas.height = source.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(source, 0, 0)
    return Array.from(context.getImageData(240, 220, 1, 1).data)
  })
  expect(pixel.slice(0, 3)).toEqual([19, 221, 119])
  await form.locator('textarea[name="description"]').fill(description)
  const materials = form.locator('details').filter({ has: page.locator('summary', { hasText: /^收集材料$/ }) }).first()
  await materials.locator('summary').first().click()
  const environment = materials.locator('details').filter({ has: page.locator('summary', { hasText: 'environment' }) }).first()
  await environment.locator('summary').click()
  await expect(environment.locator('pre')).toContainText('admin-console')
  await expect(environment.locator('pre')).toContainText('1440')
  await capture(page, 'feedback-material-contents.png', testInfo)
  await form.getByRole('button', { name: '添加页面截图', exact: true }).click()
  await expect(form).toBeHidden()
  await page.locator('a[href="/admin/modules"]').first().click()
  await expect(page).toHaveURL(/\/admin\/modules/)
  await page.getByRole('button', { name: '截取当前页面', exact: true }).click()
  await expect(form).toBeVisible()
  await expect(form.locator('section img')).toHaveCount(2)
  await expect(form.locator('textarea[name="description"]')).toHaveValue(description)
  await form.getByRole('button', { name: '重新截图', exact: true }).first().click()
  await page.getByRole('button', { name: '截取当前页面', exact: true }).click()
  await expect(form).toBeVisible()
  await expect(form.locator('section img')).toHaveCount(2)
  // 仅替代系统选屏授权，编码使用 Chrome 的真实 MediaRecorder 和视频轨。
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 180
      const context = canvas.getContext('2d')!
      let frame = 0
      const draw = () => {
        context.fillStyle = frame++ % 2 ? '#2563eb' : '#16a34a'
        context.fillRect(0, 0, 320, 180)
        context.fillStyle = '#fff'
        context.fillText('Feedback video', 20, 80)
      }
      draw()
      const stream = canvas.captureStream(10)
      const timer = setInterval(draw, 100)
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => {
          clearInterval(timer)
          stop()
        }
      }
      Object.assign(window, { __feedbackTestStream: stream })
      return stream
    } })
  })
  await form.getByRole('button', { name: '录屏', exact: true }).click()
  await form.getByRole('button', { name: '开始录屏', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: '正在录屏' })).toContainText('2 秒', { timeout: 6000 })
  await page.getByRole('button', { name: '停止录屏', exact: true }).click()
  await expect(form).toBeVisible()
  const video = form.locator('video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => (Reflect.get(window, '__feedbackTestStream') as MediaStream).getTracks().every(track => track.readyState === 'ended'))).toBe(true)
  await video.evaluate(element => element.play())
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0)
  await expect(form.getByRole('button', { name: '提交反馈', exact: true })).toBeInViewport({ ratio: 1 })
  await capture(page, 'feedback-recording-preview.png', testInfo)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(form.getByRole('button', { name: '提交反馈', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(form.getByRole('button', { name: '保存反馈到本地', exact: true })).toBeInViewport({ ratio: 1 })
  await capture(page, 'feedback-actions-narrow.png', testInfo)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const downloading = page.waitForEvent('download')
  await form.getByRole('button', { name: '保存反馈到本地', exact: true }).click()
  const download = await downloading
  const archivePath = testInfo.outputPath('feedback-recording.zip')
  await download.saveAs(archivePath)
  const bundle = await readFeedbackBundle(await readFile(archivePath))
  expect(bundle.success).toBe(true)
  if (!bundle.success)
    throw new Error(bundle.error.message)
  expect(bundle.data.report.description).toBe(description)
  const recorded = bundle.data.manifest.files.find(item => item.contentType === 'video/webm')!
  expect(recorded).toBeDefined()
  expect(bundle.data.files[recorded.path]!.subarray(0, 4)).toEqual(new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]))
  expect(bundle.data.evidence.some(item => item.kind === 'replay' && (item.data as { event?: { type?: number } }).event?.type === 2)).toBe(true)
  await form.getByRole('button', { name: '提交反馈', exact: true }).click()
  const receipt = form.locator('[role="status"]').first()
  await expect(receipt).toContainText(/已受理：FB-/)
  const number = (await receipt.textContent())!.match(/FB-[\w-]+/)![0]
  await form.getByRole('button', { name: '关闭', exact: true }).click()
  await page.goto(`/admin/feedback?search=${encodeURIComponent(number)}`)
  await waitForHydration(page)
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  const detail = page.locator('.feedback-detail')
  await detail.getByRole('tab', { name: '页面回放', exact: true }).click()
  await expect(detail.locator('.replayer-wrapper iframe')).toBeVisible()
  await expect(detail.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  await detail.getByRole('button', { name: '播放', exact: true }).click()
  await expect(detail.getByRole('button', { name: '暂停', exact: true })).toBeEnabled()
  await capture(page, 'feedback-page-replay.png', testInfo)
  await detail.getByRole('button', { name: '暂停', exact: true }).click()
  await detail.getByRole('slider', { name: '页面回放', exact: true }).fill('1000')
  await detail.getByRole('tab', { name: '操作现场', exact: true }).click()
  const recording = detail.locator('article').filter({ hasText: recorded.name })
  await expect(recording).toBeVisible()
  await recording.getByRole('button', { name: '查看 / 下载', exact: true }).click()
  await expect(recording.locator('video')).toBeVisible()
  await expect.poll(() => recording.locator('video').evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'feedback-video-mobile.png', testInfo)
})

test('列表通过服务端分页与筛选取得不同记录', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  const search = uniqueUser('fbpages').username
  const first = await submitFeedback(page, `${search} first`)
  const second = await submitFeedback(page, `${search} second`)
  expect(first).not.toBe(second)
  await page.goto(`/admin/feedback?pageSize=1&search=${encodeURIComponent(search)}`)
  await waitForHydration(page)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  const firstPage = await page.locator('tbody tr').textContent() ?? ''
  await capture(page, 'feedback-page-1.png', testInfo)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).not.toHaveText(firstPage)
  await capture(page, 'feedback-page-2.png', testInfo)
  await page.getByRole('button', { name: '筛选', exact: true }).click()
  await page.getByRole('combobox', { name: '处理状态', exact: true }).selectOption('handled')
  await expect(page).toHaveURL(/status=handled/)
  await expect(page.locator('tbody td')).toContainText(['暂无数据'])
  await capture(page, 'feedback-filter-empty.png', testInfo)
})

test('无反馈管理权限的用户不能读取列表或修改已有反馈', async ({ page, playwright, baseURL }) => {
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  const accepted = await page.request.post('/api/feedback/reports', { data: { submissionId: uniqueUser('fbdeny').username, appId: 'admin-console' } })
  expect(accepted.ok()).toBe(true)
  const acceptedBody: { success: boolean, data?: { id: string, version: number } } = await accepted.json()
  expect(acceptedBody.success).toBe(true)
  const report = acceptedBody.data!
  const user = uniqueUser('fblimit')
  const created = await page.request.post('/api/iam/users', { data: { ...user, roles: [] } })
  expect(created.ok()).toBe(true)
  const createdBody: { success: boolean, data: { id: string } } = await created.json()
  expect(createdBody.success).toBe(true)
  const limited = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } })
  try {
    expect((await limited.get('/api/feedback/reports')).status()).toBe(401)
    const login = await limited.post('/api/auth/login', { data: { identifier: user.username, password: user.password } })
    expect(login.ok()).toBe(true)
    expect((await limited.post('/api/feedback/reports', { data: { submissionId: uniqueUser('fbreject').username, appId: 'admin-console' } })).status()).toBe(403)
    expect((await limited.get('/api/feedback/reports')).status()).toBe(403)
    expect((await limited.get(`/api/feedback/reports/${report.id}`)).status()).toBe(403)
    expect((await limited.patch(`/api/feedback/reports/${report.id}/status`, { data: { id: report.id, status: 'handled', expectedVersion: report.version } })).status()).toBe(403)
  }
  finally {
    await limited.dispose()
    expect((await page.request.delete(`/api/iam/users/${createdBody.data.id}`)).ok()).toBe(true)
  }
})

test('受理网络故障保留现场与输入，可下载自包含离线包', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  const secret = `secret-${uniqueUser('cookie').username}`
  await page.context().addCookies([{ name: 'private_session_token', value: secret, url: new URL(page.url()).origin }])
  await openFeedback(page)
  const description = `offline-${uniqueUser('fbdown').username}`
  await page.locator('.feedback-form textarea[name="description"]').fill(description)
  const note = `Offline attachment ${description}`
  await page.locator('.feedback-form summary').filter({ hasText: '更多选项' }).click()
  await page.locator('.feedback-form input[type="file"]').setInputFiles({ name: 'offline-note.txt', mimeType: 'text/plain', buffer: Buffer.from(note) })
  await expect(page.locator('.feedback-form section')).toContainText('offline-note.txt')
  await page.route('**/api/feedback/reports', route => route.abort('connectionfailed'))
  try {
    await page.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true }).click()
    await expect(page.locator('.feedback-form [role="alert"]')).toBeVisible()
    await expect(page.locator('.feedback-form [role="alert"]')).toContainText(/\(traceId: [\w.:-]+\)$/)
    await expect(page.locator('.feedback-form textarea[name="description"]')).toHaveValue(description)
    const downloading = page.waitForEvent('download')
    await page.locator('.feedback-form').getByRole('button', { name: '保存反馈到本地', exact: true }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^feedback-[\w-]+\.zip$/)
    const output = testInfo.outputPath('feedback-local.zip')
    await download.saveAs(output)
    const bundle = await readFeedbackBundle(await readFile(output))
    expect(bundle.success).toBe(true)
    if (bundle.success) {
      expect(bundle.data.report.description).toBe(description)
      expect(bundle.data.manifest.format).toBe('hai-feedback')
      expect(bundle.data.files['summary.md']).toBeDefined()
      expect(bundle.data.files['viewer/index.html']).toBeDefined()
      const savedNote = bundle.data.manifest.files.find(file => file.name === 'offline-note.txt')
      expect(savedNote).toBeDefined()
      expect(new TextDecoder().decode(bundle.data.files[savedNote!.path])).toBe(note)
      expect(JSON.stringify({ report: bundle.data.report, evidence: bundle.data.evidence })).not.toContain(secret)
    }
    await capture(page, 'feedback-offline-fallback.png', testInfo)
  }
  finally {
    await page.unroute('**/api/feedback/reports')
  }
  await page.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true }).click()
  await expect(page.locator('.feedback-form [role="status"]').first()).toContainText(/已受理：FB-/)
  await capture(page, 'feedback-network-recovered.png', testInfo)
})

test('主动添加JPEG可以预览并烧录遮挡，以PNG实际上传', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  await openFeedback(page)
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = '#ffffff'
    context.fillText('PRIVATE', 4, 32)
    return canvas.toDataURL('image/jpeg').split(',')[1]!
  })
  await page.locator('.feedback-form summary').filter({ hasText: '更多选项' }).click()
  await page.locator('.feedback-form input[type="file"]').setInputFiles({ name: 'added-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') })
  const added = page.locator('.feedback-form section > div').filter({ has: page.locator('img[alt^="added-photo."]') })
  await expect(added).toBeVisible()
  await added.locator('img[alt="added-photo.jpg"]').scrollIntoViewIfNeeded()
  await capture(page, 'feedback-added-image-before-mask.png', testInfo)
  await added.locator('img[alt="added-photo.jpg"]').screenshot({ path: testInfo.outputPath('feedback-added-image-before-mask-detail.png'), animations: 'disabled' })
  await added.getByRole('button', { name: '遮挡敏感区域', exact: true }).click()
  await expect(added.getByRole('spinbutton')).toHaveCount(0)
  // 实际放大图片后反向框选不足一个原始像素的边缘区域，遮挡不能通过抗锯齿透出原图。
  await added.locator('img').evaluate(image => image.style.width = '128px')
  await added.locator('img').scrollIntoViewIfNeeded()
  const tinyBounds = (await added.locator('img').boundingBox())!
  expect(tinyBounds.width).toBeGreaterThan(64)
  await page.mouse.move(tinyBounds.x + 0.8, tinyBounds.y + 0.8)
  await page.mouse.down()
  await page.mouse.move(tinyBounds.x + 0.2, tinyBounds.y + 0.2)
  await page.mouse.up()
  await added.getByRole('button', { name: '应用标注', exact: true }).click()
  const tinyPreview = added.locator('img[alt="added-photo.png"]')
  await expect(tinyPreview).toBeVisible()
  await expect.poll(() => tinyPreview.evaluate((image) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    context.drawImage(image as HTMLImageElement, 0, 0)
    return Array.from(context.getImageData(0, 0, 1, 1).data)
  })).toEqual([17, 17, 17, 255])
  await added.locator('img').scrollIntoViewIfNeeded()
  const bounds = await added.locator('img').boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + 2, bounds!.y + 2)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width - 2, bounds!.y + bounds!.height - 2, { steps: 4 })
  await page.mouse.up()
  await added.getByRole('button', { name: '应用标注', exact: true }).click()
  const preview = page.locator('.feedback-form img[alt="added-photo.png"]')
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 64)).toBe(true)
  const pixel = await preview.evaluate((image) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.drawImage(image as HTMLImageElement, 0, 0)
    return Array.from(context.getImageData(32, 32, 1, 1).data)
  })
  expect(pixel.slice(0, 3).every(value => value < 32)).toBe(true)
  await preview.scrollIntoViewIfNeeded()
  await capture(page, 'feedback-added-image-masked.png', testInfo)
  await preview.screenshot({ path: testInfo.outputPath('feedback-added-image-masked-detail.png'), animations: 'disabled' })
  const submittedImage = await preview.evaluate(async image => Array.from(new Uint8Array(await (await fetch((image as HTMLImageElement).src)).arrayBuffer())))
  await page.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true }).click()
  const receipt = page.locator('.feedback-form [role="status"]').first()
  await expect(receipt).toContainText(/已受理：FB-/)
  const number = (await receipt.textContent())?.match(/FB-[\w-]+/)?.[0]
  expect(number).toBeTruthy()
  const png = await storedPng(page, number!, 'added-photo.png')
  expect(png).toEqual(Buffer.from(submittedImage))
  const imagePath = testInfo.outputPath('annotated-user-upload.png')
  await writeFile(imagePath, png)
  await testInfo.attach('annotated-user-upload', { path: imagePath, contentType: 'image/png' })
})

test('邮件反馈链接直接定位详情，关闭后恢复列表查询', async ({ page }, testInfo) => {
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  const created = await page.request.post('/api/feedback/reports', { data: { submissionId: uniqueUser('fbmail').username, appId: 'admin-console', description: 'notification deep link' } })
  const body: HaiResult<FeedbackReport> = await created.json()
  expect(body.success).toBe(true)
  if (!body.success)
    throw new Error(body.error.message)
  await page.goto(`/admin/feedback?feedback=${encodeURIComponent(body.data.id)}&pageSize=1`)
  await waitForHydration(page)
  const detail = page.locator('.feedback-detail')
  await expect(detail).toContainText(body.data.number)
  await expect(detail).toContainText('notification deep link')
  await capture(page, 'feedback-notification-detail.png', testInfo)
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page).not.toHaveURL(/feedback=/)
  await expect(page).toHaveURL(/pageSize=1/)
  await expect(page.locator('.feedback-list')).toBeVisible()
})

test('默认反馈入口向普通用户开放，管理页面和操作仍受管理员权限控制', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(60_000)
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.getByTestId('feedback-open')).toBeVisible()
  await expect(page.locator('a[href="/admin/feedback"]')).toBeVisible()
  await capture(page, 'feedback-default-admin-entry.png', testInfo)
  const user = uniqueUser('fbnormal')
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: baseURL! } })
  const memberPage = await context.newPage()
  let userId = ''
  try {
    const registered = await registerViaApi(memberPage.request, user)
    expect(registered.ok()).toBe(true)
    const registeredBody: HaiResult<{ user: { id: string } }> = await registered.json()
    expect(registeredBody.success).toBe(true)
    if (!registeredBody.success)
      throw new Error(registeredBody.error.message)
    userId = registeredBody.data.user.id
    // 通用 E2E fixture 默认注册 admin；通过宿主公开 API 分配既有普通 user 角色，再重新登录。
    const rolesResponse = await page.request.get('/api/iam/roles')
    expect(rolesResponse.ok()).toBe(true)
    const rolesBody: HaiResult<{ id: string, code: string }[]> = await rolesResponse.json()
    expect(rolesBody.success).toBe(true)
    if (!rolesBody.success)
      throw new Error(rolesBody.error.message)
    const ordinaryRole = rolesBody.data.find(role => role.code === 'user')
    expect(ordinaryRole).toBeDefined()
    if (!ordinaryRole)
      throw new Error('Existing ordinary user role is missing')
    const assigned = await page.request.put(`/api/iam/users/${userId}`, { data: { roles: [ordinaryRole.id] } })
    expect(assigned.ok()).toBe(true)
    const assignedBody: HaiResult<{ roles: string[] }> = await assigned.json()
    expect(assignedBody.success).toBe(true)
    if (!assignedBody.success)
      throw new Error(assignedBody.error.message)
    expect(assignedBody.data.roles).toEqual(['user'])
    const loadedUser = await page.request.get(`/api/iam/users/${userId}`)
    const userBody: HaiResult<{ roles: string[] }> = await loadedUser.json()
    expect(userBody.success).toBe(true)
    if (!userBody.success)
      throw new Error(userBody.error.message)
    expect(userBody.data.roles).toContain('user')
    expect(userBody.data.roles).not.toContain('admin')
    await loginOnPage(memberPage, user.username, user.password)
    await expect(memberPage.getByTestId('feedback-open')).toBeVisible()
    await expect(memberPage.locator('a[href="/admin/feedback"]')).toHaveCount(0)
    await capture(memberPage, 'feedback-default-member-entry.png', testInfo)
    await memberPage.setViewportSize({ width: 390, height: 844 })
    await expect(memberPage.getByTestId('feedback-open')).toBeVisible()
    await openFeedback(memberPage)
    await capture(memberPage, 'feedback-default-member-collect-mobile.png', testInfo)
    const form = memberPage.locator('.feedback-form')
    const pendingPngName = `${user.username}-pending.png`
    const overLimitName = `${user.username}-oversize.txt`
    const validPng = Buffer.from(await memberPage.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 64
      const context = canvas.getContext('2d')!
      context.fillStyle = '#2563eb'
      context.fillRect(0, 0, 64, 64)
      return canvas.toDataURL('image/png').split(',')[1]!
    }), 'base64')
    await form.locator('summary').filter({ hasText: '更多选项' }).click()
    // 同一批先有有效图片、后有超限文件，失败不得把前者留在不可见的 SDK 草稿中。
    await form.locator('input[type="file"]').setInputFiles([
      { name: pendingPngName, mimeType: 'image/png', buffer: validPng },
      { name: overLimitName, mimeType: 'text/plain', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 'B') },
    ])
    const filesError = form.getByRole('alert').first()
    await expect(filesError).toBeVisible()
    await expect(filesError).not.toHaveText('')
    await expect(form.getByText(pendingPngName, { exact: true })).toBeVisible()
    await expect(form.getByText(overLimitName, { exact: true })).toBeVisible()
    await expect(form.getByRole('button', { name: '提交反馈', exact: true })).toBeDisabled()
    await filesError.scrollIntoViewIfNeeded()
    await capture(memberPage, 'feedback-default-member-files-rejected-mobile.png', testInfo)
    await form.getByRole('button', { name: `删除 ${pendingPngName}`, exact: true }).click()
    await form.getByRole('button', { name: `删除 ${overLimitName}`, exact: true }).click()
    await expect(form.getByText(pendingPngName, { exact: true })).toHaveCount(0)
    await expect(form.getByText(overLimitName, { exact: true })).toHaveCount(0)
    await expect(form.getByRole('button', { name: '提交反馈', exact: true })).toBeEnabled()
    await form.locator('summary').filter({ hasText: '更多选项' }).click()
    await form.locator('textarea[name="description"]').scrollIntoViewIfNeeded()
    await capture(memberPage, 'feedback-default-member-files-cleared-mobile.png', testInfo)
    await memberPage.locator('.feedback-form').getByRole('button', { name: '提交反馈', exact: true }).click()
    const receipt = memberPage.locator('.feedback-form [role="status"]').first()
    await expect(receipt).toContainText(/已受理：FB-/)
    const number = (await receipt.textContent())?.match(/FB-[\w-]+/)?.[0]
    expect(number).toBeTruthy()
    await capture(memberPage, 'feedback-default-member-accepted-mobile.png', testInfo)
    await memberPage.locator('.feedback-form').getByRole('button', { name: '关闭', exact: true }).click()
    const reportsResponse = await page.request.get('/api/feedback/reports', { params: { search: number!, page: 1, pageSize: 20 } })
    const reports: HaiResult<PaginatedResult<FeedbackReport>> = await reportsResponse.json()
    expect(reports.success).toBe(true)
    if (!reports.success)
      throw new Error(reports.error.message)
    const report = reports.data.items.find(item => item.number === number)
    expect(report).toBeDefined()
    if (!report)
      throw new Error('Accepted ordinary-user report is missing')
    expect(report.userId).toBe(userId)
    // 所有者可读取自己的回执/材料，列表、处理、撤销、导出属于管理权限。
    const ownReportResponse = await memberPage.request.get(`/api/feedback/reports/${report.id}`)
    expect(ownReportResponse.status()).toBe(200)
    const ownReport: HaiResult<FeedbackDetail> = await ownReportResponse.json()
    expect(ownReport.success).toBe(true)
    if (!ownReport.success)
      throw new Error(ownReport.error.message)
    await expectReportBuildFacts(memberPage, report.id)
    const savedAttachmentNames = ownReport.data.attachments.map(item => item.name)
    expect(savedAttachmentNames).not.toContain(pendingPngName)
    expect(savedAttachmentNames).not.toContain(overLimitName)
    expect((await memberPage.request.get('/api/feedback/reports')).status()).toBe(403)
    for (const status of ['handled', 'pending'])
      expect((await memberPage.request.patch(`/api/feedback/reports/${report.id}/status`, { data: { id: report.id, status, expectedVersion: report.version } })).status()).toBe(403)
    expect((await memberPage.request.post(`/api/feedback/reports/${report.id}/exports`, { data: { id: report.id } })).status()).toBe(403)
    const deniedPage = await memberPage.goto('/admin/feedback')
    expect(deniedPage?.status()).toBe(403)
    await capture(memberPage, 'feedback-default-member-management-denied.png', testInfo)
  }
  finally {
    await context.close()
    if (userId)
      expect((await page.request.delete(`/api/iam/users/${userId}`)).ok()).toBe(true)
  }
})
