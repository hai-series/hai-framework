/**
 * =============================================================================
 * @hai/core - i18n 测试（Node.js）
 * =============================================================================
 */

import { afterEach, describe, expect, it } from 'vitest'
import { core } from '../src/core-index.node.js'

describe('core.i18n (node)', () => {
  afterEach(() => {
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('setGlobalLocale/getGlobalLocale 应该设置并读取', () => {
    core.i18n.setGlobalLocale('en-US')
    expect(core.i18n.getGlobalLocale()).toBe('en-US')
  })

  it('resolveLocale/isLocaleSupported 应该处理回退', () => {
    expect(core.i18n.isLocaleSupported('zh-CN')).toBe(true)
    expect(core.i18n.isLocaleSupported('fr-FR')).toBe(false)
    expect(core.i18n.resolveLocale('fr-FR')).toBe('zh-CN')
  })

  it('detectBrowserLocale 在无 navigator 时应返回 undefined', () => {
    const originalNavigator = (globalThis as Record<string, unknown>).navigator

    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
    })
    expect(core.i18n.detectBrowserLocale()).toBeUndefined()

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  it('createMessageGetter 应该读取全局 locale 并支持插值', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { hello: '你好 {name}' },
      'en-US': { hello: 'Hello {name}' },
    })

    core.i18n.setGlobalLocale('en-US')
    expect(getMessage('hello', { params: { name: 'World' } })).toBe('Hello World')

    core.i18n.setGlobalLocale('zh-CN')
    expect(getMessage('hello', { params: { name: '世界' } })).toBe('你好 世界')
  })

  it('registerMessages/getRegisteredMessage 应该获取已注册消息', () => {
    core.i18n.registerMessages('demo', {
      'zh-CN': { ok: '好' },
      'en-US': { ok: 'OK' },
    })

    core.i18n.setGlobalLocale('en-US')
    expect(core.i18n.getRegisteredMessage('demo', 'ok')).toBe('好')
    expect(core.i18n.getRegisteredMessage('demo', 'ok', { locale: 'en-US' })).toBe('OK')
  })

  it('coreM 应该读取 core 内置消息', () => {
    core.i18n.setGlobalLocale('en-US')
    expect(core.i18n.coreM('error_timeout')).toBe('Request timeout')
  })
})
