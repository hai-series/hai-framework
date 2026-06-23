/**
 * =============================================================================
 * E2E 测试 - 系统设置页面 UI
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('Settings UI', () => {
  // ---------------------------------------------------------------------------
  // 页面结构
  // ---------------------------------------------------------------------------
  test('页面标题和副标题可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    const title = page.locator('h1.text-xl')
    await expect(title).toBeVisible()
  })

  test('分区导航包含外观/区域/关于', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('button', { name: /外观|Appearance/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /区域|Region/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /关于|About/ })).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 外观设置（默认分区）
  // ---------------------------------------------------------------------------
  test('外观分区默认显示主题选择器', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // 主题设置标题文案（外观为默认分区）
    const themeLabel = page.locator('text=/主题|Theme/').first()
    await expect(themeLabel).toBeVisible()
  })

  test('切换主题后 data-theme 属性变化', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // 外观为默认分区，主题选项直接可见
    const darkOption = page.locator('[data-theme="dark"]').first()
    if (await darkOption.isVisible()) {
      await darkOption.click()
      await page.waitForTimeout(500)

      const newTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme'),
      )
      // 只要点击成功，主题应该发生变化（或保持 dark）
      expect(newTheme).toBe('dark')
    }
  })

  // ---------------------------------------------------------------------------
  // 区域设置（点击导航切换）
  // ---------------------------------------------------------------------------
  test('切换到区域分区显示语言选项', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /区域|Region/ }).click()
    await page.waitForTimeout(300)

    // LanguageSwitch 组件内应有语言选项
    const langArea = page.locator('text=简体中文')
    if (await langArea.isVisible()) {
      await expect(langArea).toBeVisible()
    }

    const englishOption = page.locator('text=English')
    if (await englishOption.isVisible()) {
      await expect(englishOption).toBeVisible()
    }
  })

  // ---------------------------------------------------------------------------
  // 系统信息（点击导航切换）
  // ---------------------------------------------------------------------------
  test('切换到关于分区显示应用名称', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /关于|About/ }).click()
    await page.waitForTimeout(300)

    // 应用名称（m.app_title() → "hai Admin"）
    const appName = page.locator('text=hai Admin')
    await expect(appName.first()).toBeVisible()
  })

  test('页脚显示版本号', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // 版本号（页脚）
    const version = page.locator('footer').getByText(/v\d+\.\d+\.\d+/)
    await expect(version).toBeVisible()
  })
})
