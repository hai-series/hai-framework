// @vitest-environment jsdom
import type { ArtifactDocument, ToolRun } from '../src/lib/components/scenes/tools/workspace-types.js'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import ArtifactWorkspace from '../src/lib/components/scenes/tools/ArtifactWorkspace.svelte'
import ToolWorkspace from '../src/lib/components/scenes/tools/ToolWorkspace.svelte'
import { setUILocale, uiM } from '../src/lib/messages.js'
import { toast } from '../src/lib/toast.svelte.js'
import ArtifactCreationHost from './fixtures/ArtifactCreationHost.svelte'

afterEach(() => {
  toast.clear()
  setUILocale('zh-CN')
  vi.unstubAllGlobals()
})

function button(target: HTMLElement, text: string) {
  return [
    ...target.querySelectorAll('button'),
  ].find(item => item.textContent?.trim() === text)!
}

it('可视修改保存遇到版本冲突时，保留草稿和基础版本', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const artifact: ArtifactDocument = {
    id: 'report',
    title: 'Report',
    kind: 'markdown',
    version: 1,
    content: '# Title\n\nOriginal paragraph.\n',
    editable: true,
  }
  const onsave = vi.fn(async () => ({ status: 'conflict' as const, currentVersion: 2 }))
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [artifact],
      onread: async () => artifact,
      onsave,
    },
  })
  try {
    flushSync()
    await vi.waitFor(() => expect(target.querySelector('article p')).not.toBeNull())
    const paragraph = target.querySelector('article p')!
    paragraph.textContent = 'Updated paragraph.'
    paragraph.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    button(target, uiM('artifact_save')).click()
    await vi.waitFor(() => expect(onsave).toHaveBeenCalledOnce())
    expect(onsave.mock.calls[0]![0]).toEqual({ id: 'report', baseVersion: 1, content: '# Title\n\nUpdated paragraph.\n' })
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('artifact_conflict_detail', { version: 2 })))
    button(target, uiM('artifact_source')).click()
    flushSync()
    expect(target.querySelector('textarea')?.value).toBe('# Title\n\nUpdated paragraph.\n')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('切换产物会撤销旧读取；晚返回的结果不覆盖当前内容', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const first = Promise.withResolvers<ArtifactDocument>()
  const a: ArtifactDocument = {
    id: 'a',
    title: 'First',
    kind: 'markdown',
    version: 1,
    content: 'First content',
  }
  const b: ArtifactDocument = {
    id: 'b',
    title: 'Second',
    kind: 'markdown',
    version: 1,
    content: 'Second content',
  }
  const onread = vi.fn(async (id: string, _version: number | undefined, _signal: AbortSignal) => id === 'a'
    ? first.promise
    : b)
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [a, b],
      onread,
    },
  })
  try {
    flushSync()
    await vi.waitFor(() => expect(onread).toHaveBeenCalledOnce())
    // 用户切换时必须依赖请求代际而非返回顺序。
    const select = target.querySelector('select')!
    select.value = 'b'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(target.textContent).toContain('Second content'))
    expect(onread.mock.calls[0]![2].aborted).toBe(true)
    first.resolve(a)
    await first.promise
    flushSync()
    expect(target.textContent).toContain('Second content')
    expect(target.textContent).not.toContain('First content')
  }
  finally {
    first.resolve(a)
    await unmount(component)
    target.remove()
  }
})

