/**
 * =============================================================================
 * @hai/core - i18n 测试（Browser）
 * =============================================================================
 */

import { afterEach, describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.i18n (browser)', () => {
  afterEach(() => {
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('detectBrowserLocale 应该根据 navigator 返回结果', () => {
    const originalNavigator = (globalThis as Record<string, unknown>).navigator

    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en-US'] },
      configurable: true,
    })
    expect(core.i18n.detectBrowserLocale()).toBe('en-US')

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  it('setGlobalLocale/getGlobalLocale 应该设置并读取', () => {
    core.i18n.setGlobalLocale('en-US')
    expect(core.i18n.getGlobalLocale()).toBe('en-US')
  })

  it('createMessageGetter 应该读取全局 locale', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { hi: '你好' },
      'en-US': { hi: 'Hi' },
    })

    core.i18n.setGlobalLocale('en-US')
    expect(getMessage('hi')).toBe('Hi')
  })
})
