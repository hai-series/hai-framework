// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ToastContainer from '../src/lib/components/compounds/ToastContainer.svelte'
import { toast } from '../src/lib/toast.svelte.js'

afterEach(() => {
  toast.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('浮动操作提示', () => {
  it('通过 F8 从操作控件进入提示，Escape 返回原控件并只关闭提示', async () => {
    const target = document.createElement('div')
    const trigger = document.createElement('button')
    trigger.textContent = 'Save'
    document.body.append(target, trigger)
    const component = mount(ToastContainer, { target })
    try {
      trigger.focus()
      toast.success('Saved', 0)
      flushSync()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }))
      const dismiss = document.querySelector<HTMLButtonElement>('.hai-toast-layer button')!
      expect(document.activeElement).toBe(dismiss)
      dismiss.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      flushSync()
      expect(toast.items).toHaveLength(0)
      expect(document.activeElement).toBe(trigger)
    }
    finally {
      await unmount(component)
      target.remove()
      trigger.remove()
    }
  })

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

  it('键盘阅读时暂停，非关闭型提示通过 F8 返回后恢复倒计时', async () => {
    vi.useFakeTimers()
    const target = document.createElement('div')
    const trigger = document.createElement('button')
    document.body.append(target, trigger)
    const component = mount(ToastContainer, { target })
    const shortcut = () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }))
      flushSync()
    }
    try {
      trigger.focus()
      toast.add({ message: 'Processing', duration: 1000, dismissible: false })
      flushSync()
      shortcut()
      expect(document.activeElement).toBe(document.querySelector('.hai-toast-item'))
      shortcut()
      expect(document.activeElement).toBe(trigger)
      expect(toast.items).toHaveLength(1)
      shortcut()
      vi.advanceTimersByTime(1000)
      flushSync()
      expect(toast.items).toHaveLength(1)
      shortcut()
      flushSync()
      vi.advanceTimersByTime(1000)
      flushSync()
      expect(document.activeElement).toBe(trigger)
      expect(toast.items).toHaveLength(0)
    }
    finally {
      await unmount(component)
      target.remove()
      trigger.remove()
    }
  })

  it.each([true, false])('默认隐藏编号，展开暂停计时，复制结果如实反馈：success=%s', async (success) => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockImplementation(async () => {
      if (!success)
        throw new Error('Clipboard unavailable')
    })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const target = document.body.appendChild(document.createElement('div'))
    const component = mount(ToastContainer, { target })
    try {
      toast.error('请刷新后重试 (traceId: request-conflict-1)', 2000)
      flushSync()
      const notification = document.querySelector<HTMLElement>('.hai-toast-item')!
      expect(notification.textContent).toContain('请刷新后重试')
      expect(notification.textContent).not.toContain('request-conflict-1')
      const toggle = notification.querySelector<HTMLButtonElement>('[aria-expanded]')!
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      toggle.click()
      flushSync()
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(notification.querySelector('code')?.textContent).toBe('request-conflict-1')
      expect(notification.textContent).toContain('联系客户支持或开发人员')
      vi.advanceTimersByTime(10000)
      expect(toast.items).toHaveLength(1)
      notification.querySelector<HTMLButtonElement>('.hai-toast-details button')!.click()
      await vi.advanceTimersByTimeAsync(0)
      flushSync()
      expect(writeText).toHaveBeenCalledWith('request-conflict-1')
      expect(notification.textContent).toContain(success ? '编号已复制' : '请选中上方编号手动复制')
      expect(document.querySelector('textarea')).toBeNull()
      toggle.click()
      flushSync()
      vi.advanceTimersByTime(2000)
      flushSync()
      expect(toast.items).toHaveLength(0)
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
