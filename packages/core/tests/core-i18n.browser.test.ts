/**
 * =============================================================================
 * @h-ai/core - i18n 测试（Browser）
 * =============================================================================
 */

import { afterEach, describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.i18n (browser)', () => {
  afterEach(() => {
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('createMessageGetter 应该在 locale 覆盖时优先使用指定语言', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { hi: '你好' },
      'en-US': { hi: 'Hi' },
    })

    core.i18n.setGlobalLocale('zh-CN')
    expect(getMessage('hi', { locale: 'en-US' })).toBe('Hi')
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
