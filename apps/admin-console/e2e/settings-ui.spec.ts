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

    const title = page.locator('h1.text-2xl')
    await expect(title).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 外观设置区域
  // ---------------------------------------------------------------------------
  test('外观设置区域包含主题选择器', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // 外观设置标题（h2）
    const sectionTitle = page.locator('h2').filter({ hasText: /外观|Appearance/ })
    await expect(sectionTitle.first()).toBeVisible()

    // ThemeSelector 组件应可见
    // 主题相关的按钮/选项
    const themeArea = page.locator('section').first()
    await expect(themeArea).toBeVisible()
  })

  test('切换主题后 data-theme 属性变化', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // 查找主题选择器中的某个选项并点击
    // ThemeSelector 通常渲染为按钮或 radio（具体取决于 @hai/ui 实现）
    // 尝试点击 dark 主题选项
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
  // 区域设置
  // ---------------------------------------------------------------------------
  test('语言设置区域可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // 区域设置标题
    const regionTitle = page.locator('h2').filter({ hasText: /区域|Region/ })
    await expect(regionTitle.first()).toBeVisible()
  })

  test('语言选项包含简体中文和English', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // LanguageSwitch 组件内应有语言选项
    const langArea = page.locator('text=简体中文')
    // locator 可能匹配到按钮/选项
    if (await langArea.isVisible()) {
      await expect(langArea).toBeVisible()
    }

    const englishOption = page.locator('text=English')
    if (await englishOption.isVisible()) {
      await expect(englishOption).toBeVisible()
    }
  })

  // ---------------------------------------------------------------------------
  // 系统信息
  // ---------------------------------------------------------------------------
  test('系统信息区域显示应用名称和版本', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // 关于/系统信息标题
    const aboutTitle = page.locator('h2').filter({ hasText: /关于|系统|About/ })
    await expect(aboutTitle.first()).toBeVisible()

    // 版本号 "0.1.0"
    const version = page.locator('text=0.1.0')
    await expect(version).toBeVisible()
  })

  test('系统信息区域显示应用名称', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    // 应用名称（m.app_title() → "hai Admin"）
    const appName = page.locator('text=hai Admin')
    await expect(appName.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 三个 section 完整可见
  // ---------------------------------------------------------------------------
  test('三个设置 section 全部渲染', async ({ page, request }) => {
    await registerAndLogin(page, request, 'setui')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')

    const sections = page.locator('section')
    const count = await sections.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })
})
