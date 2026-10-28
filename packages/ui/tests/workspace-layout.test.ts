// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CrudFilterBar } from '../src/lib/components/scenes/crud/index.js'
import { setUILocale } from '../src/lib/messages.js'
import FilterBarHarness from './fixtures/FilterBarHarness.svelte'
import WorkspaceLayoutHarness from './fixtures/WorkspaceLayoutHarness.svelte'

const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  // jsdom 尚未提供原生 dialog.close；本套件验证标题与工具栏，不验证弹窗宿主。
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  if (closeDescriptor)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  setUILocale('zh-CN')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(['header', 'settings'] as const)('%s 导航保留单一页面标题，说明及操作保留，导航变化后独立标题恢复', async (mode) => {
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(WorkspaceLayoutHarness, { target, props: { mode } })
  try {
    flushSync()
    expect([...target.querySelectorAll('h1')].map(element => element.textContent)).toEqual(['Records'])
    expect(target.textContent).toContain('Record details')
    expect([...target.querySelectorAll('button')].some(button => button.textContent === 'Export')).toBe(true)
    target.querySelector<HTMLButtonElement>('button')!.click()
    flushSync()
    expect([...target.querySelectorAll('h1')].map(element => element.textContent)).toEqual(['Other', 'Records'])
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('导航已承载CRUD标题时，未启用搜索也保留新建及自定义操作', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(WorkspaceLayoutHarness, { target, props: { mode: 'crud' } })
  try {
    flushSync()
    expect([...target.querySelectorAll('h1')].map(element => element.textContent)).toEqual(['Records'])
    const buttons = [...target.querySelectorAll('button')].map(button => button.textContent?.trim())
    expect(buttons).toContain('Import')
    expect(buttons.some(label => label?.includes('新建'))).toBe(true)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('筛选收起不卸载或丢值，常驻搜索、重置和已选提示可用', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(FilterBarHarness, { target })
  try {
    flushSync()
    const toggle = target.querySelector<HTMLButtonElement>('[aria-controls]')!
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    const input = target.querySelector<HTMLInputElement>('[aria-label="Advanced"]')!
    expect(toggle.type).toBe('button')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
    expect(input.value).toBe('Active')
    expect(target.querySelector('[aria-label="Search"]')).not.toBeNull()
    toggle.click()
    flushSync()
    expect(panel.hidden).toBe(false)
    input.value = 'Changed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    toggle.click()
    flushSync()
    toggle.click()
    flushSync()
    expect(target.querySelector('[aria-label="Advanced"]')).toBe(input)
    expect(input.value).toBe('Changed')
    toggle.click()
    flushSync()
    const reset = [...target.querySelectorAll('button')].find(button => button.textContent?.trim() === '重置')!
    reset.click()
    flushSync()
    expect(input.value).toBe('')
    setUILocale('en-US')
    flushSync()
    expect(toggle.textContent).toContain('Expand filters')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('搜索草稿输入后等待也不自动查询，显式提交才查询', async () => {
  vi.useFakeTimers()
  const target = document.createElement('div')
  document.body.append(target)
  const onsearch = vi.fn()
  const component = mount(CrudFilterBar, { target, props: { onsearch } })
  try {
    flushSync()
    const input = target.querySelector<HTMLInputElement>('input')!
    input.value = 'Pending search'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    await vi.advanceTimersByTimeAsync(500)
    expect(onsearch).not.toHaveBeenCalled()
    target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(onsearch).toHaveBeenCalledExactlyOnceWith('Pending search')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('声明式筛选默认可收起，已有条件在收起时仍保留', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(CrudFilterBar, { target, props: { filterFields: [{ id: 'name', label: 'Name', type: 'text' }], filterValues: { name: 'Ada' } } })
  try {
    flushSync()
    const toggle = target.querySelector<HTMLButtonElement>('[aria-controls]')
    expect(toggle).not.toBeNull()
    expect(toggle!.getAttribute('aria-expanded')).toBe('false')
    toggle!.click()
    flushSync()
    const input = target.querySelector<HTMLInputElement>('[placeholder="Name"]')!
    expect(input.value).toBe('Ada')
    toggle!.click()
    flushSync()
    expect(input.value).toBe('Ada')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
