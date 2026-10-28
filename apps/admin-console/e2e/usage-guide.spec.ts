import type { FeedbackDetail, FeedbackReport, FeedbackSubmitInput } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { dutyAccounts, loginOnPage, registerAndLogin, uniqueUser, waitForHydration } from './helpers'

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (target) {
    await target.scrollIntoViewIfNeeded()
    await expect(target).toBeVisible()
    await target.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
  }
  else {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
  }
}

test('使用指南：真实表单布局、空状态、失败恢复与窄屏', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000)
  await registerAndLogin(page, request, 'usage')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/ui-gallery/compounds')
  await waitForHydration(page)
  const form = page.getByTestId('form-layout-demo')
  await page.getByTestId('form-columns-1').click()
  await page.getByTestId('form-label-top').click()
  await capture(page, testInfo, 'ui-form-one-top', form)
  await page.getByTestId('form-columns-2').click()
  await page.getByTestId('form-label-left').click()
  const first = page.getByTestId('form-name-field')
  const second = page.getByTestId('form-email-field')
  expect(Math.abs((await first.boundingBox())!.y - (await second.boundingBox())!.y)).toBeLessThan(5)
  await capture(page, testInfo, 'ui-form-two-left', form)
  await page.setViewportSize({ width: 390, height: 960 })
  expect((await second.boundingBox())!.y).toBeGreaterThan((await first.boundingBox())!.y)
  await capture(page, testInfo, 'ui-form-mobile', form)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const patterns = page.getByTestId('interaction-patterns')
  for (const [state, label] of [['ready', '正常'], ['loading', '加载'], ['empty', '空态'], ['error', '失败']]) {
    await patterns.getByRole('tab', { name: label, exact: true }).click()
    await capture(page, testInfo, `ui-list-${state}`, state === 'error' ? undefined : patterns)
  }
  await patterns.getByRole('button', { name: '重试', exact: true }).click()
  await expect(patterns.locator('tbody tr')).toHaveCount(10)
  await capture(page, testInfo, 'ui-list-recovered', patterns)
})

test('组件演示切换中英日语言后保持可读，并实际操作英文确认框', async ({ page, request, context }, testInfo) => {
  test.setTimeout(120_000)
  await registerAndLogin(page, request, 'locale')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  for (const locale of ['en-US', 'ja-JP', 'zh-CN']) {
    await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: new URL(page.url()).origin }])
    for (const section of ['primitives', 'compounds', 'overlays', 'scenes']) {
      await page.goto(`/admin/ui-gallery/${section}`)
      await waitForHydration(page)
      // 排除代码示例、语言自称和虚构姓名；可操作文案必须使用当前语言。
      const visibleCopy = await page.locator('main').evaluate((element) => {
        const clone = element.cloneNode(true) as HTMLElement
        clone.querySelectorAll('pre, code, [data-language-switch]').forEach(node => node.remove())
        return clone.textContent ?? ''
      })
      if (locale === 'en-US')
        expect(visibleCopy).not.toMatch(/请输入|请选择|提交成功|确认框|用户名|加载中|默认卡片|下拉选择|订单|库存/)
      await capture(page, testInfo, `gallery-${section}-${locale}`)
      if (section === 'scenes') {
        const fullExample = locale === 'en-US' ? 'MarkdownRenderer · full example' : locale === 'ja-JP' ? 'MarkdownRenderer · 全機能の例' : 'MarkdownRenderer · 全功能演示'
        await page.getByRole('button', { name: new RegExp(`^${fullExample}`) }).click()
        const markdown = page.getByRole('heading', { name: locale === 'en-US' ? 'Markdown reading example' : locale === 'ja-JP' ? 'Markdown の閲覧例' : 'Markdown 阅读示例', exact: true })
        await expect(markdown).toBeVisible()
        await capture(page, testInfo, `ai-markdown-html-off-${locale}`, page.getByTestId('markdown-html-off-demo'))
        await capture(page, testInfo, `ai-markdown-html-on-${locale}`, page.getByTestId('markdown-html-on-demo'))
        await expect(page.getByTestId('mermaid-document-demo').locator('.hai-md-mermaid svg').first()).toBeVisible()
        await capture(page, testInfo, `ai-mermaid-${locale}`, page.getByTestId('mermaid-document-demo'))
      }
    }
  }
  await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en-US', url: new URL(page.url()).origin }])
  await page.goto('/admin/ui-gallery/overlays')
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Confirm dialog', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Continue?')
  await capture(page, testInfo, 'ui-confirm-en', dialog)
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('.hai-toast-item')).toContainText('Confirmed')
  expect(failures).toEqual([])
})

test('反馈并发处理冲突保留恢复建议与追踪标识，刷新后可继续操作', async ({ page }, testInfo) => {
  await loginOnPage(page, dutyAccounts.operator.username, dutyAccounts.operator.password)
  const input: FeedbackSubmitInput = { submissionId: uniqueUser('conflict').username, appId: 'admin-console', description: 'Example: concurrent review' }
  const accepted = await page.request.post('/api/feedback/reports', { data: input })
  const submission: HaiResult<FeedbackReport> = await accepted.json()
  expect(submission.success).toBe(true)
  if (!submission.success)
    throw new Error(submission.error.message, { cause: submission.error })
  const id: string = submission.data.id
  await page.goto(`/admin/feedback?feedback=${encodeURIComponent(id)}`)
  await waitForHydration(page)
  const detail = page.locator('.feedback-detail')
  await expect(detail).toContainText(submission.data.number)
  await detail.getByRole('tab', { name: '处理与投递', exact: true }).click()
  const before: HaiResult<FeedbackDetail> = await (await page.request.get(`/api/feedback/reports/${id}`)).json()
  if (!before.success)
    throw new Error(before.error.message, { cause: before.error })
  const concurrent = await page.request.patch(`/api/feedback/reports/${id}/status`, { data: {
    id,
    status: 'handled',
    expectedVersion: before.data.report.version,
    note: 'Reviewed in another session',
  } })
  expect((await concurrent.json()).success).toBe(true)
  await detail.getByRole('button', { name: '标记已处理', exact: true }).click()
  const toast = page.locator('.hai-toast-item[data-variant=error]')
  await expect(toast).toContainText('请刷新后重试')
  await expect(toast).not.toContainText('traceId:')
  await expect(toast.locator('code')).toHaveCount(0)
  await capture(page, testInfo, 'feedback-conflict')
  await toast.getByRole('button', { name: '查看排查信息', exact: true }).click()
  await expect(toast).toContainText('问题追踪编号')
  await expect(toast.locator('code')).toHaveText(/^[\w.:-]{1,128}$/)
  await expect(toast).toContainText('联系客户支持或开发人员')
  await capture(page, testInfo, 'feedback-conflict-diagnostics')
  await toast.getByRole('button', { name: '复制编号', exact: true }).click()
  await expect(toast).toContainText('编号已复制')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, testInfo, 'feedback-conflict-diagnostics-mobile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await waitForHydration(page)
  await detail.getByRole('tab', { name: '处理与投递', exact: true }).click()
  await expect(detail.getByRole('button', { name: '撤销处理', exact: true })).toBeEnabled()
  await capture(page, testInfo, 'feedback-conflict-recovered', detail)
})
