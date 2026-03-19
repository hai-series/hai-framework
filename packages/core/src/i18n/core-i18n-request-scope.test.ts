import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from './core-i18n-utils.js'

const getMessage = i18n.createMessageGetter({
  'zh-CN': { hello: '你好' },
  'en-US': { hello: 'Hello' },
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('core-i18n request scope isolation', () => {
  afterEach(() => {
    i18n.setRequestLocaleResolver(null)
    i18n.setGlobalLocale('zh-CN')
  })

  it('should isolate locale across concurrent async contexts', async () => {
    const localeStorage = new AsyncLocalStorage<string>()
    i18n.setRequestLocaleResolver(() => localeStorage.getStore())

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

  it('should fallback to global locale when request locale is missing', () => {
    i18n.setGlobalLocale('en-US')
    i18n.setRequestLocaleResolver(() => undefined)

    expect(getMessage('hello')).toBe('Hello')
  })
})
