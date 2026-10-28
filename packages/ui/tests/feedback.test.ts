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
import { toast } from '../src/lib/toast.svelte.js'
import FeedbackFilesHarness from './fixtures/FeedbackFilesHarness.svelte'

beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
}))
afterEach(() => {
  toast.clear()
  setUILocale('zh-CN')
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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

it('反馈详情展示 Webhook 失败与尝试次数，独立提供重试入口', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const onretry = vi.fn(async () => {})
  const component = mount(FeedbackDetail, { target, props: { report: { ...report, collectionStatus: 'complete', notificationStatus: 'disabled' }, webhook: { status: 'failed', attempts: 3, lastError: 'hai:feedback:020' }, permissions: { read: true, retry: true }, onretry } })
  try {
    flushSync()
    expect(target.textContent).toContain('Webhook 回调')
    expect(target.textContent).toContain('尝试次数: 3')
    expect(target.textContent).toContain('hai:feedback:020')
    button(target, '重试').click()
    await vi.waitFor(() => expect(onretry).toHaveBeenCalledOnce())
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('业务信息页签单独分页请求 business 证据并安全展示正文', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const onevidencequery = vi.fn(async () => {})
  const component = mount(FeedbackDetail, { target, props: { report, permissions: { read: true }, evidenceQuery: { page: 2, pageSize: 20, requestId: 'previous-request', errorId: 'previous-error' }, evidence: { items: [{ id: 'business', source: 'server:business', sequence: 0, timestamp: 1, kind: 'business', data: { text: '<script>diagnostics</script>' } }], total: 1, page: 1, pageSize: 20 }, onevidencequery } })
  try {
    flushSync()
    button(target, '业务信息').click()
    await vi.waitFor(() => expect(onevidencequery).toHaveBeenCalledWith(expect.objectContaining({ kind: 'business', page: 1, requestId: undefined, errorId: undefined })))
    expect(target.textContent).toContain('<script>diagnostics</script>')
    expect(target.querySelector('script')).toBeNull()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it.each([['环境', 'environment'], ['操作现场', 'interaction']])('从日志筛选切换到%s时清除请求和错误条件', async (label, kind) => {
  const target = document.createElement('div')
  const onevidencequery = vi.fn(async () => {})
  const component = mount(FeedbackDetail, { target, props: { report, permissions: { read: true }, evidenceQuery: { page: 2, pageSize: 20, requestId: 'old-request', errorId: 'old-error' }, onevidencequery } })
  try {
    flushSync()
    button(target, label).click()
    await vi.waitFor(() => expect(onevidencequery).toHaveBeenCalledWith(expect.objectContaining({ page: 1, kind, requestId: undefined, errorId: undefined })))
  }
  finally { await unmount(component) }
})

it.each(['Asia/Shanghai', 'America/New_York'])('日期筛选按 %s 本地日历处理午夜和夏令时', async (timezone) => {
  vi.stubEnv('TZ', timezone)
  const target = document.createElement('div')
  const onquerychange = vi.fn(async (_input: FeedbackListQuery) => {})
  const component = mount(FeedbackList, { target, props: { data: { items: [report], total: 1, page: 1, pageSize: 20 }, query: { page: 1, pageSize: 20, from: new Date(2026, 2, 8).getTime() }, onquerychange } })
  try {
    flushSync()
    target.querySelector<HTMLButtonElement>('[aria-controls]')!.click()
    flushSync()
    const from = target.querySelector<HTMLInputElement>('[aria-label="开始日期"]')!
    const to = target.querySelector<HTMLInputElement>('[aria-label="结束日期"]')!
    expect(from.value).toBe('2026-03-08')
    to.value = '2026-03-08'
    to.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    expect(onquerychange).not.toHaveBeenCalled()
    target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(onquerychange).toHaveBeenCalled())
    expect(onquerychange.mock.calls.at(-1)?.[0]).toMatchObject({ from: new Date(2026, 2, 8).getTime(), to: new Date(2026, 2, 9).getTime() - 1 })
  }
  finally { await unmount(component) }
})

describe('feedback collection', () => {
  it.each([
    { name: '小数', bounds: [10, 20, 200, 100], start: [31, 41], end: [130, 80], rect: { x: 0.105, y: 0.21, width: 0.495, height: 0.39 } },
    { name: '小于百分之一', bounds: [10, 20, 200, 100], start: [30, 40], end: [30.5, 40.5], rect: { x: 0.1, y: 0.2, width: 0.0025, height: 0.005 } },
    { name: '越过边缘反向拖动', bounds: [10, 20, 200, 100], start: [220, 130], end: [0, 0], rect: { x: 0, y: 0, width: 1, height: 1 } },
    { name: '缩放显示', bounds: [10, 20, 50, 25], start: [15, 25], end: [40, 40], rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
  ])('$name框选按实际图片归一化，表单不产生步长错误', async ({ bounds, start, end, rect }) => {
    const target = document.createElement('div')
    document.body.append(target)
    const onannotate = vi.fn(async (_input: FeedbackAnnotation) => {})
    const component = mount(FeedbackForm, { target, props: { onannotate, attachments: [{ id: 'screen', name: 'screen.png', mimeType: 'image/png', url: 'blob:screen' }] } })
    try {
      flushSync()
      button(target, '遮挡敏感区域').click()
      const image = target.querySelector('img')!.parentElement!
      vi.spyOn(target.querySelector('img')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(...bounds))
      image.dispatchEvent(new MouseEvent('pointerdown', { clientX: start[0], clientY: start[1], bubbles: true, cancelable: true }))
      image.dispatchEvent(new MouseEvent('pointermove', { clientX: end[0], clientY: end[1], bubbles: true }))
      image.dispatchEvent(new MouseEvent('pointerup', { clientX: end[0], clientY: end[1], bubbles: true }))
      flushSync()
      button(target, '应用标注').click()
      await vi.waitFor(() => expect(onannotate).toHaveBeenCalledOnce())
      expect(onannotate.mock.calls[0]![0].mode).toBe('mask')
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(onannotate.mock.calls[0]![0].rect[key]).toBeCloseTo(rect[key])
      expect(target.querySelector('form')?.checkValidity()).toBe(true)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('收集材料显示日志和真实环境内容，诊断文本不解释为HTML', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(FeedbackForm, { target, props: { evidence: [
      { id: 'log', source: 'browser:one', sequence: 1, timestamp: 1, kind: 'log', data: { message: '<script>diagnostic()</script>' } },
      { id: 'env', source: 'browser:one', sequence: 2, timestamp: 2, kind: 'environment', data: { viewport: { width: 390, height: 844 }, appVersion: 'actual-build' } },
    ] } })
    try {
      flushSync()
      expect(target.textContent).toContain('收集材料')
      const materials = [...target.querySelectorAll('details')].find(item => item.querySelector('summary')?.textContent === '收集材料')!
      expect(materials.querySelector('pre')).toBeNull()
      for (const item of materials.querySelectorAll('details')) {
        item.open = true
        item.dispatchEvent(new Event('toggle'))
      }
      flushSync()
      expect(materials.textContent).toContain('actual-build')
      expect(materials.textContent).toContain('390')
      expect(materials.textContent).toContain('<script>diagnostic()</script>')
      expect(materials.querySelector('script')).toBeNull()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('补充和替换截图时隐藏弹窗，采集后恢复原输入，取消不调用宿主', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const oncapture = vi.fn(async (_id?: string) => {})
    const component = mount(FeedbackModal, { target, props: { open: true, oncapture, attachments: [{ id: 'screen', name: 'screen.png', mimeType: 'image/png', url: 'blob:screen' }] } })
    try {
      flushSync()
      field(document.body, 'Keep the description')
      button(document.body, '添加页面截图').click()
      flushSync()
      const host = document.body.querySelector<HTMLElement>('.hai-modal')!
      expect(host.style.display).toBe('none')
      button(document.body, '截取当前页面').click()
      await vi.waitFor(() => expect(oncapture).toHaveBeenCalledWith(undefined))
      await vi.waitFor(() => expect(host.style.display).not.toBe('none'))
      expect(document.body.querySelector('textarea')?.value).toBe('Keep the description')
      button(document.body, '重新截图').click()
      flushSync()
      button(document.body, '返回反馈').click()
      flushSync()
      expect(oncapture).toHaveBeenCalledOnce()
      button(document.body, '重新截图').click()
      flushSync()
      button(document.body, '截取当前页面').click()
      await vi.waitFor(() => expect(oncapture).toHaveBeenLastCalledWith('screen'))
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('反馈弹窗脱离粘性模糊顶栏，并在卸载时清理body挂载节点', async () => {
    const header = document.createElement('header')
    header.style.cssText = 'position: sticky; top: 0; backdrop-filter: blur(8px)'
    const target = document.createElement('div')
    header.append(target)
    document.body.append(header)
    const component = mount(FeedbackModal, { target, props: { 'open': true, 'data-testid': 'feedback-in-sticky-header' } })
    let portalRoot: HTMLElement | null = null
    try {
      flushSync()
      const host = document.body.querySelector<HTMLElement>('[data-testid="feedback-in-sticky-header"]')!
      const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
      expect(dialog).not.toBeNull()
      // JSDOM 不计算布局；验证弹窗已脱离创建 fixed 包含块的顶栏，实际边界由浏览器验收。
      expect(header.contains(dialog)).toBe(false)
      portalRoot = host.parentElement
      expect(portalRoot?.parentElement).toBe(document.body)
    }
    finally {
      await unmount(component)
      header.remove()
    }
    expect(document.body.querySelector('[data-testid="feedback-in-sticky-header"]')).toBeNull()
    expect(portalRoot?.isConnected).toBe(false)
  })

  it.each([['初始', false], ['响应式更新后', true]] as const)('公开data属性在%s仅挂载于Modal宿主，不重复落在Form', async (_phase, update) => {
    const target = document.createElement('div')
    document.body.append(target)
    const attributes = new SvelteMap([['tracking', 'feedback-initial']])
    const component = mount(FeedbackModal, { target, props: {
      'open': true,
      'data-testid': 'public-feedback-entry',
      get 'data-tracking'() {
        return attributes.get('tracking')
      },
    } })
    try {
      flushSync()
      if (update) {
        attributes.set('tracking', 'feedback-updated')
        flushSync()
      }
      const host = document.body.querySelector<HTMLElement>('[data-testid="public-feedback-entry"].hai-modal')!
      const form = host.querySelector<HTMLFormElement>('.feedback-form')!
      expect(host.getAttribute('data-tracking')).toBe(update ? 'feedback-updated' : 'feedback-initial')
      expect(host.getAttribute('data-testid')).toBe('public-feedback-entry')
      expect([...document.body.querySelectorAll('[data-tracking]')]).toEqual([host])
      expect([...document.body.querySelectorAll('[data-testid="public-feedback-entry"]')]).toEqual([host])
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
      const submit = [...document.body.querySelectorAll<HTMLButtonElement>('.feedback-form button')].find(button => button.textContent?.includes('提交反馈'))!
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
      const form = document.body.querySelector<HTMLElement>('.feedback-form')!
      button(form, '提交反馈').click()
      await vi.waitFor(() => expect(form.textContent).toContain('已受理：FB-321'))
      expect(form.textContent).toContain('材料收集中')
      expect(form.querySelector('textarea')).toBeNull()
      setUILocale('en-US')
      flushSync()
      expect(form.textContent).toContain('Accepted: FB-321')
      expect(form.textContent).toContain('Collecting materials')
      setUILocale('ja-JP')
      flushSync()
      expect(form.textContent).toContain('受理しました：FB-321')
      expect(form.textContent).toContain('資料を収集中')
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
      await vi.waitFor(() => expect(toast.items.at(-1)?.message).toContain('提交失败，请重试 (traceId:'))
      expect(target.querySelector('textarea')?.value).toBe('The save button did nothing')
      expect(target.textContent).toContain('evidence.txt')
      expect(target.textContent).toContain('Logs · 12')
      expect(target.textContent).toContain('Truncated')
      button(target, '保存反馈到本地').click()
      await vi.waitFor(() => expect(onexport).toHaveBeenCalledOnce())
      expect(onexport.mock.calls[0]?.[0]).toMatchObject({ description: 'The save button did nothing', files: [file] })
      await vi.waitFor(() => expect(toast.items.at(-1)?.message).toBe('已开始下载反馈文件。'))
      expect(target.textContent).not.toContain('已开始下载反馈文件。')
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
      expect(target.querySelector('input[type="number"]')).toBeNull()
      button(target, '遮挡敏感区域').click()
      flushSync()
      button(target, '应用标注').click()
      await vi.waitFor(() => expect(onannotate).toHaveBeenCalledOnce())
      expect(onannotate.mock.calls[0]?.[0]).toEqual({ id: 'screen', mode: 'mask', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } })
      await vi.waitFor(() => expect(target.querySelector<HTMLButtonElement>('[aria-label="删除 screen.png"]')!.disabled).toBe(false))
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
      await vi.waitFor(() => expect(toast.items.at(-1)?.message).toContain('操作失败，请重试 (traceId:'))
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
      expect(target.querySelector('section')?.getAttribute('aria-label')).toBe('问题反馈')
      expect(target.querySelector('h1, h2')).toBeNull()
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
      await vi.waitFor(() => expect(toast.items.at(-1)?.message).toContain('操作失败，请重试 (traceId:'))
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
