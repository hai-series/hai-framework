import process from 'node:process'
import { chromium } from 'playwright-core'

async function render() {
  const [proxy, url, output] = process.argv.slice(2)
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    chromiumSandbox: true,
    proxy: { server: proxy, bypass: '<-loopback>' },
    args: ['--disable-quic'],
  })
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      acceptDownloads: false,
      serviceWorkers: 'block',
      viewport: { width: 1280, height: 720 },
    })
    await context.route('**/*', async (route) => {
      const target = new URL(route.request().url())
      if (target.protocol !== 'https:' || target.port || target.username || target.password) {
        await route.abort()
        return
      }
      await route.continue()
    })
    const page = await context.newPage()
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    if (!response?.ok() || new URL(page.url()).protocol !== 'https:')
      throw new Error('Navigation failed')
    await page.screenshot({ path: output, timeout: 10_000 })
  }
  finally {
    await browser.close()
  }
}

render().catch(() => {
  process.exitCode = 1
})
