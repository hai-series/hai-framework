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

export function readUILocale(): string {
  subscribe()
  return core.i18n.getGlobalLocale()
}

export function changeUILocale(locale: string): void {
  core.i18n.setGlobalLocale(locale)
  // 宿主可能在 $effect 中同步语言，setter 不能反向订阅自身状态。
  untrack(() => {
    notifyLocaleChange?.()
  })
}
