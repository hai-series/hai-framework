// @vitest-environment jsdom
import type { FeedbackAnnotation, FeedbackFormData, FeedbackListQuery, FeedbackReportView, FeedbackStatusChange } from '../src/lib/components/scenes/app/index.js'
import { flushSync, mount, unmount } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FeedbackDetail from '../src/lib/components/scenes/app/FeedbackDetail.svelte'
import FeedbackForm from '../src/lib/components/scenes/app/FeedbackForm.svelte'
import FeedbackList from '../src/lib/components/scenes/app/FeedbackList.svelte'
import FeedbackModal from '../src/lib/components/scenes/app/FeedbackModal.svelte'
import { setUILocale } from '../src/lib/messages.js'
import FeedbackFilesHarness from './fixtures/FeedbackFilesHarness.svelte'

beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
}))
afterEach(() => {
  setUILocale('zh-CN')
  vi.unstubAllGlobals()
})

function button(target: HTMLElement, name: string): HTMLButtonElement {
  const found = [...target.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name)
  expect(found, `Expected button: ${name}`).toBeDefined()
  return found!
}

function field(target: HTMLElement, value: string) {
  const control = target.querySelector('textarea')!
  control.value = value
  control.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

const report: FeedbackReportView = {
  id: 'feedback-one',
  number: 'FB-123',
  appId: 'example',
  appVersion: '1.0',
  userId: 'u1',
  description: 'A problem',
  status: 'pending',
  collectionStatus: 'partial',
  notificationStatus: 'failed',
  createdAt: 1,
  updatedAt: 1,
  version: 7,
  evidenceRevision: 2,
}

describe('feedback collection', () => {
  it.each([['初始', false], ['响应式更新后', true]] as const)('公开data属性在%s仅挂载于Modal宿主，不重复落在Form', async (_phase, update) => {
    const target = document.createElement('div')
    document.body.append(target)
    const attributes = new SvelteMap([['tracking', 'feedback-initial']])
    const component = mount(FeedbackModal, { target, props: {
      'open': true,
      'data-testid': 'public-feedback-entry',
      get 'data-tracking'() { return attributes.get('tracking') },
    } })
    try {
      flushSync()
      if (update) {
        attributes.set('tracking', 'feedback-updated')
        flushSync()
      }
      const host = target.querySelector<HTMLElement>('.hai-modal')!
      const form = target.querySelector<HTMLFormElement>('.feedback-form')!
      expect(host.getAttribute('data-tracking')).toBe(update ? 'feedback-updated' : 'feedback-initial')
      expect(host.getAttribute('data-testid')).toBe('public-feedback-entry')
      expect([...target.querySelectorAll('[data-tracking]')]).toEqual([host])
      expect([...target.querySelectorAll('[data-testid="public-feedback-entry"]')]).toEqual([host])
      expect(form.hasAttribute('data-tracking')).toBe(false)
      expect(form.hasAttribute('data-testid')).toBe(false)
      expect(form.getAttribute('data-feedback-ignore')).toBe('true')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('未填写说明也可提交现场反馈', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn(async (_input: FeedbackFormData) => {})
    const component = mount(FeedbackModal, { target, props: { open: true, onsubmit } })
    try {
      flushSync()
      const submit = [...target.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('提交反馈'))!
      submit.click()
      await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledOnce())
      expect(onsubmit.mock.calls[0]?.[0]).toMatchObject({ description: '' })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('受理显示反馈编号和后台收集状态，不误作材料完成，三语可更新', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn(async (_input: FeedbackFormData) => ({ number: 'FB-321', collectionStatus: 'collecting' as const }))
    const component = mount(FeedbackModal, { target, props: { open: true, onsubmit } })
    try {
      flushSync()
      button(target, '提交反馈').click()
      await vi.waitFor(() => expect(target.textContent).toContain('已受理：FB-321'))
      expect(target.textContent).toContain('材料收集中')
      expect(target.querySelector('textarea')).toBeNull()
      setUILocale('en-US')
      flushSync()
      expect(target.textContent).toContain('Accepted: FB-321')
      expect(target.textContent).toContain('Collecting materials')
      setUILocale('ja-JP')
      flushSync()
      expect(target.textContent).toContain('受理しました：FB-321')
      expect(target.textContent).toContain('資料を収集中')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('受理失败保留说明、文件、现场，兜底导出取得当前表单', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn(async (_input: FeedbackFormData) => {
      throw new Error('Service unavailable')
    })
    const onexport = vi.fn(async (_input: FeedbackFormData) => {})
    const file = new File(['evidence'], 'evidence.txt', { type: 'text/plain' })
    const component = mount(FeedbackForm, { target, props: { onsubmit, onexport, evidenceSummary: [{ label: 'Logs', count: 12, status: 'partial', detail: 'Truncated' }] } })
    try {
      flushSync()
      field(target, 'The save button did nothing')
      const upload = target.querySelector<HTMLInputElement>('input[type="file"]')!
      Object.defineProperty(upload, 'files', { value: [file] })
      upload.dispatchEvent(new Event('change', { bubbles: true }))
      flushSync()
      button(target, '提交反馈').click()
      await vi.waitFor(() => expect(target.textContent).toContain('Service unavailable'))
      expect(target.querySelector('textarea')?.value).toBe('The save button did nothing')
      expect(target.textContent).toContain('evidence.txt')
      expect(target.textContent).toContain('Logs · 12')
      expect(target.textContent).toContain('Truncated')
      button(target, '保存本地问题包').click()
      await vi.waitFor(() => expect(onexport).toHaveBeenCalledOnce())
      expect(onexport.mock.calls[0]?.[0]).toMatchObject({ description: 'The save button did nothing', files: [file] })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('提交中重复触发不会重复调用受理动作', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    let finish!: () => void
    const onsubmit = vi.fn((_input: FeedbackFormData) => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const component = mount(FeedbackForm, { target, props: { onsubmit } })
    try {
      flushSync()
      const form = target.querySelector('form')!
      form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }))
      form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }))
      expect(onsubmit).toHaveBeenCalledOnce()
      finish()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('可通过键盘控件选择遮挡区域并调用宿主图像修改，删除截图后不提交其ID', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onannotate = vi.fn(async (_input: FeedbackAnnotation) => {})
    const onsubmit = vi.fn(async (_input: FeedbackFormData) => {})
    const component = mount(FeedbackForm, { target, props: { onannotate, onsubmit, attachments: [{ id: 'screen', name: 'screen.png', mimeType: 'image/png', url: 'blob:screen' }] } })
    try {
      flushSync()
      expect(target.querySelector('img')?.getAttribute('src')).toBe('blob:screen')
      button(target, '遮挡敏感区域').click()
      flushSync()
      button(target, '应用标注').click()
      await vi.waitFor(() => expect(onannotate).toHaveBeenCalledOnce())
      expect(onannotate.mock.calls[0]?.[0]).toEqual({ id: 'screen', mode: 'mask', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } })
      target.querySelector<HTMLButtonElement>('[aria-label="删除 screen.png"]')!.click()
      flushSync()
      expect(target.querySelector('img')).toBeNull()
      await vi.waitFor(() => expect(button(target, '提交反馈').disabled).toBe(false))
      button(target, '提交反馈').click()
      await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledOnce())
      expect(onsubmit.mock.calls[0]?.[0].removedAttachmentIds).toEqual(['screen'])
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('主动添加的图片准备后可预览和遮挡，提交不重复携带已准备文件', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    let finish!: () => void
    const onfileschange = vi.fn((_files: File[]) => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const onannotate = vi.fn(async (_input: FeedbackAnnotation) => {})
    const onsubmit = vi.fn(async (_input: FeedbackFormData) => {})
    const file = new File(['jpeg-fixture'], 'user-image.jpg', { type: 'image/jpeg' })
    const component = mount(FeedbackFilesHarness, { target, props: { onfileschange, onannotate, onsubmit } })
    try {
      flushSync()
      const upload = target.querySelector<HTMLInputElement>('input[type="file"]')!
      Object.defineProperty(upload, 'files', { value: [file] })
      upload.dispatchEvent(new Event('change', { bubbles: true }))
      flushSync()
      expect(onfileschange).toHaveBeenCalledWith([file])
      expect(button(target, '提交反馈').disabled).toBe(true)
      finish()
      await vi.waitFor(() => expect(target.querySelector('img')?.getAttribute('alt')).toBe('user-image.jpg'))
      button(target, '遮挡敏感区域').click()
      flushSync()
      button(target, '应用标注').click()
      await vi.waitFor(() => expect(onannotate).toHaveBeenCalledOnce())
      expect(onannotate.mock.calls[0]?.[0]).toMatchObject({ id: 'file-0', mode: 'mask' })
      await vi.waitFor(() => expect(button(target, '提交反馈').disabled).toBe(false))
      button(target, '提交反馈').click()
      await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledOnce())
      expect(onsubmit.mock.calls[0]?.[0].files).toEqual([])
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('主动文件准备失败保留文件和输入并支持原批次重试', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onfileschange = vi.fn(async (_files: File[]) => {})
      .mockRejectedValueOnce(new Error('Preparation unavailable'))
    const onannotate = vi.fn(async (_input: FeedbackAnnotation) => {})
    const onsubmit = vi.fn(async (_input: FeedbackFormData) => {})
    const file = new File(['png-fixture'], 'retry-image.png', { type: 'image/png' })
    const component = mount(FeedbackFilesHarness, { target, props: { onfileschange, onannotate, onsubmit } })
    try {
      flushSync()
      field(target, 'Keep this description')
      const upload = target.querySelector<HTMLInputElement>('input[type="file"]')!
      Object.defineProperty(upload, 'files', { value: [file] })
      upload.dispatchEvent(new Event('change', { bubbles: true }))
      await vi.waitFor(() => expect(target.textContent).toContain('Preparation unavailable'))
      expect(target.textContent).toContain('retry-image.png')
      expect(target.querySelector('textarea')?.value).toBe('Keep this description')
      expect(button(target, '提交反馈').disabled).toBe(true)
      button(target, '重试').click()
      await vi.waitFor(() => expect(target.querySelector('img')?.getAttribute('alt')).toBe('retry-image.png'))
      expect(onfileschange).toHaveBeenCalledTimes(2)
      expect(onfileschange.mock.calls[1]?.[0]).toEqual([file])
      expect(button(target, '提交反馈').disabled).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})

describe('feedback management', () => {
  it('说明为空时表格展示服务端事实摘要', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const serverSummary = 'POST /api/orders failed with HTTP 503'
    const summarizedReport = { ...report, description: '', summary: serverSummary }
    const component = mount(FeedbackList, { target, props: { data: { items: [summarizedReport], total: 1, page: 1, pageSize: 20 } } })
    try {
      flushSync()
      const row = target.querySelector('tbody tr')!
      expect(row.textContent).toContain(serverSummary)
      expect(row.querySelector('[title]')?.getAttribute('title')).toBe(serverSummary)
      expect(row.textContent).not.toContain('无补充说明')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('每页一条在真实选择控件中显示当前值，切换二十条重置页码并发出查询', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onquerychange = vi.fn(async (_input: FeedbackListQuery) => {})
    const component = mount(FeedbackList, { target, props: {
      data: { items: [report], total: 3, page: 3, pageSize: 1 },
      query: { page: 3, pageSize: 1 },
      onquerychange,
    } })
    try {
      flushSync()
      const control = target.querySelector<HTMLInputElement>('input[role="combobox"][id$="-size"]')!
      const nativeSelect = control.closest('.fieldset')!.querySelector<HTMLSelectElement>('select')!
      expect(nativeSelect.value).toBe('1')
      expect(nativeSelect.querySelector('option[value="1"]')?.textContent).toBe('1')
      expect(control.value).toBe('1')
      control.click()
      flushSync()
      const twenty = [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')].find(option => option.textContent?.trim() === '20')
      expect(twenty).toBeDefined()
      twenty!.click()
      await vi.waitFor(() => expect(onquerychange).toHaveBeenCalledOnce())
      expect(onquerychange.mock.calls[0]?.[0]).toMatchObject({ page: 1, pageSize: 20 })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('分页发出服务端查询，处理操作携带乐观版本且展示失败', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onquerychange = vi.fn(async (_input: FeedbackListQuery) => {})
    const onstatus = vi.fn(async (_input: FeedbackStatusChange) => {
      throw new Error('Version conflict')
    })
    const component = mount(FeedbackList, { target, props: { data: { items: [report], total: 3, page: 1, pageSize: 1 }, permissions: { read: true, process: true }, onquerychange, onstatus } })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click()
      await vi.waitFor(() => expect(onquerychange).toHaveBeenCalledOnce())
      expect(onquerychange.mock.calls[0]?.[0].page).toBe(2)
      expect(onquerychange.mock.calls[0]?.[0].pageSize).toBe(1)
      button(target, '标记已处理').click()
      await vi.waitFor(() => expect(onstatus).toHaveBeenCalledOnce())
      expect(onstatus.mock.calls[0]?.[0]).toEqual({ id: report.id, status: 'handled', expectedVersion: 7 })
      await vi.waitFor(() => expect(target.textContent).toContain('Version conflict'))
      expect(target.textContent).toContain('未处理')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('没有读取权限不渲染列表记录或详情材料', async () => {
    for (const detail of [false, true]) {
      const target = document.createElement('div')
      document.body.append(target)
      const component = detail
        ? mount(FeedbackDetail, { target, props: { report, permissions: { read: false } } })
        : mount(FeedbackList, { target, props: { data: { items: [report], total: 1, page: 1, pageSize: 20 }, permissions: { read: false } } })
      try {
        flushSync()
        expect(target.textContent).toContain('您没有查看反馈的权限')
        expect(target.textContent).not.toContain('FB-123')
        expect(target.querySelector('table')).toBeNull()
      }
      finally {
        await unmount(component)
        target.remove()
      }
    }
  })

  it('详情按页查询材料，不执行材料HTML，并允许带版本撤销处理', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onevidencequery = vi.fn(async (_input: { page: number, pageSize: number, kind?: string }) => {})
    const onstatus = vi.fn(async (_input: FeedbackStatusChange) => {})
    const component = mount(FeedbackDetail, { target, props: {
      report: { ...report, status: 'handled' },
      permissions: { read: true, reopen: true },
      onstatus,
      onevidencequery,
      evidence: { items: [{ id: 'e1', source: 'browser', sequence: 1, kind: 'log', timestamp: 1, data: { message: '<img src=x onerror=alert(1)>' }, missingReason: 'buffer-expired' }], total: 1, page: 1, pageSize: 20 },
    } })
    try {
      flushSync()
      button(target, '日志与请求').click()
      await vi.waitFor(() => expect(onevidencequery).toHaveBeenCalledOnce())
      expect(target.textContent).toContain('<img src=x onerror=alert(1)>')
      expect(target.querySelector('img')).toBeNull()
      expect(target.textContent).toContain('buffer-expired')
      button(target, '处理与投递').click()
      flushSync()
      await vi.waitFor(() => expect(button(target, '撤销处理').disabled).toBe(false))
      button(target, '撤销处理').click()
      await vi.waitFor(() => expect(onstatus).toHaveBeenCalledOnce())
      expect(onstatus.mock.calls[0]?.[0]).toMatchObject({ id: report.id, status: 'pending', expectedVersion: 7 })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
