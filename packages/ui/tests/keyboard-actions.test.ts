// @vitest-environment jsdom
import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import Confirm from '../src/lib/components/compounds/Confirm.svelte'
import Button from '../src/lib/components/primitives/Button.svelte'
import ThemeSelector from '../src/lib/components/scenes/app/ThemeSelector.svelte'
import CrudFilterBar from '../src/lib/components/scenes/crud/CrudFilterBar.svelte'

afterEach(() => vi.useRealTimers())

it.each(['submit', 'button', 'reset'] as const)('%s 按钮仅在原生提交时提示 Enter', async (type) => {
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(Button, { target, props: { type, submitHint: true } })
  try {
    flushSync()
    expect(target.querySelector('button')?.getAttribute('aria-keyshortcuts')).toBe(type === 'submit' ? 'Enter' : null)
    expect(target.querySelector('kbd') !== null).toBe(type === 'submit')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('搜索 Enter 立即查询一次，取消防抖；输入法确认不触发查询', async () => {
  vi.useFakeTimers()
  const target = document.body.appendChild(document.createElement('div'))
  const onsearch = vi.fn()
  const component = mount(CrudFilterBar, { target, props: { searchValue: 'needle', onsearch } })
  try {
    flushSync()
    const input = target.querySelector('input')!
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
    expect(onsearch).not.toHaveBeenCalled()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onsearch).toHaveBeenCalledExactlyOnceWith('needle')
    vi.advanceTimersByTime(500)
    expect(onsearch).toHaveBeenCalledTimes(1)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('原生取消事件同步关闭确认状态，并调用取消回调', async () => {
  // jsdom 缺少原生 dialog API；本用例只验证 cancel 的状态与回调，焦点另做浏览器验收。
  const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) {
    this.open = true
  } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) {
    this.open = false
  } })
  const target = document.body.appendChild(document.createElement('div'))
  const oncancel = vi.fn()
  const component = mount(Confirm, { target, props: { open: true, oncancel } })
  try {
    flushSync()
    const dialog = target.querySelector('dialog')!
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    flushSync()
    expect(oncancel).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(false)
  }
  finally {
    await unmount(component)
    target.remove()
    for (const [name, descriptor] of [['showModal', show], ['close', close]] as const) {
      if (descriptor)
        Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
    }
  }
})

it('主题可用方向键导航，Esc 收起并恢复触发按钮焦点', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(ThemeSelector, { target })
  try {
    flushSync()
    const trigger = target.querySelector('button')!
    trigger.focus()
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await tick()
    await vi.waitFor(() => expect(document.activeElement).not.toBe(trigger))
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    flushSync()
    expect(document.activeElement).toBe(trigger)
    expect(target.querySelectorAll('button')).toHaveLength(1)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
