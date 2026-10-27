// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { applyTheme, THEMES } from '../src/lib/theme-config.js'

const originalTheme = document.documentElement.getAttribute('data-theme')
const originalStyle = document.documentElement.getAttribute('style')
afterEach(() => {
  for (const [name, value] of [['data-theme', originalTheme], ['style', originalStyle]] as const) {
    if (value === null)
      document.documentElement.removeAttribute(name)
    else
      document.documentElement.setAttribute(name, value)
  }
})

it('切换内置主题时原生表单控件的配色同步更新，覆盖首屏初始化值', () => {
  document.documentElement.style.colorScheme = 'light'
  for (const theme of [...THEMES].reverse()) {
    applyTheme(theme.id, false)
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme.id)
    expect(document.documentElement.style.colorScheme).toBe(theme.dark ? 'dark' : 'light')
  }
})

it('自定义主题移除旧的内联配色，由宿主样式决定原生控件配色', () => {
  document.documentElement.style.colorScheme = 'dark'
  applyTheme('host-theme', false)
  expect(document.documentElement.getAttribute('data-theme')).toBe('host-theme')
  expect(document.documentElement.style.colorScheme).toBe('')
})
