import { expect, test } from '@playwright/test'

test('old browser sees upgrade instructions without the application bundles', async ({ page }) => {
  // 只改变浏览器脚本看到的版本，确保检测在客户端执行。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 Gecko/20100101 Firefox/113.0',
    })
  })
  await page.route('**/*', async (route) => {
    const { pathname } = new URL(route.request().url())
    if (/\.(?:js|css)$/.test(pathname) && !pathname.includes('/_hai/browser-check/'))
      await route.abort()
    else
      await route.continue()
  })
  await page.goto('./', { waitUntil: 'commit' })
  await expect(page).toHaveURL(/\/_hai\/browser-check\/update\.html#(?:zh|en|ja)$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Firefox 113.0')
  await expect(page.getByRole('main')).toContainText('Firefox 114')
  await expect(page.getByRole('link')).toHaveAttribute('href', 'https://support.mozilla.org/kb/update-firefox-latest-release')
})
