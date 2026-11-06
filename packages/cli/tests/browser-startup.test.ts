import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function startBrowser(userAgent: string, language = 'en-US') {
  const replace = vi.fn()
  const asset = 'https://app.example/portal/_hai/browser-check/startup.js'
  const source = readFileSync(new URL('../templates/shared/browser-check/startup.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    document: {
      documentElement: { lang: language, hasAttribute: () => false },
      getElementById: () => ({ src: asset }),
    },
    navigator: { userAgent, language },
    window: { location: { replace } },
  })
  return replace
}

describe('浏览器启动版本检测', () => {
  it.each([
    ['Chrome', 'Mozilla/5.0 Chrome/110.0.0.0 Safari/537.36'],
    ['Edge', 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Edg/100.0.1185.36'],
    ['旧版 Edge', 'Mozilla/5.0 Chrome/42.0.2311.135 Safari/537.36 Edge/18.19041'],
    ['Firefox', 'Mozilla/5.0 Gecko/20100101 Firefox/113.0'],
    ['Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/16.3 Safari/605.1.15'],
    ['iOS 上的 Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1'],
  ])('将低版本 %s 转到同一站点子目录的升级页', (_browser, userAgent) => {
    expect(startBrowser(userAgent, 'ja-JP')).toHaveBeenCalledExactlyOnceWith('https://app.example/portal/_hai/browser-check/update.html#ja')
  })

  it.each([
    'Mozilla/5.0 Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 Chrome/109.0.0.0 Safari/537.36 Edg/111.0.1661.41',
    'Mozilla/5.0 Gecko/20100101 Firefox/114.0',
    'Mozilla/5.0 Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15 FxiOS/112.0 Mobile/15E148 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 10; Device Build/ID; wv) Chrome/100.0.0.0 Mobile Safari/537.36',
    'ExampleBrowser/42.0',
  ])('允许达到门槛或无法确定版本的浏览器启动：%s', (userAgent) => {
    expect(startBrowser(userAgent)).not.toHaveBeenCalled()
  })
})
