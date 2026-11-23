// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import { ui } from '../src/lib/ui-toast.js'
import ToastFeedbackHarness from './fixtures/ToastFeedbackHarness.svelte'

afterEach(() => {
  ui.toast.clear()
  vi.useRealTimers()
})

it('父子组件只提示一次，关闭和队列变化不会重复弹出，重新提交相同错误仍可提示', async () => {
  vi.useFakeTimers()
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(ToastFeedbackHarness, { target })
  let mounted = true
  const click = (id: string) => {
    target.querySelector<HTMLButtonElement>(`[data-testid=${id}]`)!.click()
    flushSync()
  }
  try {
    flushSync()
    expect(ui.toast.items).toHaveLength(0)
    click('fail')
    expect(ui.toast.items).toHaveLength(1)
    expect(ui.toast.items[0]).toMatchObject({ message: '安全操作失败', variant: 'error' })
    expect(target.querySelector('.alert-error')).toBeNull()
    ui.toast.remove(ui.toast.items[0].id)
    flushSync()
    click('unrelated')
    expect(ui.toast.items).toHaveLength(0)
    click('reset')
    click('fail')
    expect(ui.toast.items).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    flushSync()
    expect(ui.toast.items).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    click('reset')
    click('fail')
    await unmount(component)
    mounted = false
    expect(ui.toast.items).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(ui.toast.items).toHaveLength(0)
  }
  finally {
    if (mounted)
      await unmount(component)
    target.remove()
  }
})
