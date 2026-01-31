/**
 * =============================================================================
 * @hai/core - LocaleManager 测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMessageGetter,
  getGlobalLocale,
  localeManager,
  setGlobalLocale,
} from '../../src/i18n/i18n-utils.js'

describe('localeManager', () => {
  beforeEach(() => {
    // 重置为默认 locale
    setGlobalLocale('zh-CN')
  })

  it('should get default locale', () => {
    expect(getGlobalLocale()).toBe('zh-CN')
  })

  it('should set global locale', () => {
    setGlobalLocale('en-US')
    expect(getGlobalLocale()).toBe('en-US')
  })

  it('should normalize short locale codes', () => {
    setGlobalLocale('en')
    expect(getGlobalLocale()).toBe('en-US')

    setGlobalLocale('zh')
    expect(getGlobalLocale()).toBe('zh-CN')
  })

  it('should not notify when setting same locale', () => {
    const listener = vi.fn()
    localeManager.subscribe(listener)

    // 初始调用
    expect(listener).toHaveBeenCalledTimes(1)

    // 设置相同 locale 不应触发
    setGlobalLocale('zh-CN')
    expect(listener).toHaveBeenCalledTimes(1)

    // 设置不同 locale 应触发
    setGlobalLocale('en-US')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('should allow unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = localeManager.subscribe(listener)

    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setGlobalLocale('en-US')

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
    setGlobalLocale('zh-CN')
  })

  afterEach(() => {
    setGlobalLocale('zh-CN')
  })

  it('should get message in default locale', () => {
    const { getMessage } = createMessageGetter(messages)
    expect(getMessage('hello')).toBe('你好')
  })

  it('should get message in specified locale', () => {
    const { getMessage } = createMessageGetter(messages)
    expect(getMessage('hello', 'en-US')).toBe('Hello')
  })

  it('should interpolate params', () => {
    const { getMessage } = createMessageGetter(messages)
    expect(getMessage('greeting', undefined, { name: 'World' })).toBe('你好，World！')
    expect(getMessage('greeting', 'en-US', { name: 'World' })).toBe('Hello, World!')
  })

  it('should auto-sync with global locale', () => {
    const { getMessage } = createMessageGetter(messages)

    expect(getMessage('hello')).toBe('你好')

    setGlobalLocale('en-US')
    expect(getMessage('hello')).toBe('Hello')

    setGlobalLocale('zh-CN')
    expect(getMessage('hello')).toBe('你好')
  })

  it('should return key for missing message', () => {
    const { getMessage } = createMessageGetter(messages)
    expect(getMessage('missing' as 'hello')).toBe('missing')
  })

  it('should fallback to zh-CN for unsupported locale', () => {
    const { getMessage } = createMessageGetter(messages)
    expect(getMessage('hello', 'fr-FR')).toBe('你好')
  })
})
