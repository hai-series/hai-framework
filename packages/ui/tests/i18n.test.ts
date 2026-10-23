// @vitest-environment jsdom
import { core } from '@h-ai/core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LanguageSwitch from '../src/lib/components/scenes/app/LanguageSwitch.svelte'
import PasswordInput from '../src/lib/components/scenes/iam/PasswordInput.svelte'
import { createLocaleStore, detectBrowserLocale, setGlobalLocale } from '../src/lib/i18n.svelte.js'

afterEach(() => {
  localStorage.clear()
  setGlobalLocale('zh-CN')
  vi.restoreAllMocks()
})

describe('japanese locale', () => {
  it('检测浏览器日语并跳过未支持的首选语言', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR')
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'ja'])
    expect(detectBrowserLocale()).toBe('ja-JP')
    expect(createLocaleStore().current).toBe('ja-JP')
  })

  it('读取和保存日语偏好，统一使用规范语言码', () => {
    localStorage.setItem('hai-locale', 'ja')
    const store = createLocaleStore({ detectBrowser: false })
    expect(store.current).toBe('ja-JP')
    expect(core.i18n.getGlobalLocale()).toBe('ja-JP')
    store.set('ja')
    expect(localStorage.getItem('hai-locale')).toBe('ja-JP')
  })

  it('默认语言菜单可选择日语并更新已挂载组件的文案', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const store = createLocaleStore({ detectBrowser: false })
    const menu = mount(LanguageSwitch, { target, props: { onchange: language => store.set(language) } })
    const password = mount(PasswordInput, { target })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('[aria-label="切换语言"]')!.click()
      flushSync()
      const japanese = [...target.querySelectorAll('button')].find(button => button.textContent?.includes('日本語'))!
      expect(japanese).toBeDefined()
      japanese.click()
      flushSync()
      expect(store.current).toBe('ja-JP')
      expect(target.querySelector('[aria-label="パスワードを表示"]')).not.toBeNull()
    }
    finally {
      await unmount(menu)
      await unmount(password)
      target.remove()
    }
  })
})
