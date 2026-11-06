// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it } from 'vitest'
import { Checkbox, Radio } from '../src/lib/components/primitives/index.js'

describe('selection controls default color', () => {
  it('radio 默认使用主题主色', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(Radio, {
      target,
      props: {
        options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        value: 'a',
      },
    })
    try {
      flushSync()
      const inputs = target.querySelectorAll('input[type=radio]')
      expect(inputs).toHaveLength(2)
      for (const input of inputs)
        expect(input.classList.contains('radio-primary')).toBe(true)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('checkbox 默认使用主题主色', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(Checkbox, { target, props: { checked: true, label: 'A' } })
    try {
      flushSync()
      const input = target.querySelector('input[type=checkbox]')!
      expect(input.classList.contains('checkbox-primary')).toBe(true)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('checkbox 显式颜色类名优先于默认主色', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(Checkbox, { target, props: { checked: true, label: 'A', class: 'checkbox-success' } })
    try {
      flushSync()
      const input = target.querySelector('input[type=checkbox]')!
      expect(input.classList.contains('checkbox-success')).toBe(true)
      expect(input.classList.contains('checkbox-primary')).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
