import type { LocaleInfo } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@h-ai/core', () => import('../../core/src/index.js'))

const { core } = await import('@h-ai/core')
const { createLocaleStore, detectBrowserLocale, isLocaleSupported, resolveLocale } = await import('../src/lib/i18n.svelte.js')

afterEach(() => {
  vi.unstubAllGlobals()
  core.i18n.setGlobalLocale('zh-CN')
})

function browser(language: string, languages: string[], saved?: string): void {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { language, languages })
  vi.stubGlobal('localStorage', { getItem: () => saved ?? null, setItem: vi.fn() })
}

it('首个不支持的候选不会提前返回默认语言', () => {
  browser('fr-FR', ['fr-FR', 'en-US'])
  expect(detectBrowserLocale()).toBe('en-US')
  expect(createLocaleStore().current).toBe('en-US')
})

it('按 navigator.languages 优先顺序命中自定义支持列表', () => {
  browser('en-US', ['de-DE', 'en-US'])
  const supported: LocaleInfo[] = [{ code: 'en-US', label: 'English' }, { code: 'de-DE', label: 'Deutsch' }]
  expect(detectBrowserLocale(supported)).toBe('de-DE')
  expect(createLocaleStore({ supportedLocales: supported, defaultLocale: 'en-US' }).current).toBe('de-DE')
})

it('全部候选不支持时才使用传入默认值，支持列表不含框架默认值也不会插入中文', () => {
  browser('fr-FR', ['fr-FR', 'it-IT'])
  const supported: LocaleInfo[] = [{ code: 'ja-JP', label: '日本語' }, { code: 'de-DE', label: 'Deutsch' }]
  expect(detectBrowserLocale(supported)).toBeNull()
  expect(createLocaleStore({ supportedLocales: supported, defaultLocale: 'de-DE' }).current).toBe('de-DE')
  expect(createLocaleStore({ supportedLocales: supported }).current).toBe('ja-JP')
})

it('区域与语言简写按可用项匹配并返回配置中的规范代码', () => {
  browser('EN-gb', ['EN-gb'])
  expect(detectBrowserLocale()).toBe('en-US')
  expect(resolveLocale('en')).toBe('en-US')
  expect(isLocaleSupported('en-GB')).toBe(true)
  const supported: LocaleInfo[] = [{ code: 'zh-CN', label: '中文' }, { code: 'zh-Hant', label: '繁體' }, { code: 'en', label: 'English' }]
  expect(resolveLocale('zh-Hant-TW', supported)).toBe('zh-Hant')
  expect(resolveLocale('EN_us', supported)).toBe('en')
})

it('持久化语言优先且规范化到实际支持项，无效值才继续浏览器列表', () => {
  browser('zh-CN', ['zh-CN'], 'en')
  expect(createLocaleStore().current).toBe('en-US')
  browser('fr-FR', ['fr-FR', 'en-US'], 'unsupported')
  const store = createLocaleStore({ defaultLocale: 'zh-CN' })
  expect(store.current).toBe('en-US')
  store.set('fr-FR')
  expect(store.current).toBe('zh-CN')
})

it('sSR 无 window/navigator 时只用自身默认值且不改请求外全局语言', () => {
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('navigator', undefined)
  expect(detectBrowserLocale()).toBeNull()
  const supported: LocaleInfo[] = [{ code: 'de-DE', label: 'Deutsch' }]
  expect(createLocaleStore({ defaultLocale: 'de-DE', supportedLocales: supported }).current).toBe('de-DE')
  expect(core.i18n.getGlobalLocale()).toBe('zh-CN')
  expect(resolveLocale('unknown', [], 'de-DE')).toBe('de-DE')
})
