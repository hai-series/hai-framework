// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ToastContainer from '../src/lib/components/compounds/ToastContainer.svelte'
import { toast } from '../src/lib/toast.svelte.js'

afterEach(() => {
  toast.clear()
  vi.useRealTimers()
})

describe('浮动操作提示', () => {
  it('区分提示、成功、警告和错误，并为错误提供及时的辅助播报', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(ToastContainer, { target })
    try {
      for (const variant of ['info', 'success', 'warning', 'error'] as const) {
        const id = toast.add({ message: variant, variant, duration: 0 })
        flushSync()
        const notification = document.querySelector<HTMLElement>('.hai-toast-item')!
        expect(notification.dataset.variant).toBe(variant)
        expect(notification.getAttribute('role')).toBe(variant === 'error' ? 'alert' : 'status')
        expect(notification.getAttribute('aria-live')).toBe(variant === 'error' ? 'assertive' : 'polite')
        toast.remove(id)
        flushSync()
      }
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('只展示队首，手工关闭后展示下一条且支持独立方位与自动关闭', async () => {
    vi.useFakeTimers()
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(ToastContainer, { target })
    try {
      toast.success('保存成功', 1000)
      toast.add({ message: '复制成功', position: 'bottom-center', duration: 2000 })
      flushSync()
      expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
      expect(document.querySelector('[role="status"]')?.textContent).toContain('保存成功')
      expect(document.querySelector('[data-position="bottom-right"]')).not.toBeNull()
      expect(target.textContent).toBe('')
      document.querySelector<HTMLButtonElement>('.hai-toast-layer button')!.click()
      flushSync()
      expect(document.querySelector('[role="status"]')?.textContent).toContain('复制成功')
      expect(document.querySelector('[data-position="bottom-center"]')).not.toBeNull()
      vi.advanceTimersByTime(1999)
      flushSync()
      expect(document.querySelector('[role="status"]')).not.toBeNull()
      vi.advanceTimersByTime(1)
      flushSync()
      expect(document.querySelector('[role="status"]')).toBeNull()
      for (const position of ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const) {
        const id = toast.add({ 'message': '配置提示', position, 'duration': 0, 'dismissible': false, 'data-testid': 'configured-toast' })
        flushSync()
        expect(document.querySelector('.hai-toast-position')?.getAttribute('data-position')).toBe(position)
        expect(document.querySelector('[data-testid="configured-toast"]')).not.toBeNull()
        expect(document.querySelector('.hai-toast-layer button')).toBeNull()
        toast.remove(id)
      }
    }
    finally {
      await unmount(component)
      target.remove()
    }
    expect(document.querySelector('.hai-toast-layer')).toBeNull()
  })
})
