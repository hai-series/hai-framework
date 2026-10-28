// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import MessageContainer from '../src/lib/components/compounds/MessageContainer.svelte'
import { message } from '../src/lib/message.svelte.js'
import { toast } from '../src/lib/toast.svelte.js'

afterEach(() => {
  toast.clear()
  vi.useRealTimers()
})

it('消息入口和 Toast 共用队列、语义样式、关闭及展示开始计时', async () => {
  vi.useFakeTimers()
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(MessageContainer, { target })
  try {
    const first = message.error('操作失败', 0)
    toast.success('操作成功', 1000)
    flushSync()
    expect(message.items).toHaveLength(2)
    expect(message.items[0]).toMatchObject({ id: first, type: 'error', closable: true })
    expect(document.querySelectorAll('.hai-toast-item')).toHaveLength(1)
    expect(document.querySelector('.hai-toast-item')?.getAttribute('role')).toBe('alert')
    vi.advanceTimersByTime(5000)
    expect(message.items).toHaveLength(2)
    document.querySelector<HTMLButtonElement>('.hai-toast-layer button')!.click()
    flushSync()
    expect(document.querySelector('.hai-toast-item')?.textContent).toContain('操作成功')
    vi.advanceTimersByTime(1000)
    flushSync()
    expect(message.items).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
