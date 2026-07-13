/**
 * =============================================================================
 * E2E 测试 - UI Gallery / Compounds（Combobox 多选）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('UI Gallery Compounds', () => {
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
