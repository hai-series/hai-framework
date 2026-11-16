import { rm } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

async function render() {
  const [proxy, inputUrl, output] = process.argv.slice(2)
  const url = new URL(inputUrl).href
  const deadline = performance.now() + 40_000
  const remaining = (maximum, reserve = 0) => {
    const budget = Math.floor(deadline - performance.now() - reserve)
    if (budget <= 0)
      throw new Error('Browser deadline exceeded')
    return Math.min(maximum, budget)
  }
  let browser
  let page
  const timer = setTimeout(() => {
    void browser?.close().catch(() => {})
  }, 40_000)
  timer.unref()
  try {
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      chromiumSandbox: true,
      proxy: { server: proxy, bypass: '<-loopback>' },
      args: ['--disable-quic'],
      timeout: remaining(10_000, 12_000),
    })
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
    page = await context.newPage()
    // 两次只读导航共用二十秒，同时为截图和关闭保留总预算。
    const navigationDeadline = Math.min(deadline - 12_000, performance.now() + 20_000)
    const navigationRemaining = () => {
      const budget = Math.floor(navigationDeadline - performance.now())
      if (budget <= 0)
        throw new Error('Navigation deadline exceeded')
      return budget
    }
    let response
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: navigationRemaining(),
        })
        break
      }
      catch (cause) {
        if (attempt !== 0 || !(cause instanceof Error)
          || cause.message.split('\n', 1)[0] !== `page.goto: net::ERR_NETWORK_CHANGED at ${url}`) {
          throw cause
        }
        await delay(Math.min(100, navigationRemaining()))
      }
    }
    if (!response?.ok() || new URL(page.url()).protocol !== 'https:')
      throw new Error('Navigation failed')
    await page.screenshot({
      path: output,
      timeout: remaining(10_000, 2000),
    })
    remaining(2000)
  }
  finally {
    try {
      await page?.close({ runBeforeUnload: false }).catch(() => {})
      await browser?.close()
    }
    finally { clearTimeout(timer) }
  }
}

render().catch(async () => {
  await rm(process.argv[4], { force: true }).catch(() => {})
  process.exitCode = 1
})