it('工具预设通过表单转成实际类型，取消后停止查询', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onrun = vi.fn(async (): Promise<ToolRun> => ({ id: 'job-1', status: 'running', progress: 0.25 }))
  const onstatus = vi.fn(async (): Promise<ToolRun> => ({ id: 'job-1', status: 'running' }))
  const oncancel = vi.fn(async (): Promise<ToolRun> => ({ id: 'job-1', status: 'cancelled' }))
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: [
        {
          name: 'sum',
          description: 'Calculate totals',
          inputSchema: {
            type: 'object',
            required: ['a'],
            properties: {
              a: { type: 'integer' },
              enabled: { type: 'boolean', default: false },
            },
          },
          examples: [
            {
              label: 'Example 42',
              input: { a: 42, enabled: false },
            },
          ],
        },
      ],
      onrun,
      onstatus,
      oncancel,
      pollIntervalMs: 250,
    },
  })
  try {
    flushSync()
    button(target, 'Example 42').click()
    flushSync()
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(onrun).toHaveBeenCalledOnce())
    expect(onrun.mock.calls[0]![0]).toEqual({
      name: 'sum',
      input: { a: 42, enabled: false },
      idempotencyKey: expect.any(String),
    })
    await vi.waitFor(() => expect(button(target, uiM('tool_cancel'))).toBeDefined())
    button(target, uiM('tool_cancel')).click()
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_status_cancelled')))
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(oncancel).toHaveBeenCalledOnce()
    expect(onstatus).not.toHaveBeenCalled()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('单元格编辑后立即切换源码仍保留最后一次输入', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const artifact: ArtifactDocument = {
    id: 'table',
    title: 'Table',
    kind: 'table',
    version: 1,
    editable: true,
    content: JSON.stringify({
      table_columns: [
        { key: 'name', label: 'Name', type: 'text' },
      ],
      table_rows: [
        { row_id: 'r1', name: 'Original' },
      ],
    }),
  }
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [artifact],
      onread: async () => artifact,
      onsave: async () => ({ status: 'saved', document: artifact }),
    },
  })
  try {
    flushSync()
    await vi.waitFor(() => expect(target.querySelector('td input')).not.toBeNull())
    const input = target.querySelector<HTMLInputElement>('td input')!
    input.value = 'Latest edit'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    button(target, uiM('artifact_source')).click()
    flushSync()
    expect(JSON.parse(target.querySelector('textarea')!.value).table_rows[0].name).toBe('Latest edit')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('取消回执仍为 cancelling 时继续查询，直到真正取消', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onstatus = vi.fn(async (): Promise<ToolRun> => ({ id: 'job', status: 'cancelled' }))
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: [
        {
          name: 'task',
          description: 'Task',
          inputSchema: { type: 'object' },
        },
      ],
      onrun: async () => ({ id: 'job', status: 'running' }),
      oncancel: async () => ({ id: 'job', status: 'cancelling' }),
      onstatus,
      pollIntervalMs: 250,
    },
  })
  try {
    flushSync()
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(button(target, uiM('tool_cancel'))).toBeDefined())
    button(target, uiM('tool_cancel')).click()
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_status_cancelling')))
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_status_cancelled')))
    expect(onstatus).toHaveBeenCalledOnce()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('空工作台可用名称和格式表单创建可编辑产物', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const oncreate = vi.fn(async (input: { title: string, kind: 'markdown', content: string }): Promise<ArtifactDocument> => ({
    ...input,
    id: 'new-report',
    version: 1,
    editable: true,
  }))
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [],
      onread: async () => { throw new Error('Unexpected read') },
      oncreate,
    },
  })
  try {
    flushSync()
    button(target, uiM('artifact_new')).click()
    flushSync()
    const input = target.querySelector<HTMLInputElement>('form input')!
    input.value = 'My report'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(oncreate).toHaveBeenCalledOnce())
    expect(oncreate.mock.calls[0]![0]).toMatchObject({ title: 'My report', kind: 'markdown' })
    expect(oncreate.mock.calls[0]![0].content).toContain('# My report')
    await vi.waitFor(() => expect(target.querySelector('article h1')?.textContent).toContain('My report'))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('宿主先更新产物列表时，不中断当前创建或卡住创建状态', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(ArtifactCreationHost, { target })
  try {
    flushSync()
    button(target, uiM('artifact_new')).click()
    flushSync()
    const input = target.querySelector<HTMLInputElement>('form input')!
    input.value = 'Host-updated artifact'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(target.querySelector('article h1')?.textContent).toBe('Host-updated artifact'))
    expect(button(target, uiM('artifact_new')).disabled).toBe(false)
    expect(target.querySelector('article')?.getAttribute('contenteditable')).toBe('true')
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('参考资源用可搜索多选呈现，保留手动 ID 兜底', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const target = document.body.appendChild(document.createElement('div'))
  const onrun = vi.fn(async (): Promise<ToolRun> => ({ id: 'run', status: 'succeeded' }))
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: [
        {
          name: 'image',
          description: 'Image',
          inputSchema: {
            properties: {
              referenceIds: {
                title: 'Reference images',
                type: 'array',
                format: 'artifact-ids',
                contentMediaType: 'image/*',
                items: { type: 'string' },
              },
            },
          },
        },
      ],
      resources: [
        { id: 'photo', title: 'Uploaded photo', mediaType: 'image/png' },
        { id: 'report', title: 'Private report', mediaType: 'application/pdf' },
      ],
      onrun,
    },
  })
  try {
    flushSync()
    expect(target.querySelector('input[role="combobox"]')).not.toBeNull()
    expect(target.querySelector('details')).not.toBeNull()
    const fallback = target.querySelector<HTMLTextAreaElement>('details textarea')!
    fallback.value = 'photo\nmanual-photo'
    fallback.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(onrun).toHaveBeenCalledOnce())
    expect(onrun.mock.calls[0]?.[0]).toMatchObject({
      input: {
        referenceIds: ['photo', 'manual-photo'],
      },
    })
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('宿主离开守卫保留取消后的草稿，确认丢弃后才允许离开，并清理硬离开监听', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() { this.open = true },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() { this.open = false },
  })
  let guard: (() => Promise<boolean>) | undefined
  const artifact: ArtifactDocument = {
    id: 'draft',
    title: 'Draft',
    kind: 'markdown',
    version: 1,
    editable: true,
    content: '# Title\n\nOriginal.\n',
  }
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [artifact],
      onread: async () => artifact,
      onsave: async () => ({ status: 'saved', document: artifact }),
      onleaveguard: (value) => { guard = value },
    },
  })
  try {
    await vi.waitFor(() => expect(guard).toBeTypeOf('function'))
    await vi.waitFor(() => expect(target.querySelector('article p')).not.toBeNull())
    const paragraph = target.querySelector('article p')!
    paragraph.textContent = 'Keep this draft.'
    paragraph.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    const cancelled = guard!()
    flushSync()
    button(target, uiM('confirm_cancel')).click()
    expect(await cancelled).toBe(false)
    expect(target.querySelector('article p')?.textContent).toBe('Keep this draft.')
    const confirmed = guard!()
    flushSync()
    button(target, uiM('artifact_discard')).click()
    expect(await confirmed).toBe(true)
  }
  finally {
    await unmount(component)
    expect(guard).toBeUndefined()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    if (show)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    if (close)
      Object.defineProperty(HTMLDialogElement.prototype, 'close', close)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    target.remove()
  }
})

