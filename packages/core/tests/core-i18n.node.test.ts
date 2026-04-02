/**
 * =============================================================================
 * @h-ai/core - i18n 测试（Node.js）
 * =============================================================================
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('core.i18n (node)', () => {
  afterEach(() => {
    core.i18n.setRequestLocaleResolver(null)
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('setGlobalLocale/getGlobalLocale 应该设置并读取', () => {
    core.i18n.setGlobalLocale('en-US')
    expect(core.i18n.getGlobalLocale()).toBe('en-US')
  })

  it('setGlobalLocale 应该规范化简写语言代码', () => {
    core.i18n.setGlobalLocale('en')
    expect(core.i18n.getGlobalLocale()).toBe('en-US')

    core.i18n.setGlobalLocale('zh')
    expect(core.i18n.getGlobalLocale()).toBe('zh-CN')
  })

  it('createMessageGetter 应该处理 locale 回退与占位符保留', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { greet: '你好 {name}，欢迎 {place}' },
      'en-US': { greet: 'Hello {name}, welcome to {place}' },
    })

    // 全局 locale 不存在时应回退到默认语言
    core.i18n.setGlobalLocale('fr-FR')
    expect(getMessage('greet', { params: { name: 'World' } })).toBe('你好 World，欢迎 {place}')
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

  it('createMessageGetter 应该支持 locale 覆盖', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { hi: '嗨' },
      'en-US': { hi: 'Hi' },
    })

    core.i18n.setGlobalLocale('zh-CN')
    expect(getMessage('hi', { locale: 'en-US' })).toBe('Hi')
  })

  it('createMessageGetter 应该隔离并发请求的 locale', async () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { hello: '你好' },
      'en-US': { hello: 'Hello' },
    })
    const localeStorage = new AsyncLocalStorage<string>()

    core.i18n.setRequestLocaleResolver(() => localeStorage.getStore())

    const [en, zh] = await Promise.all([
      localeStorage.run('en-US', async () => {
        await delay(15)
        return getMessage('hello')
      }),
      localeStorage.run('zh-CN', async () => {
        await delay(1)
        return getMessage('hello')
      }),
    ])

    expect(en).toBe('Hello')
    expect(zh).toBe('你好')
  })

  it('createMessageGetter 应该在请求级 locale 缺失时回退到全局 locale', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { hello: '你好' },
      'en-US': { hello: 'Hello' },
    })

    core.i18n.setGlobalLocale('en-US')
    core.i18n.setRequestLocaleResolver(() => undefined)

    expect(getMessage('hello')).toBe('Hello')
  })

  it('createMessageGetter 不存在的 key 应返回 key 本身', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { ok: '好' },
    })

    expect(getMessage('nonexistent' as never)).toBe('nonexistent')
  })

  it('createMessageGetter 不存在的 locale 应回退到默认语言', () => {
    const getMessage = core.i18n.createMessageGetter({
      'zh-CN': { greet: '你好' },
    })

    core.i18n.setGlobalLocale('en-US')
    // en-US 字典不存在，应回退到 zh-CN
    expect(getMessage('greet')).toBe('你好')
  })

  it('coreM 应该读取 core 内置消息', () => {
    core.i18n.setGlobalLocale('en-US')
    expect(core.i18n.coreM('core_errorTimeout')).toBe('Request timeout')

    core.i18n.setGlobalLocale('zh-CN')
    expect(core.i18n.coreM('core_errorTimeout')).toBe('请求超时')
  })

  it('coreM 应该支持插值', () => {
    core.i18n.setGlobalLocale('zh-CN')
    const msg = core.i18n.coreM('core_validationRequired', { params: { field: '用户名' } })
    expect(msg).toBe('用户名 不能为空')
  })
})
