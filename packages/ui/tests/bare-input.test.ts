// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { BareInput } from '../src/lib/components/primitives/index.js'

describe('bareInput file selection', () => {
  it('文件选择后透传 files，清空选择后不把 fakepath 写回文件控件', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    const onchange = vi.fn((event: Event & { currentTarget: HTMLInputElement }) => {
      expect(event.currentTarget.files?.[0]).toBe(file)
      event.currentTarget.value = ''
    })
    const component = mount(BareInput, { target, props: { type: 'file', onchange } })
    try {
      flushSync()
      const input = target.querySelector('input')!
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      let selectedPath = 'C:\\fakepath\\avatar.png'
      // 模拟浏览器选中文件后只允许业务清空路径的安全规则。
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => selectedPath,
        set: (value: string) => {
          if (value !== '')
            throw new DOMException('File input cannot accept a nonempty programmatic value', 'InvalidStateError')
          selectedPath = value
        },
      })
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      expect(() => flushSync()).not.toThrow()
      expect(onchange).toHaveBeenCalledTimes(1)
      expect(input.value).toBe('')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
