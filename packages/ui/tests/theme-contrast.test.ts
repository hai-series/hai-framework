// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import ThemeSelector from '../src/lib/components/scenes/app/ThemeSelector.svelte'
import { setUILocale } from '../src/lib/messages.js'
import { isDarkTheme, normalizeThemeId, resolveThemeTone } from '../src/lib/theme-config.js'

it('共享自有主题可被首屏初始化识别，并使用对应原生控件配色', () => {
  expect(normalizeThemeId('high-contrast')).toBe('high-contrast')
  expect(resolveThemeTone('high-contrast')).toBe('dark')
  expect(isDarkTheme('high-contrast')).toBe(true)
  expect(normalizeThemeId('formal')).toBe('formal')
  expect(resolveThemeTone('formal')).toBe('light')
  expect(normalizeThemeId('eye-care')).toBe('eye-care')
  expect(resolveThemeTone('eye-care')).toBe('light')
  expect(isDarkTheme('eye-care')).toBe(false)
})

it.each([
  ['zh-CN', '高对比', 'high-contrast'],
  ['en-US', 'High contrast', 'high-contrast'],
  ['ja-JP', 'ハイコントラスト', 'high-contrast'],
  ['zh-CN', '简洁商务', 'formal'],
  ['en-US', 'Formal', 'formal'],
  ['ja-JP', 'ビジネス（角丸なし）', 'formal'],
  ['zh-CN', '护眼', 'eye-care'],
  ['en-US', 'Eye care', 'eye-care'],
  ['ja-JP', '目にやさしい', 'eye-care'],
])('%s 主题选择器可选择 %s', async (locale, label, theme) => {
  const target = document.createElement('div')
  document.body.append(target)
  setUILocale(locale)
  const onchange = vi.fn()
  const component = mount(ThemeSelector, {
    target,
    props: { onchange },
  })
  try {
    flushSync()
    target.querySelector('button')!.click()
    flushSync()
    const choice = [
      ...target.querySelectorAll('button'),
    ].find(button => button.textContent?.trim() === label)
    expect(choice).toBeDefined()
    choice!.click()
    expect(onchange).toHaveBeenCalledWith(theme)
  }
  finally {
    await unmount(component)
    target.remove()
    setUILocale('zh-CN')
  }
})
