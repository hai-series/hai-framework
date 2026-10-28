// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TableToolbar from '../src/lib/components/compounds/TableToolbar.svelte'
import FeedbackList from '../src/lib/components/scenes/app/FeedbackList.svelte'
import { CrudPage, defineCrud } from '../src/lib/components/scenes/crud/index.js'

const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {
    this.open = false
  } })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})

afterEach(() => {
  if (closeDescriptor)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor)
  else
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function input(element: HTMLInputElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

it('通用工具栏常驻查询和重置，展开筛选后一次提交，不自动查询', async () => {
  vi.useFakeTimers()
  const target = document.body.appendChild(document.createElement('div'))
  const onsearch = vi.fn()
  const component = mount(TableToolbar, { target, props: { onsearch, filterFields: [{ id: 'appId', label: 'Application', type: 'text' }] } })
  try {
    flushSync()
    const form = target.querySelector('form')!
    expect(form).not.toBeNull()
    expect([...target.querySelectorAll('button')].some(button => button.textContent?.includes('重置'))).toBe(true)
    input(target.querySelector('input')!, 'needle')
    target.querySelector<HTMLButtonElement>('[aria-controls]')!.click()
    flushSync()
    input(target.querySelector<HTMLInputElement>('[placeholder="Application"]')!, 'web')
    vi.advanceTimersByTime(500)
    expect(onsearch).not.toHaveBeenCalled()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(onsearch).toHaveBeenCalledExactlyOnceWith('needle')
    expect(target.querySelector('[role="dialog"]')).toBeNull()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('反馈查询原子提交搜索与筛选，翻页和排序不带入未提交草稿，重置恢复默认条件', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onquerychange = vi.fn()
  const component = mount(FeedbackList, { target, props: { data: { items: [], total: 60, page: 2, pageSize: 20 }, query: { page: 2, pageSize: 20, search: 'applied', appId: 'old' }, onquerychange } })
  try {
    flushSync()
    input(target.querySelector('input')!, 'draft')
    target.querySelector<HTMLButtonElement>('[aria-controls]')!.click()
    flushSync()
    input(target.querySelector<HTMLInputElement>('[placeholder="应用"]')!, 'new')
    expect(onquerychange).not.toHaveBeenCalled()
    target.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click()
    flushSync()
    expect(onquerychange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, search: 'applied', appId: 'old' }))
    input(target.querySelector('input')!, 'draft')
    input(target.querySelector<HTMLInputElement>('[placeholder="应用"]')!, 'new')
    target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    flushSync()
    expect(onquerychange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'draft', appId: 'new' }))
    const header = [...target.querySelectorAll('th')].find(cell => cell.textContent?.includes('提交时间'))!
    header.querySelector('button')!.click()
    flushSync()
    expect(onquerychange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'draft', appId: 'new', sortDirection: 'asc' }))
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    ;[...target.querySelectorAll('button')].find(button => button.textContent?.trim() === '重置')!.click()
    flushSync()
    expect(onquerychange).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('cRUD 默认复用卡片内查询栏，服务端排序与翻页只使用已提交条件', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const navigate = vi.fn()
  const crud = defineCrud({ name: 'records', label: 'Records', fields: [{ id: 'name', label: 'Name', type: 'text', inList: true, filterable: true }], api: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }) } })
  const component = mount(CrudPage, { target, props: { crud, sortableColumns: [{ key: 'name', label: 'Name' }], data: { items: [], total: 60, page: 2, pageSize: 20, filters: { search: 'applied' } }, nav: { pathname: '/records', navigate } } })
  try {
    flushSync()
    const form = target.querySelector('form')!
    expect(form).not.toBeNull()
    expect(form.closest('.card')?.querySelector('table')).not.toBeNull()
    input(target.querySelector('input')!, 'draft')
    target.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click()
    flushSync()
    expect(navigate).toHaveBeenLastCalledWith(expect.stringContaining('search=applied'))
    target.querySelector('th button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flushSync()
    expect(navigate).toHaveBeenLastCalledWith(expect.stringContaining('search=applied'))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(navigate).toHaveBeenLastCalledWith(expect.stringContaining('search=draft'))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
