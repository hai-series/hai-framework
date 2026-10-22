/** UI 语言变更触发组件重新求值；实际语言仍由 core 统一管理。 */
import { core } from '@h-ai/core'
import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

let notifyLocaleChange: (() => void) | undefined
const subscribe = createSubscriber((update) => {
  notifyLocaleChange = update
  return () => {
    notifyLocaleChange = undefined
  }
})

/**
 * 读取请求/浏览器当前 UI 语言，服务端不跨请求修改全局默认值。
 * @returns 当前请求或浏览器的 UI 语言。
 *
 * @example 模块内部上下文
 * ```ts
 * const locale = readUILocale()
 * ```
 */
export function readUILocale(): string {
  subscribe()
  return core.i18n.getGlobalLocale()
}

/**
 * 同步当前浏览器的 UI 语言；SSR 保持请求级隔离。
 * @param locale - 显式语言代码；省略时使用当前上下文。
 * @returns 无返回值；同步浏览器语言，服务端保持请求隔离。
 *
 * @example 模块内部上下文
 * ```ts
 * changeUILocale('en-US')
 * ```
 */
export function changeUILocale(locale: string): void {
  if (typeof window === 'undefined')
    return
  core.i18n.setGlobalLocale(locale)
  // 宿主可能在 $effect 中同步语言，setter 不能反向订阅自身状态。
  untrack(() => {
    notifyLocaleChange?.()
  })
}
