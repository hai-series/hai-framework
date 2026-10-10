// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from '../src/lib/components/compounds/index.js'

describe('modal keyboard interaction', () => {
  it('打开时聚焦输入框、Tab 在弹窗内循环、Escape 关闭并恢复焦点', async () => {
    // jsdom 不计算布局，仅为可见控件补充真实浏览器提供的矩形信息。
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => {
      const rect = new DOMRect(0, 0, 100, 30)
      return {
        0: rect,
        length: 1,
        item: () => rect,
        * [Symbol.iterator]() {
          yield rect
        },
      }
    })
    const trigger = document.createElement('button')
    const target = document.createElement('div')
    document.body.append(trigger, target)
    trigger.focus()
    const onclose = vi.fn()
    const component = mount(Modal, {
      target,
      props: {
        open: true,
        title: 'Edit account',
        onclose,
        children: createRawSnippet(() => ({ render: () => '<div><input aria-label="Account" /><button>Save</button></div>' })),
      },
    })
    try {
      flushSync()
      const dialog = target.querySelector<HTMLElement>('[role="dialog"]')!
      const input = dialog.querySelector('input')!
      const buttons = dialog.querySelectorAll('button')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain('Edit account')
      expect(document.activeElement).toBe(input)
      buttons[1]!.focus()
      buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(buttons[0])
      buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(buttons[1])
      buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      flushSync()
      expect(onclose).toHaveBeenCalledTimes(1)
      expect(target.querySelector('.hai-modal')?.getAttribute('aria-hidden')).toBe('true')
      expect(document.activeElement).toBe(trigger)
    }
    finally {
      await unmount(component)
      trigger.remove()
      target.remove()
      rects.mockRestore()
    }
  })

  it('无控件时聚焦弹窗，禁用 Escape 的弹窗保持打开', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onclose = vi.fn()
    const component = mount(Modal, { target, props: { open: true, showClose: false, closeOnEscape: false, onclose } })
    try {
      flushSync()
      const dialog = target.querySelector<HTMLElement>('[role="dialog"]')!
      expect(dialog.getAttribute('aria-label')).toBeTruthy()
      expect(document.activeElement).toBe(dialog)
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      dialog.dispatchEvent(tab)
      expect(tab.defaultPrevented).toBe(true)
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(onclose).not.toHaveBeenCalled()
      expect(target.querySelector('.hai-modal')?.getAttribute('aria-hidden')).toBeNull()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
