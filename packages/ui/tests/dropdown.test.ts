// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dropdown } from '../src/lib/components/compounds/index.js'

const items = [
  { key: 'edit', label: '编辑' },
  { key: 'copy', label: '复制' },
  { key: 'remove', label: '删除', disabled: true },
  { key: 'sep', label: '', divider: true },
]

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }))
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

function menu() {
  return document.querySelector('[role="menu"]')
}

describe('dropdown', () => {
  it('click 打开菜单，选择后关闭并回调', () => {
    const onselect = vi.fn()
    const component = mount(Dropdown, { target: host(), props: { items, onselect } })
    flushSync()

    const trigger = document.querySelector('[aria-haspopup="menu"]') as HTMLElement
    trigger.click()
    flushSync()
    expect(menu()).not.toBeNull()
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1)

    ;(document.querySelectorAll('[role="menuitem"]')[0] as HTMLElement).click()
    flushSync()
    expect(onselect).toHaveBeenCalledWith('edit')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    unmount(component)
  })

  it('禁用项不触发选择', () => {
    const onselect = vi.fn()
    const component = mount(Dropdown, { target: host(), props: { items, onselect } })
    flushSync()
    ;(document.querySelector('[aria-haspopup="menu"]') as HTMLElement).click()
    flushSync()

    const disabled = document.querySelector('[role="menuitem"][data-disabled]') as HTMLElement
    disabled.click()
    flushSync()
    expect(onselect).not.toHaveBeenCalled()

    unmount(component)
  })

  it('manual 保留调用方控制的菜单，并能选择菜单项', () => {
    const onselect = vi.fn()
    const target = host()
    const component = mount(Dropdown, { target, props: { items, onselect, trigger: 'manual', class: 'dropdown-open' } })
    flushSync()

    const dropdown = target.querySelector('.dropdown.dropdown-open')
    const content = dropdown?.querySelector('.dropdown-content')
    expect(content).toBeTruthy()
    dropdown?.querySelector('button')?.click()
    flushSync()
    expect(dropdown?.classList.contains('dropdown-open')).toBe(true)

    const edit = Array.from(content?.querySelectorAll('button') ?? []).find(item => item.textContent?.trim() === '编辑')
    expect(edit).toBeTruthy()
    edit?.click()
    expect(onselect).toHaveBeenCalledWith('edit')

    unmount(component)
  })

  it('hover 延迟打开，离开后关闭', () => {
    vi.useFakeTimers()
    const component = mount(Dropdown, { target: host(), props: { items, trigger: 'hover' } })
    flushSync()

    const wrapper = document.querySelector('div.relative.inline-block') as HTMLElement
    wrapper.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(120)
    flushSync()
    expect(menu()).not.toBeNull()

    wrapper.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(200)
    flushSync()
    const trigger = document.querySelector('[aria-haspopup="menu"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')

    unmount(component)
  })
})