it('初始持久回执主动续看，发布实际状态而不重新提交任务', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onrun = vi.fn()
  const onstatus = vi.fn(async (): Promise<ToolRun> => ({
    id: 'persistent-run',
    status: onstatus.mock.calls.length > 1
      ? 'succeeded'
      : 'running',
  }))
  const onrunchange = vi.fn<(run: ToolRun | undefined) => void>()
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: [
        {
          name: 'echo',
          description: 'Echo',
          inputSchema: { type: 'object' },
        },
      ],
      initialRun: { id: 'persistent-run', status: 'unknown' },
      onrunchange,
      onrun,
      onstatus,
      pollIntervalMs: 250,
    },
  })
  try {
    await vi.waitFor(() => expect(onstatus).toHaveBeenCalled())
    await vi.waitFor(() => expect(onrunchange).toHaveBeenCalledWith(expect.objectContaining({ id: 'persistent-run', status: 'succeeded' })))
    expect(onstatus.mock.calls[0]?.[0]).toBe('persistent-run')
    expect(onrun).not.toHaveBeenCalled()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('提交响应丢失后保留表单和幂等键，用同一意图重试而不产生新付费任务', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const requests: { name: string, input: Record<string, unknown>, idempotencyKey?: string }[] = []
  const onrun = vi.fn(async (request: typeof requests[number]): Promise<ToolRun> => {
    requests.push(request)
    if (requests.length === 1)
      throw new Error('Response was lost')
    return { id: 'accepted-once', status: 'succeeded' }
  })
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: [
        {
          name: 'paid_tool',
          description: 'Paid tool',
          inputSchema: {
            required: ['text'],
            properties: {
              text: { type: 'string' },
            },
          },
        },
      ],
      onrun,
    },
  })
  try {
    flushSync()
    const input = target.querySelector('textarea')!
    input.value = 'The original request'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(onrun).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(target.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(false))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(onrun).toHaveBeenCalledTimes(2))
    expect(requests[0]?.idempotencyKey).toBeTruthy()
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey)
    expect(requests[1]?.input).toEqual({ text: 'The original request' })
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('工具完成的产物立即按名称供下一工具选用，无须离开工具工作台', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: [
        {
          name: 'image_generate',
          description: 'Generate',
          inputSchema: { type: 'object' },
        },
        {
          name: 'image_edit',
          description: 'Edit',
          inputSchema: {
            properties: {
              fileId: { type: 'string', format: 'artifact-id' },
            },
          },
          examples: [
            {
              label: 'Use generated result',
              input: { fileId: 'generated-image' },
            },
          ],
        },
      ],
      onrun: async () => ({
        id: 'image-run',
        status: 'succeeded',
        artifacts: [
          {
            id: 'generated-image',
            title: 'Generated picture',
            kind: 'image',
            mediaType: 'image/png',
            version: 1,
          },
        ],
      }),
    },
  })
  try {
    flushSync()
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(target.textContent).toContain('Generated picture'))
    const choose = target.querySelector('select')!
    choose.value = 'image_edit'
    choose.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    button(target, 'Use generated result').click()
    await vi.waitFor(() => expect(target.querySelector<HTMLInputElement>('input[role="combobox"]')?.value).toBe('Generated picture'))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it.each(['\n', '\r\n'])('源码选区改写提交精确 Markdown 片段，供复杂可视选区安全回退（%j）', async (newline) => {
  const target = document.body.appendChild(document.createElement('div'))
  const content = `Hello **world**${newline}and [today](https://example.com).${newline}`
  const artifact: ArtifactDocument = {
    id: 'rewrite',
    title: 'Rewrite',
    kind: 'markdown',
    version: 1,
    editable: true,
    content,
  }
  const onrewrite = vi.fn(async () => ({ content: 'A proposal.' }))
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [artifact],
      onread: async () => artifact,
      onsave: async () => ({ status: 'saved', document: artifact }),
      onrewrite,
    },
  })
  try {
    await vi.waitFor(() => expect(target.querySelector('article p')).not.toBeNull())
    button(target, uiM('artifact_source')).click()
    flushSync()
    const source = target.querySelector('textarea')!
    source.setSelectionRange(0, source.value.trimEnd().length)
    source.dispatchEvent(new Event('select', { bubbles: true }))
    flushSync()
    expect(button(target, uiM('artifact_rewrite_selection'))).toBeDefined()
    button(target, uiM('artifact_rewrite_selection')).click()
    await vi.waitFor(() => expect(onrewrite).toHaveBeenCalledOnce())
    expect(onrewrite.mock.calls[0]?.[0]).toMatchObject({
      content,
      selectedText: content.trimEnd(),
    })
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
