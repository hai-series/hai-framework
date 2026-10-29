// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CrudEditPanel, CrudPage, defineCrud } from '../src/lib/components/scenes/crud/index.js'
import { uiM } from '../src/lib/messages.js'
import { toast } from '../src/lib/toast.svelte.js'

const dialogMethods = new Map(['close', 'showModal'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) {
    this.open = false
  } })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) {
    this.open = true
  } })
})
afterEach(() => {
  toast.clear()
  vi.unstubAllGlobals()
  for (const [name, descriptor] of dialogMethods) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else
      Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
})

it.each(['create', 'edit'] as const)('表单 %s 只提交声明的可写字段，保留空值与日期范围且不修改原始记录', async (mode) => {
  const target = document.body.appendChild(document.createElement('div'))
  const formData = { id: 'record', name: 'Updated', active: false, count: 0, note: null, period: '', from: '2026-10-01', until: '2026-10-30', avatar: '/avatar.png', roleNames: ['System administrator'], created_at: 1 }
  const original = structuredClone(formData)
  const onsubmit = vi.fn(async () => {})
  const component = mount(CrudEditPanel, { target, props: {
    open: true,
    mode,
    formData,
    onsubmit,
    fields: [
      { id: 'id', label: 'ID', type: 'text', readonly: true },
      { id: 'name', label: 'Name', type: 'text' },
      { id: 'active', label: 'Active', type: 'boolean' },
      { id: 'count', label: 'Count', type: 'number' },
      { id: 'note', label: 'Note', type: 'text' },
      { id: 'password', label: 'Password', type: 'password' },
      { id: 'period', label: 'Period', type: 'date-range', startKey: 'from', endKey: 'until' },
    ],
  } })
  try {
    flushSync()
    const form = document.querySelector('form')!
    expect(form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))).toBe(false)
    await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledOnce())
    expect(onsubmit).toHaveBeenCalledWith({ ...(mode === 'create' ? { id: 'record' } : {}), name: 'Updated', active: false, count: 0, note: null, period: '', from: '2026-10-01', until: '2026-10-30' })
    expect(formData).toEqual(original)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('cRUD 删除失败没有回调时仍 Toast 提示，保留确认框以重试并显示成功结果', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const remove = vi.fn().mockRejectedValueOnce(new Error('Private SQL details (traceId: delete-request)')).mockResolvedValueOnce(undefined)
  const item = { id: 'record', name: 'Original record' }
  const crud = defineCrud({ name: 'records', label: 'Records', fields: [{ id: 'name', label: 'Name' }], api: { list: async () => ({ items: [item], total: 1, page: 1, pageSize: 20 }), remove } })
  const component = mount(CrudPage, { target, props: { crud, data: { items: [item], total: 1, page: 1, pageSize: 20 }, permissions: { create: false, update: false, delete: true }, nav: { navigate: vi.fn(), refresh: vi.fn() } } })
  try {
    flushSync()
    target.querySelector<HTMLButtonElement>(`[aria-label="${uiM('crud_delete')}"]`)!.click()
    flushSync()
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent?.trim() === uiM('crud_delete'))!
    confirm.click()
    await vi.waitFor(() => expect(toast.items.at(-1)).toMatchObject({ message: uiM('crud_delete_failed'), traceId: 'delete-request' }))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('Private SQL')
    expect(confirm.isConnected).toBe(true)
    expect(confirm.disabled).toBe(false)
    toast.clear()
    confirm.click()
    await vi.waitFor(() => expect(toast.items.at(-1)?.message).toBe(uiM('crud_delete_success')))
    expect(remove).toHaveBeenCalledTimes(2)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
