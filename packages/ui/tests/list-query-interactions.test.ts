// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TableToolbar from '../src/lib/components/compounds/TableToolbar.svelte'
import { CrudPage, ui } from '../src/lib/components/scenes/crud/index.js'

const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false
    },
  })
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
  const component = mount(TableToolbar, {
    target,
    props: {
      onsearch,
      filterFields: [
        { id: 'appId', label: 'Application', type: 'text' },
      ],
    },
  })
  try {
    flushSync()
    const form = target.querySelector('form')!
    expect(form).not.toBeNull()
    expect([
      ...target.querySelectorAll('button'),
    ].some(button => button.textContent?.includes('重置'))).toBe(true)
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

it('cRUD 默认复用卡片内查询栏，服务端排序与翻页只使用已提交条件', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const navigate = vi.fn()
  const crud = ui.defineCrud({
    name: 'records',
    label: 'Records',
    fields: [
      {
        id: 'name',
        label: 'Name',
        type: 'text',
        inList: true,
        filterable: true,
      },
    ],
    api: {
      list: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    },
  })
  const component = mount(CrudPage, {
    target,
    props: {
      crud,
      sortableColumns: [
        { key: 'name', label: 'Name' },
      ],
      data: {
        items: [],
        total: 60,
        page: 2,
        pageSize: 20,
        filters: { search: 'applied' },
      },
      nav: { pathname: '/records', navigate },
    },
  })
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

it('cRUD 分页选择 20 条时，客户端控制器提交并显示 20 条', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const list = vi.fn(async (params: Record<string, unknown>) => ({
    items: [],
    total: 60,
    page: Number(params.page),
    pageSize: Number(params.pageSize),
  }))
  const crud = ui.defineCrud({
    name: 'records',
    label: 'Records',
    fields: [
      { id: 'name', label: 'Name', inList: true },
    ],
    api: { list },
  })
  const controller = ui.createCrudController(crud, { syncUrl: false, autoLoad: false })
  await controller.load()
  expect(controller.data.pageSize).toBe(10)
  const component = mount(CrudPage, {
    target,
    props: { crud, data: controller.data, nav: controller.nav },
  })
  try {
    flushSync()
    const sizeControl = target.querySelector<HTMLInputElement>('[role="combobox"][id$="-size"]')!
    flushSync(() => sizeControl.focus())
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find(item => item.textContent?.trim() === '20')!
    flushSync(() => option.click())
    await vi.waitFor(() => expect(controller.data.pageSize).toBe(20))
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }), expect.anything())
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
