/**
 * =============================================================================
 * E2E 测试 - 模块功能示例页面 UI
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin, waitForHydration } from './helpers'

async function clickModuleTab(page: import('@playwright/test').Page, name: RegExp) {
  await waitForHydration(page)
  const tablist = page.locator('[role="tablist"]').first()
  const tab = tablist.getByRole('tab', { name })
  await expect(tab).toBeVisible()
  for (let attempt = 0; attempt < 2; attempt++) {
    await tab.click()
    try {
      await expect(tab).toHaveClass(/tab-active/, { timeout: 3_000 })
      return
    }
    catch (error) {
      if (attempt === 1) {
        throw error
      }
    }
  }
}

test.describe('Modules Page UI', () => {
  // ---------------------------------------------------------------------------
  // 页面结构
  // ---------------------------------------------------------------------------
  test('页面标题和描述可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // PageHeader 组件
    const heading = page.locator('h1, h2').filter({ hasText: /模块|Module/ })
    await expect(heading.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Tab 切换
  // ---------------------------------------------------------------------------
  test('显示 6 个模块标签页', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // Tabs 组件渲染的标签项
    // 8 个标签：core, db, cache, storage, ai, vecdb, datapipe, crypto
    const tabItems = page.locator('[role="tab"], .tab, button').filter({ hasText: /core|db|cache|storage|ai|vecdb|datapipe|crypto/i })
    const count = await tabItems.count()
    expect(count).toBeGreaterThanOrEqual(8)
  })

  test('默认显示 core 标签页内容', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // core 标签页应默认显示
    const coreContent = page.locator('text=@h-ai/core')
    await expect(coreContent.first()).toBeVisible()
  })

  test('点击 db 标签切换到数据库模块内容', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // 点击 db 标签
    await clickModuleTab(page, /^db\b/i)

    // db 内容应可见
    const dbContent = page.locator('text=@h-ai/reldb')
    await expect(dbContent.first()).toBeVisible()
  })

  test('点击 cache 标签切换到缓存模块内容', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    await clickModuleTab(page, /cache/i)

    const cacheContent = page.locator('text=@h-ai/cache')
    await expect(cacheContent.first()).toBeVisible()
  })

  test('点击 crypto 标签切换到加密模块内容', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    await clickModuleTab(page, /crypto/i)

    const cryptoContent = page.locator('text=@h-ai/crypto')
    await expect(cryptoContent.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Core 标签页内容
  // ---------------------------------------------------------------------------
  test('core 标签页显示核心功能列表', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // 核心功能：配置管理、日志系统、i18n 国际化、模块生命周期
    await expect(page.locator('text=配置管理').first()).toBeVisible()
    await expect(page.locator('text=日志系统').first()).toBeVisible()
  })

  test('core 标签页显示初始化示例代码', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // 代码块包含 core.init
    const codeBlock = page.locator('code').filter({ hasText: 'core.init' })
    await expect(codeBlock.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Crypto 交互式 Demo
  // ---------------------------------------------------------------------------
  test('crypto 标签页包含交互式输入框和按钮', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // 切换到 crypto 标签
    await clickModuleTab(page, /crypto/i)

    // 明文输入框
    const plainInput = page.locator('#crypto-plain')
    await expect(plainInput).toBeVisible()

    // 哈希按钮
    const hashBtn = page.getByRole('button', { name: /哈希|Hash/ })
    await expect(hashBtn).toBeVisible()

    // 对称加密按钮
    const encryptBtn = page.getByRole('button', { name: /对称加密|Symmetric Encrypt/ })
    await expect(encryptBtn).toBeVisible()
  })

  test('crypto 哈希按钮点击后显示结果', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // 切换到 crypto
    await clickModuleTab(page, /crypto/i)

    // 点击哈希按钮
    const hashBtn = page.getByRole('button', { name: /哈希|Hash/ })
    await hashBtn.click()
    await page.waitForTimeout(500)

    // 哈希结果应出现
    const hashResult = page.locator('text=哈希结果')
    await expect(hashResult).toBeVisible()
  })

  test('crypto 对称加密按钮点击后显示结果', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    // 切换到 crypto
    await clickModuleTab(page, /crypto/i)

    // 输入自定义文本
    const plainInput = page.locator('#crypto-plain')
    await expect(plainInput).toBeVisible()
    await plainInput.fill('测试加密文本')

    // 点击对称加密按钮
    const encryptBtn = page.getByRole('button', { name: /对称加密|Symmetric Encrypt/ })
    await encryptBtn.click()
    await page.waitForTimeout(500)

    // 加密结果应出现
    const encryptResult = page.locator('text=加密结果')
    await expect(encryptResult).toBeVisible()
  })

  test('crypto 明文输入框可修改内容', async ({ page, request }) => {
    await registerAndLogin(page, request, 'modui')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    await clickModuleTab(page, /crypto/i)

    const plainInput = page.locator('#crypto-plain')
    await expect(plainInput).toBeVisible()
    await plainInput.clear()
    await plainInput.fill('自定义测试内容')

    const value = await plainInput.inputValue()
    expect(value).toBe('自定义测试内容')
  })
})
