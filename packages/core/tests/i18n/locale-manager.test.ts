/**
 * =============================================================================
 * @hai/core - LocaleManager 测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/i18n/index.js'

describe('localeManager', () => {
  beforeEach(() => {
    // 重置为默认 locale
    i18n.setGlobalLocale('zh-CN')
  })

  it('should get default locale', () => {
    expect(i18n.getGlobalLocale()).toBe('zh-CN')
  })

  it('should set global locale', () => {
    i18n.setGlobalLocale('en-US')
    expect(i18n.getGlobalLocale()).toBe('en-US')
  })

  it('should normalize short locale codes', () => {
    i18n.setGlobalLocale('en')
    expect(i18n.getGlobalLocale()).toBe('en-US')

    i18n.setGlobalLocale('zh')
    expect(i18n.getGlobalLocale()).toBe('zh-CN')
  })

  it('should not notify when setting same locale', () => {
    const listener = vi.fn()
    i18n.subscribeLocale(listener)

    // 初始调用
    expect(listener).toHaveBeenCalledTimes(1)

    // 设置相同 locale 不应触发
    i18n.setGlobalLocale('zh-CN')
    expect(listener).toHaveBeenCalledTimes(1)

    // 设置不同 locale 应触发
    i18n.setGlobalLocale('en-US')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('should allow unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = i18n.subscribeLocale(listener)

    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    i18n.setGlobalLocale('en-US')

    // 取消订阅后不应再调用
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('createMessageGetter', () => {
  const messages = {
    'zh-CN': {
      hello: '你好',
      greeting: '你好，{name}！',
    },
    'en-US': {
      hello: 'Hello',
      greeting: 'Hello, {name}!',
    },
  }

  beforeEach(() => {
    i18n.setGlobalLocale('zh-CN')
  })

  afterEach(() => {
    i18n.setGlobalLocale('zh-CN')
  })

  it('should get message in default locale', () => {
    const { getMessage } = i18n.createMessageGetter(messages)
    expect(getMessage('hello')).toBe('你好')
  })

  it('should get message in specified locale', () => {
    const { getMessage } = i18n.createMessageGetter(messages)
    expect(getMessage('hello', { locale: 'en-US' })).toBe('Hello')
  })

  it('should interpolate params', () => {
    const { getMessage } = i18n.createMessageGetter(messages)
    expect(getMessage('greeting', { params: { name: 'World' } })).toBe('你好，World！')
    expect(getMessage('greeting', { locale: 'en-US', params: { name: 'World' } })).toBe('Hello, World!')
  })

  it('should auto-sync with global locale', () => {
    const { getMessage } = i18n.createMessageGetter(messages)

    expect(getMessage('hello')).toBe('你好')

    i18n.setGlobalLocale('en-US')
    expect(getMessage('hello')).toBe('Hello')

    i18n.setGlobalLocale('zh-CN')
    expect(getMessage('hello')).toBe('你好')
  })

  it('should return key for missing message', () => {
    const { getMessage } = i18n.createMessageGetter(messages)
    expect(getMessage('missing' as 'hello')).toBe('missing')
  })

  it('should fallback to zh-CN for unsupported locale', () => {
    const { getMessage } = i18n.createMessageGetter(messages)
    expect(getMessage('hello', { locale: 'fr-FR' })).toBe('你好')
  })
})
