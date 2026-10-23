// @vitest-environment jsdom
import type { ComponentProps } from 'svelte'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable, Pagination, TableToolbar, Tabs } from '../src/lib/components/compounds/index.js'
import { setUILocale } from '../src/lib/messages.js'
import PaginationControlHarness from './fixtures/PaginationControlHarness.svelte'

afterEach(() => {
  setUILocale('zh-CN')
  vi.unstubAllGlobals()
})

function host() {
  const target = document.createElement('div')
  document.body.append(target)
  return target
}

describe('shared interaction accessibility', () => {
  it('页签默认跳过禁用项，方向键、Home/End 和单一 Tab 入口一致', async () => {
    const target = host()
    const onchange = vi.fn()
    const component = mount(Tabs, { target, props: {
      items: [{ key: 'disabled', label: 'Disabled', disabled: true }, { key: 'first', label: 'First' }, { key: 'last', label: 'Last' }],
      onchange,
    } })
    try {
      flushSync()
      const tabs = [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      expect(tabs[0].getAttribute('aria-selected')).toBe('false')
      expect(tabs[1].getAttribute('aria-selected')).toBe('true')
      expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0, -1])
      tabs[1].focus()
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      flushSync()
      expect(document.activeElement).toBe(tabs[2])
      expect(tabs[2].getAttribute('aria-selected')).toBe('true')
      tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      flushSync()
      expect(document.activeElement).toBe(tabs[1])
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
      flushSync()
      expect(document.activeElement).toBe(tabs[2])
      tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
      flushSync()
      expect(document.activeElement).toBe(tabs[1])
      expect(onchange).toHaveBeenLastCalledWith('first')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('分页辅助标签使用当前语言，外部页码改变时跳页输入跟随', async () => {
    const target = host()
    const component = mount(PaginationControlHarness, { target })
    try {
      flushSync()
      expect(target.querySelector('[aria-label="下一页"]')).not.toBeNull()
      const jumper = target.querySelector<HTMLInputElement>('input[type="number"]')!
      expect(jumper.labels?.[0]?.textContent).toBe('跳转到页')
      target.querySelector<HTMLButtonElement>('button')!.click()
      flushSync()
      expect(jumper.value).toBe('4')
      setUILocale('en-US')
      flushSync()
      expect(target.querySelector('[aria-label="Next page"]')).not.toBeNull()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('表格排序状态、加载状态和行键盘操作可被感知', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const target = host()
    const onrowclick = vi.fn()
    const Table = DataTable<{ id: string, name: string }>
    const props: ComponentProps<typeof Table> = {
      keyField: 'id',
      columns: [{ key: 'name', label: 'Name', sortable: true }],
      data: [{ id: '1', name: 'Beta' }, { id: '2', name: 'Alpha' }],
      onrowclick,
    }
    const component = mount(Table, { target, props })
    try {
      flushSync()
      const header = target.querySelector('th')!
      expect(header.getAttribute('aria-sort')).toBe('none')
      header.querySelector('button')!.click()
      flushSync()
      expect(header.getAttribute('aria-sort')).toBe('ascending')
      const row = target.querySelector<HTMLTableRowElement>('tbody tr')!
      expect(row.tabIndex).toBe(0)
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      flushSync()
      expect(onrowclick).toHaveBeenCalledWith({ id: '2', name: 'Alpha' })
      expect(target.querySelector('table')!.getAttribute('aria-busy')).toBe('false')
    }
    finally {
      await unmount(component)
      target.remove()
    }
    const loading = mount(Table, { target, props: { keyField: 'id', columns: props.columns, data: [], loading: true } })
    try {
      flushSync()
      expect(target.querySelector('table')!.getAttribute('aria-busy')).toBe('true')
      expect(target.querySelector('[role="status"]')?.textContent?.trim()).toBeTruthy()
    }
    finally {
      await unmount(loading)
      target.remove()
    }
  })

  it('筛选打开后聚焦控件，Escape 返回触发点，视图切换反映当前状态', async () => {
    const target = host()
    const component = mount(TableToolbar, { target, props: {
      filterFields: [{ id: 'active', label: '状态', type: 'boolean' }],
      showViewSwitch: true,
    } })
    try {
      flushSync()
      const trigger = target.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!
      trigger.focus()
      trigger.click()
      flushSync()
      const dialog = target.querySelector('[role="dialog"]')!
      expect(dialog.contains(document.activeElement)).toBe(true)
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      flushSync()
      expect(target.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
      const viewButtons = target.querySelectorAll<HTMLButtonElement>('[role="group"] button')
      expect(viewButtons[0].getAttribute('aria-pressed')).toBe('true')
      viewButtons[1].click()
      flushSync()
      expect(viewButtons[1].getAttribute('aria-pressed')).toBe('true')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('英文分页保持原有导航行为', async () => {
    setUILocale('en-US')
    const target = host()
    const onchange = vi.fn()
    const component = mount(Pagination, { target, props: { page: 1, total: 50, onchange } })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('[aria-label="Next page"]')!.click()
      flushSync()
      expect(onchange).toHaveBeenCalledWith(2)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
