// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { Select } from '../src/lib/components/primitives/index.js'

function keydown(input: HTMLInputElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  flushSync()
  return event
}

describe('下拉选择的键盘操作', () => {
  const options = [
    { value: 'ada', label: 'Ada Lovelace' },
    { value: 'grace', label: 'Grace Hopper', disabled: true },
    { value: 'katherine', label: 'Katherine Johnson' },
  ]

  it('用方向键跨过禁用项，并提交当前高亮选项', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const onChange = vi.fn()
    const component = mount(Select, {
      target,
      props: { options, onchange: onChange },
    })
    try {
      flushSync()
      const input = target.querySelector<HTMLInputElement>('[role="combobox"]')!
      input.focus()
      flushSync()
      keydown(input, 'ArrowDown')
      keydown(input, 'ArrowDown')
      expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveProperty('textContent', 'Katherine Johnson')
      keydown(input, 'Enter')
      expect(onChange).toHaveBeenCalledExactlyOnceWith('katherine')
      expect(input.value).toBe('Katherine Johnson')
      expect(input.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(input)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('允许筛选文本输入空格，并在 Escape 关闭后保留焦点', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const component = mount(Select, {
      target,
      props: { options, filterable: true },
    })
    try {
      flushSync()
      const input = target.querySelector<HTMLInputElement>('[role="combobox"]')!
      input.focus()
      flushSync()
      expect(keydown(input, ' ').defaultPrevented).toBe(false)
      input.value = 'Katherine Jo'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      expect(document.querySelectorAll('[role="option"]')).toHaveLength(1)
      expect(keydown(input, 'Escape').defaultPrevented).toBe(true)
      expect(input.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(input)
      expect(keydown(input, 'Escape').defaultPrevented).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
