// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Popover } from '../src/lib/components/compounds/index.js'

const children = createRawSnippet(() => ({ render: () => '<span>弹出内容</span>' }))

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(cb, 0, 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function host() {
  const target = document.createElement('div')
  document.body.append(target)
  return target
}

describe('popover', () => {
  it('默认 portal 到 body，点击触发器开关', () => {
    const component = mount(Popover, { target: host(), props: { children } })
    flushSync()
    const trigger = document.querySelector('[role="group"] > [role="button"]') as HTMLElement

    trigger.click()
    flushSync()
    const dialog = document.querySelector('body > [role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.parentElement).toBe(document.body)
    expect(dialog.querySelector('.border-8')).not.toBeNull()

    trigger.click()
    flushSync()
    expect(document.querySelector('body > [role="dialog"]')).toBeNull()

    unmount(component)
  })

  it('portal=false 时保留在触发器容器内', () => {
    const component = mount(Popover, { target: host(), props: { children, portal: false } })
    flushSync()
    ;(document.querySelector('[role="group"] > [role="button"]') as HTMLElement).click()
    flushSync()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.parentElement?.getAttribute('role')).toBe('group')

    unmount(component)
  })

  it('hover 打开，移入内容不关闭，移出后延迟关闭', () => {
    vi.useFakeTimers()
    const component = mount(Popover, { target: host(), props: { children, trigger: 'hover' } })
    flushSync()
    const group = document.querySelector('[role="group"]') as HTMLElement

    group.dispatchEvent(new MouseEvent('mouseenter'))
    flushSync()
    expect(document.querySelector('body > [role="dialog"]')).not.toBeNull()

    group.dispatchEvent(new MouseEvent('mouseleave'))
    const dialog = document.querySelector('body > [role="dialog"]') as HTMLElement
    dialog.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(300)
    flushSync()
    expect(document.querySelector('body > [role="dialog"]')).not.toBeNull()

    dialog.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(200)
    flushSync()
    expect(document.querySelector('body > [role="dialog"]')).toBeNull()

    unmount(component)
  })

  it('点击外部关闭', () => {
    const component = mount(Popover, { target: host(), props: { children } })
    flushSync()
    ;(document.querySelector('[role="group"] > [role="button"]') as HTMLElement).click()
    flushSync()
    expect(document.querySelector('body > [role="dialog"]')).not.toBeNull()

    document.body.click()
    flushSync()
    expect(document.querySelector('body > [role="dialog"]')).toBeNull()

    unmount(component)
  })
})
