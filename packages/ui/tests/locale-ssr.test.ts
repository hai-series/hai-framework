/** SSR store 与内置消息读取同一请求语言，不写进程默认值。 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@h-ai/core', () => import('../../core/src/index.js'))

const { core } = await import('@h-ai/core')
const { createLocaleStore, setGlobalLocale } = await import('../src/lib/i18n.svelte.js')
const { uiM } = await import('../src/lib/messages.js')

describe('sSR locale isolation', () => {
  it('store 初始化、更新和 UI setter 不改变服务端默认语言', () => {
    core.i18n.setGlobalLocale('zh-CN')
    const store = createLocaleStore({ defaultLocale: 'en-US', detectBrowser: false })
    expect(store.current).toBe('en-US')
    expect(core.i18n.getGlobalLocale()).toBe('zh-CN')
    store.set('zh-CN')
    setGlobalLocale('en-US')
    expect(core.i18n.getGlobalLocale()).toBe('zh-CN')
  })

  it('并行异步 SSR 页面状态和内置错误消息使用各自语言', async () => {
    const gate = Promise.withResolvers<void>()
    const render = (locale: string) => core.i18n.runWithLocale(locale, async () => {
      const store = createLocaleStore({ defaultLocale: locale, detectBrowser: false })
      if (locale === 'en-US')
        await gate.promise
      else gate.resolve()
      await Promise.resolve()
      return `<html lang="${store.current}">${uiM('password_show')}|${core.i18n.coreM('core_errorTimeout')}</html>`
    })
    expect(await Promise.all([render('en-US'), render('zh-CN'), render('ja-JP')])).toEqual([
      '<html lang="en-US">Show password|Request timeout</html>',
      '<html lang="zh-CN">显示密码|请求超时</html>',
      '<html lang="ja-JP">パスワードを表示|リクエストがタイムアウトしました</html>',
    ])
    expect(core.i18n.getGlobalLocale()).toBe('zh-CN')
  })
})
