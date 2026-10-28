import { expect, test } from '@playwright/test'
import { loginOnPage, waitForHydration } from './helpers'

test('登录和查询可按 Enter 执行，直角主题与弹窗可全程用键盘操作', async ({ page }, testInfo) => {
  await page.goto('/auth/login')
  await waitForHydration(page)
  const login = page.locator('form.login-form')
  const identifier = login.locator('input[name="username"]')
  await expect.poll(() => identifier.evaluate(element => ({ activeId: document.activeElement?.id, activeTag: document.activeElement?.tagName, expected: element.id }))).toMatchObject({ activeId: 'login-username' })
  await identifier.fill('admin')
  const password = login.locator('input[type="password"]')
  await password.fill('admin123456')
  await expect(login.locator('button[type="submit"]')).toHaveAttribute('aria-keyshortcuts', 'Enter')
  await password.press('Enter')
  await expect(page).toHaveURL(/\/admin(?:\/|$)/)
  await page.goto('/admin/iam/users')
  await waitForHydration(page)
  if (await page.getByTestId('guide-later').isVisible())
    await page.getByTestId('guide-later').click()
  const appearance = page.locator('[data-guide="admin-theme"]')
  const trigger = appearance.locator('button').first()
  await trigger.focus()
  await trigger.press('ArrowDown')
  await expect(appearance.locator('button[data-theme-option]:focus')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(appearance.locator('button')).toHaveCount(1)
  await trigger.press('ArrowDown')
  await page.keyboard.press('Home')
  for (let index = 0; index < 20; index++) {
    if (await appearance.locator('button:focus').getAttribute('data-theme-option') === 'formal')
      break
    await page.keyboard.press('ArrowDown')
  }
  await expect(appearance.locator('button:focus')).toHaveAttribute('data-theme-option', 'formal')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'formal')
  await expect(trigger).toBeFocused()
  const create = page.locator('.hai-workspace button.btn-primary').first()
  expect(await create.evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe('0px')
  await create.press('Enter')
  const editor = page.getByRole('dialog')
  await expect(editor).toBeVisible()
  await expect(editor.locator('input:not([type="hidden"])').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await expect(create).toBeFocused()
  const row = page.getByRole('row').filter({ hasText: 'business_operator' })
  const remove = row.getByRole('button', { name: '删除', exact: true })
  await remove.press('Enter')
  const confirmation = page.locator('dialog[open]')
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(remove).toBeFocused()
  await remove.press('Enter')
  await page.locator('dialog[open]').getByRole('button', { name: '取消', exact: true }).press('Enter')
  await expect(row).toBeVisible()
  const search = page.locator('.hai-workspace input[type="search"]')
  await search.fill('audit_admin')
  await search.press('Enter')
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('audit_admin')
  await expect(page.getByRole('row').filter({ hasText: 'business_operator' })).toHaveCount(0)
  await page.reload()
  await waitForHydration(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'formal')
  await page.screenshot({ path: testInfo.outputPath('formal-keyboard.png'), animations: 'disabled' })
})

test('高对比主题可从导航选择，刷新保留，真实控件对比度及放大布局可用', async ({ page }, testInfo) => {
  await loginOnPage(page, 'admin', 'admin123456')
  await page.goto('/admin/iam/users')
  await waitForHydration(page)
  const appearance = page.locator('[data-guide="admin-theme"]')
  await appearance.locator('button').first().click()
  await appearance.getByRole('button', { name: '高对比', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast')
  await page.reload()
  await waitForHydration(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  const controls = [page.locator('.hai-workspace button.btn-primary').first(), page.locator('.hai-workspace > footer'), page.locator('.hai-workspace input[type="search"]:visible').first()]
  for (const control of controls) {
    await expect(control).toBeVisible()
    const ratios = await control.evaluate((element) => {
      // 在浏览器合成实际 CSS 颜色与祖先背景，兼容 color-mix 及透明背景。
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!
      const backgrounds = []
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement)
        backgrounds.push(getComputedStyle(ancestor).backgroundColor)
      context.fillStyle = '#000000'
      context.fillRect(0, 0, 1, 1)
      for (const background of backgrounds.reverse()) {
        context.fillStyle = background
        context.fillRect(0, 0, 1, 1)
      }
      const luminance = (values: Uint8ClampedArray) => [...values].slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0)
      const background = luminance(context.getImageData(0, 0, 1, 1).data)
      const colors = [getComputedStyle(element).color]
      if (element instanceof HTMLInputElement)
        colors.push(getComputedStyle(element, '::placeholder').color)
      return colors.map((color) => {
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const foreground = luminance(context.getImageData(0, 0, 1, 1).data)
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
    })
    for (const ratio of ratios)
      expect(ratio).toBeGreaterThanOrEqual(7)
  }
  const search = controls[2]!
  await search.focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineWidth)).toBe('3px')
  await page.screenshot({ path: testInfo.outputPath('high-contrast-1440.png'), animations: 'disabled' })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await page.setViewportSize({ width: 640, height: 960 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.locator('.hai-workspace > header h1').evaluate(element => element.clientWidth >= element.scrollWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('high-contrast-200-percent.png'), animations: 'disabled' })
})

test('管理工作区压缩留白，导航显示单一标题，分页不挤出视口', async ({ page }, testInfo) => {
  await loginOnPage(page, 'admin', 'admin123456')
  await page.goto('/admin/iam/users')
  await waitForHydration(page)
  const workspace = page.locator('.hai-workspace')
  await expect(workspace.locator(':scope > header h1')).toHaveText('用户管理')
  await expect(workspace.locator('main h1')).toHaveCount(0)
  for (const width of [1440, 1920, 2560, 3840, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const dimensions = await workspace.evaluate((element) => {
      const header = element.querySelector(':scope > header')!
      const main = element.querySelector(':scope > main')!
      const footer = element.querySelector(':scope > footer')!
      return { header: header.getBoundingClientRect().height, footer: footer.getBoundingClientRect().height, padding: Number.parseFloat(getComputedStyle(main).paddingTop), width: document.documentElement.scrollWidth }
    })
    expect(dimensions.header).toBeLessThanOrEqual(52)
    expect(dimensions.footer).toBeLessThanOrEqual(32)
    expect(dimensions.padding).toBeLessThanOrEqual(16)
    expect(dimensions.width).toBeLessThanOrEqual(width)
    await expect(page.locator('.hai-pagination__navigation')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`compact-workspace-${width}.png`), animations: 'disabled' })
  }
})

for (const [locale, expandedLabel] of [['zh-CN', '展开筛选'], ['en-US', 'Expand filters'], ['ja-JP', '絞り込みを展開']] as const) {
  test(`筛选折叠在 ${locale} 保留输入并支持键盘和主题`, async ({ page, context, browser }, testInfo) => {
    await loginOnPage(page, 'admin', 'admin123456')
    const origin = new URL(page.url()).origin
    await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: origin }])
    await page.goto('/admin/ui-gallery/compounds')
    await waitForHydration(page)
    const theme = locale === 'zh-CN' ? 'light' : 'dark'
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      const appearance = page.locator('[data-guide="admin-theme"]')
      await appearance.locator('button').first().click()
      await appearance.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme)
    const filters = page.getByTestId('gallery-collapsible-filters')
    const toggle = filters.locator('button[aria-controls]')
    await expect(toggle).toHaveText(expandedLabel)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await filters.scrollIntoViewIfNeeded()
      const folded = (await filters.boundingBox())!.height
      await toggle.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const panelId = await toggle.getAttribute('aria-controls')
      const panel = page.locator(`[id="${panelId}"]`)
      const field = panel.locator('input[type="text"]').first()
      await toggle.press('Tab')
      await expect(field).toBeFocused()
      await field.fill('Retained role')
      expect((await filters.boundingBox())!.height).toBeGreaterThan(folded + 20)
      await toggle.press('Space')
      await expect(field).toBeHidden()
      await toggle.press('Enter')
      await expect(field).toHaveValue('Retained role')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await filters.screenshot({ path: testInfo.outputPath(`filters-${locale}-${width}.png`), animations: 'disabled' })
      await filters.getByRole('button', { name: /重置|Reset|リセット/, exact: true }).click()
      await expect(field).toHaveValue('')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(panel).toBeHidden()
    }
    if (locale === 'zh-CN') {
      const touchContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() })
      try {
        const touch = await touchContext.newPage()
        await touch.goto('/admin/ui-gallery/compounds')
        await waitForHydration(touch)
        if (await touch.getByTestId('guide-later').isVisible())
          await touch.getByTestId('guide-later').click()
        const control = touch.getByTestId('gallery-collapsible-filters').locator('button[aria-controls]')
        await control.scrollIntoViewIfNeeded()
        expect(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await touch.getByTestId('gallery-collapsible-filters').screenshot({ path: testInfo.outputPath('filters-touch.png') })
      }
      finally {
        await touchContext.close()
      }
    }
  })
}
