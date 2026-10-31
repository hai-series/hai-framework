import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test('弹窗中的提示可通过键盘关闭并恢复操作焦点', async ({ page, request }, testInfo) => {
  await registerAndLogin(page, request, 'toast-keyboard')
  await page.goto('/admin/ui-gallery/overlays')
  await page.getByRole('button', { name: '打开弹窗并测试 Toast', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const trigger = dialog.getByRole('button', { name: '成功 Toast', exact: true })
  await trigger.click()
  const notification = page.locator('.hai-toast-item')
  await page.keyboard.press('F8')
  await expect(notification.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('toast-modal-keyboard.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(notification).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('F8')
  await page.keyboard.press('Enter')
  await expect(notification).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('浮动提示支持方位、逐条展示、关闭和自动消失，不改变页面布局', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000)
  await registerAndLogin(page, request, 'toast')
  await page.goto('/admin/ui-gallery/overlays')
  const notification = page.locator('.hai-toast-item')
  for (const width of [390, 1440, 1920, 2560, 3840]) {
    await page.setViewportSize({ width, height: 960 })
    for (const position of ['bottom-right', 'top-right', 'bottom-center']) {
      const trigger = page.getByTestId(`toast-position-${position}`)
      await trigger.scrollIntoViewIfNeeded()
      const before = (await trigger.boundingBox())!
      await trigger.click()
      await expect(notification).toHaveCount(1)
      await expect(page.locator('.hai-toast-position')).toHaveAttribute('data-position', position)
      const box = (await notification.boundingBox())!
      const centers = await notification.evaluate((element) => {
        const center = (target: Element) => {
          const bounds = target.getBoundingClientRect()
          return bounds.y + bounds.height / 2
        }
        return [element.querySelector(':scope > span[aria-hidden="true"]')!, element.querySelector('.hai-toast-message')!, element.querySelector('button')!].map(center)
      })
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1)
      expect(box.height).toBeLessThanOrEqual(52)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(position.startsWith('top') ? box.y : 960 - box.y - box.height).toBeLessThan(40)
      const after = (await trigger.boundingBox())!
      expect(Math.abs(after.y - before.y)).toBeLessThan(1)
      await page.screenshot({ path: testInfo.outputPath(`toast-${width}-${position}.png`), animations: 'disabled' })
      await notification.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(notification).toHaveCount(0)
    }
  }
  await page.getByTestId('toast-queue').click()
  await expect(notification).toHaveCount(1)
  await expect(notification).toContainText('第 1 条提示')
  await notification.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(notification).toContainText('第 2 条提示')
  await page.mouse.move(10, 10)
  await expect(notification).toContainText('第 3 条提示')
  await expect(notification).toHaveCount(0)

  await page.getByRole('button', { name: '打开弹窗并测试 Toast', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '成功 Toast', exact: true }).click()
  await expect(notification).toBeVisible()
  await notification.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(notification).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('toast-position-bottom-right').click()
  await expect(notification).toBeVisible()
  expect(await notification.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('toast-dark-reduced-motion.png'), animations: 'disabled' })
  await notification.getByRole('button', { name: '关闭', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(notification).toHaveCount(0)

  await page.getByTestId('toast-position-bottom-right').click()
  await notification.hover()
  // 替换当前消息以单独验证布局：超长文本的首尾都应能滚动到可见区域。
  const overflow = await notification.locator('.hai-toast-message').evaluate((element) => {
    element.textContent = Array.from({ length: 100 }, (_, index) => `Line ${index + 1}`).join('\n')
    const text = element.firstChild!
    const character = (offset: number) => {
      const range = document.createRange()
      range.setStart(text, offset)
      range.setEnd(text, offset + 1)
      return range.getBoundingClientRect()
    }
    const frame = element.getBoundingClientRect()
    const first = character(0)
    element.scrollTop = element.scrollHeight
    const last = character(element.textContent.length - 1)
    return {
      scrollable: element.scrollHeight > element.clientHeight,
      firstVisible: first.top >= frame.top && first.bottom <= frame.bottom,
      lastVisible: last.top >= frame.top && last.bottom <= frame.bottom,
    }
  })
  expect(overflow).toEqual({ scrollable: true, firstVisible: true, lastVisible: true })
  await notification.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(notification).toHaveCount(0)

  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
    const borders = new Set<string>()
    const backgrounds = new Set<string>()
    for (const variant of ['info', 'success', 'warning', 'error']) {
      await page.getByTestId(`toast-type-${variant}`).click()
      await expect(notification).toHaveAttribute('data-variant', variant)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(notification).toHaveAttribute('role', variant === 'error' ? 'alert' : 'status')
      const colors = await notification.evaluate((element) => {
        const style = getComputedStyle(element)
        return { border: style.borderInlineStartColor, background: style.backgroundColor, width: style.borderInlineStartWidth }
      })
      expect(colors.width).toBe('3px')
      borders.add(colors.border)
      backgrounds.add(colors.background)
      await page.screenshot({ path: testInfo.outputPath(`toast-type-${theme}-${variant}.png`), animations: 'disabled' })
      if (theme === 'light' && variant === 'error')
        await notification.screenshot({ path: testInfo.outputPath('toast-error-compact.png'), animations: 'disabled' })
      await notification.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(notification).toHaveCount(0)
    }
    expect(borders.size).toBe(4)
    expect(backgrounds.size).toBe(4)
  }
  await page.getByRole('button', { name: '危险操作确认', exact: true }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(notification).toBeVisible()
  await expect(notification).toHaveAttribute('data-variant', 'success')
  await expect(notification).toContainText('已永久删除')
})
