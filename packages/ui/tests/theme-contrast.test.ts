// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import ThemeSelector from '../src/lib/components/scenes/app/ThemeSelector.svelte'
import { setUILocale } from '../src/lib/messages.js'
import { ui } from '../src/lib/ui-theme.js'

it('共享自有主题可被首屏初始化识别，并使用对应原生控件配色', () => {
  expect(ui.normalizeThemeId('high-contrast')).toBe('high-contrast')
  expect(ui.resolveThemeTone('high-contrast')).toBe('dark')
  expect(ui.isDarkTheme('high-contrast')).toBe(true)
  expect(ui.normalizeThemeId('formal')).toBe('formal')
  expect(ui.resolveThemeTone('formal')).toBe('light')
  expect(ui.normalizeThemeId('eye-care')).toBe('eye-care')
  expect(ui.resolveThemeTone('eye-care')).toBe('light')
  expect(ui.isDarkTheme('eye-care')).toBe(false)
  expect(ui.normalizeThemeId('liquid-glass')).toBe('liquid-glass')
  expect(ui.resolveThemeTone('liquid-glass')).toBe('light')
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
  ['zh-CN', '液态玻璃', 'liquid-glass'],
  ['en-US', 'Liquid glass', 'liquid-glass'],
  ['ja-JP', 'リキッドガラス', 'liquid-glass'],
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

it.each([true, false])('选择器只显示宿主允许的主题（分组 %s）', async (grouped) => {
  const target = document.body.appendChild(document.createElement('div'))
  const onchange = vi.fn()
  const component = mount(ThemeSelector, {
    target,
    props: {
      grouped,
      themeIds: ['light', 'liquid-glass'],
      onchange,
    },
  })
  try {
    flushSync()
    target.querySelector('button')!.click()
    flushSync()
    const choices = [
      ...target.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
    ]
    expect(choices.map(choice => choice.dataset.themeOption)).toEqual(['light', 'liquid-glass'])
    choices[1].click()
    expect(onchange).toHaveBeenCalledWith('liquid-glass')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
