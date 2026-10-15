/**
 * =============================================================================
 * E2E 测试 - UI Gallery / Compounds（Combobox 多选）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('UI Gallery Compounds', () => {
  test('表单支持四种布局、自动与显式跨列，并按容器宽度收拢', async ({ page, request }, testInfo) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 1100 })
    await registerAndLogin(page, request, 'formlayout')
    await page.goto('/admin/ui-gallery/compounds')
    const demo = page.getByTestId('form-layout-demo')
    const name = page.getByTestId('form-name-field')
    const email = page.getByTestId('form-email-field')
    const notes = page.getByTestId('form-notes-field')
    const shortNotes = page.getByTestId('form-short-notes-field')
    const fullRow = page.getByTestId('form-full-row-field')
    await expect(demo).toBeVisible()
    const width = async (locator: typeof name) => locator.evaluate(element => element.getBoundingClientRect().width)
    await expect.poll(async () => (await width(notes)) / (await width(name))).toBeGreaterThan(1.9)
    expect(Math.abs(await width(name) - await width(shortNotes))).toBeLessThan(1)
    expect(Math.abs(await width(notes) - await width(fullRow))).toBeLessThan(1)
    const nameBox = (await name.boundingBox())!
    const emailBox = (await email.boundingBox())!
    expect(Math.abs(nameBox.y - emailBox.y)).toBeLessThan(1)
    expect(emailBox.x).toBeGreaterThan(nameBox.x + nameBox.width)
    await demo.screenshot({ path: testInfo.outputPath('form-two-columns-top.png') })

    await page.getByTestId('form-label-left').click()
    const labelBox = (await name.locator('label').boundingBox())!
    const inputBox = (await name.locator('input').boundingBox())!
    expect(inputBox.x).toBeGreaterThan(labelBox.x + labelBox.width)
    await demo.screenshot({ path: testInfo.outputPath('form-two-columns-left.png') })
    await page.getByTestId('form-columns-1').click()
    await expect.poll(async () => Math.abs(await width(notes) - await width(name))).toBeLessThan(1)
    await page.getByTestId('form-label-top').click()
    const stackedLabel = (await name.locator('label').boundingBox())!
    const stackedInput = (await name.locator('input').boundingBox())!
    expect(stackedInput.y).toBeGreaterThan(stackedLabel.y + stackedLabel.height)

    await page.getByTestId('form-columns-2').click()
    await demo.locator('.hai-form-layout').evaluate(element => element.style.width = '480px')
    await expect.poll(async () => Math.abs(await width(notes) - await width(name))).toBeLessThan(1)
    await demo.locator('.hai-form-layout').evaluate(element => element.style.width = '')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('form-label-left').click()
    await expect.poll(async () => Math.abs(await width(notes) - await width(name))).toBeLessThan(1)
    const mobileLabel = (await name.locator('label').boundingBox())!
    const mobileInput = (await name.locator('input').boundingBox())!
    expect(mobileInput.y).toBeGreaterThan(mobileLabel.y + mobileLabel.height)
    await page.getByTestId('form-save').click()
    await expect(name.locator('input')).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toContainText('请填写此项。')
    await name.locator('input').fill('Ada')
    await email.locator('input').fill('wrong-email')
    await page.getByTestId('form-save').click()
    await expect(email).toContainText('请输入有效的邮箱地址。')
    await email.locator('input').fill('ada@example.com')
    await page.getByTestId('form-save').click()
    await expect(page.getByText('表单已提交', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await demo.screenshot({ path: testInfo.outputPath('form-mobile.png') })
    expect(pageErrors).toEqual([])
  })

  test('输入类控件在各 size 下应与 Input 保持同高', async ({ page, request }) => {
    await registerAndLogin(page, request, 'cmpsz')
    await page.goto('/admin/ui-gallery/compounds')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('输入类控件尺寸对齐')).toBeVisible()

    for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) {
      const inputHeight = await page.getByTestId(`aligned-input-${size}`).evaluate(element => element.getBoundingClientRect().height)

      for (const component of ['select', 'combobox', 'datepicker', 'taginput']) {
        const control = page.getByTestId(`aligned-${component}-${size}`)
        await expect(control).toBeVisible()
        await expect.poll(async () => control.evaluate(element => element.getBoundingClientRect().height)).toBe(inputHeight)
      }
    }
  })

  test('Combobox 多选选中后应清空搜索输入，不残留最后一个选项文本', async ({ page, request }) => {
    await registerAndLogin(page, request, 'cmpui')
    await page.goto('/admin/ui-gallery/compounds')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Combobox 可搜索选择（Bits UI）')).toBeVisible()

    const multiCount = page.getByText(/多选（已选:/)
    await expect(multiCount).toBeVisible()

    const multiBlock = multiCount.locator('xpath=ancestor::div[1]')
    const multiCombobox = multiBlock.locator('input[role="combobox"]').first()
    await expect(multiCombobox).toBeVisible()

    await multiCombobox.fill('Dev')

    const devopsOption = page.getByRole('option', { name: /^DevOps$/ })
    await expect(devopsOption).toBeVisible()
    await devopsOption.click()

    await expect(page.getByText(/多选（已选:\s*2 项）/)).toBeVisible()
    await expect(page.getByRole('button', { name: '移除 DevOps' })).toBeVisible()
    await expect(multiCombobox).toHaveValue('')
  })
})
