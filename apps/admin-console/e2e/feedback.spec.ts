import type { HaiResult } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { dutyAccounts, loginOnPage, registerViaApi, transportAdmin, uniqueUser } from './helpers'

test('用户与处理人员在同一份反馈中交换图片、文件和处理结果', async ({ page: staff, browser, baseURL }, testInfo) => {
  test.setTimeout(60_000)
  const origin = baseURL!
  const title = uniqueUser('feedback').username
  const author = uniqueUser('feedback-author')
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { Origin: origin },
  })
  const member = await context.newPage()
  try {
    const registration = await registerViaApi(member.request, author)
    const registered: HaiResult<{ user: { id: string } }> = await registration.json()
    expect(registered.success).toBe(true)
    if (!registered.success)
      throw new Error(registered.error.message)

    await loginOnPage(staff, transportAdmin.username, transportAdmin.password)
    const roles: HaiResult<{ id: string, code: string }[]> = await (await staff.request.get('/api/iam/roles')).json()
    expect(roles.success).toBe(true)
    if (!roles.success)
      throw new Error(roles.error.message)
    const role = roles.data.find(item => item.code === 'user')
    expect(role).toBeDefined()
    const assignment = await staff.request.put(`/api/iam/users/${registered.data.user.id}`, {
      data: {
        roles: [role!.id],
      },
    })
    expect((await assignment.json()).success).toBe(true)

    await loginOnPage(member, author.username, author.password)
    await expect(member.locator('a[href="/admin/feedback"]')).toHaveCount(0)
    const screenshot = await member.screenshot()
    await member.getByTestId('feedback-open').click()
    const submit = member.getByRole('dialog', { name: '反馈', exact: true })
    await submit.getByRole('textbox', { name: '内容' }).fill(title)
    await submit.locator('input[type=file]').setInputFiles({ name: 'initial.png', mimeType: 'image/png', buffer: screenshot })
    await submit.getByRole('button', { name: '提交反馈' }).click()
    await expect(member.getByTestId('feedback-status')).toHaveText('待处理')
    await expect(member.getByText('initial.png', { exact: true })).toBeVisible()

    await staff.request.post('/api/auth/logout')
    await loginOnPage(staff, dutyAccounts.operator.username, dutyAccounts.operator.password)
    await staff.goto('/admin/feedback')
    await staff.getByRole('button', {
      name: new RegExp(title),
    }).click()
    const processing = staff.getByTestId('feedback-detail')
    await processing.getByRole('textbox', { name: '回复内容' }).fill('请补充打开订单失败时的截图')
    await processing.locator('input[type=file]').setInputFiles({
      name: 'steps.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Open the order.'),
    })
    await processing.getByRole('button', { name: '要求补充信息' }).click()
    await expect(staff.getByTestId('feedback-status')).toHaveText('待用户补充')

    const detail = member.getByTestId('feedback-detail')
    await detail.getByRole('button', { name: '刷新' }).click()
    await expect(detail.getByText('请补充打开订单失败时的截图')).toBeVisible()
    const download = member.waitForEvent('download')
    await detail.locator('li').filter({ hasText: 'steps.txt' }).getByRole('button', { name: '下载' }).click()
    const saved = await download
    expect(saved.suggestedFilename()).toBe('steps.txt')
    expect(await readFile(await saved.path(), 'utf8')).toBe('Open the order.')
    await detail.locator('input[type=file]').setInputFiles({ name: 'reply.png', mimeType: 'image/png', buffer: screenshot })
    await detail.getByRole('button', { name: '发送回复' }).click()
    await expect(detail.getByTestId('feedback-status')).toHaveText('待处理')

    await processing.getByRole('button', { name: '刷新' }).click()
    await processing.locator('li').filter({ hasText: 'reply.png' }).getByRole('button', { name: '预览图片' }).click()
    await expect.poll(() => processing.getByRole('img', { name: 'reply.png' }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    await processing.getByRole('textbox', { name: '回复内容' }).fill('订单页面已恢复')
    await processing.getByRole('button', { name: '发送回复' }).click()
    await expect(processing.getByText('订单页面已恢复', { exact: true })).toBeVisible()
    await processing.getByRole('button', { name: '标记已处理' }).click()
    await expect(processing.getByTestId('feedback-status')).toHaveText('已处理')

    await detail.getByRole('button', { name: '刷新' }).click()
    await expect(detail.getByTestId('feedback-status')).toHaveText('已处理')
    await expect(detail.getByText('订单页面已恢复', { exact: true })).toBeVisible()
    await expect(detail.getByRole('button', { name: '要求补充信息' })).toHaveCount(0)
    await expect(detail.getByRole('button', { name: '发送回复' })).toBeVisible()
    await member.screenshot({
      path: testInfo.outputPath('feedback-conversation-mobile.png'),
      fullPage: true,
    })
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  finally {
    await context.close()
  }
})
