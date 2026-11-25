// @vitest-environment jsdom
import type { ToolRun, ToolRunRequest } from '../src/lib/components/scenes/tools/workspace-types.js'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import ToolWorkspace from '../src/lib/components/scenes/tools/ToolWorkspace.svelte'
import { uiM } from '../src/lib/messages.js'

const catalog = ['first', 'second'].map(name => ({
  name,
  description: name,
  inputSchema: {
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
    },
  },
}))

it('未知提交锁定工具和参数，重试复用原始请求快照', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const requests: ToolRunRequest[] = []
  const onrun = vi.fn(async (request: ToolRunRequest): Promise<ToolRun> => {
    requests.push(request)
    if (requests.length === 1)
      throw new Error('Response channel unavailable')
    return { id: 'receipt', status: 'succeeded' }
  })
  const component = mount(ToolWorkspace, {
    target,
    props: { tools: catalog, onrun },
  })
  try {
    flushSync()
    const input = target.querySelector('textarea')!
    input.value = 'The original intent'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_submission_unknown')))
    expect(target.querySelector('select')!.disabled).toBe(true)
    expect(input.disabled).toBe(true)
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toEqual(requests[0])
    expect(requests[1]?.input).toEqual({ prompt: 'The original intent' })
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('恢复已知回执尚未返回时禁止换工具或提交，不清除唯一恢复引用', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const pending = Promise.withResolvers<ToolRun>()
  const onstatus = vi.fn(() => pending.promise)
  const onrunchange = vi.fn<(run: ToolRun | undefined) => void>()
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: catalog,
      initialRun: { id: 'existing-receipt', status: 'unknown' },
      onrun: async () => { throw new Error('Recovery must not resubmit') },
      onstatus,
      onrunchange,
    },
  })
  try {
    await vi.waitFor(() => expect(onstatus).toHaveBeenCalledOnce())
    expect(target.querySelector('select')!.disabled).toBe(true)
    expect(target.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
    pending.resolve({ id: 'existing-receipt', status: 'succeeded' })
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_status_succeeded')))
    expect(target.querySelector('select')!.disabled).toBe(false)
    expect(onrunchange).not.toHaveBeenCalledWith(undefined)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('状态查询失败后，取消处理期间不会重新查询或中止取消请求', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const pending = Promise.withResolvers<ToolRun>()
  const onstatus = vi.fn(async () => {
    throw new Error('Response channel unavailable')
  })
  const oncancel = vi.fn((_id: string, _signal: AbortSignal) => pending.promise)
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: catalog,
      initialRun: { id: 'existing-receipt', status: 'running' },
      onrun: async () => { throw new Error('Recovery must not resubmit') },
      onstatus,
      oncancel,
    },
  })
  const button = (key: string) => [
    ...target.querySelectorAll('button'),
  ].find(item => item.textContent?.trim() === uiM(key))!
  try {
    await vi.waitFor(() => expect(button('tool_resume')).toBeDefined())
    button('tool_cancel').click()
    flushSync()
    expect(oncancel).toHaveBeenCalledOnce()
    expect(button('tool_resume').disabled).toBe(true)
    button('tool_resume').click()
    expect(onstatus).toHaveBeenCalledOnce()
    expect(oncancel.mock.calls[0]?.[1].aborted).toBe(false)

    pending.resolve({ id: 'existing-receipt', status: 'cancelled' })
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_status_cancelled')))
    expect(target.querySelector('select')?.disabled).toBe(false)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('取消正在恢复的运行后，状态请求的迟到结果不锁住表单', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const pending = Promise.withResolvers<ToolRun>()
  const onstatus = vi.fn((_id: string, _signal: AbortSignal) => pending.promise)
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: catalog,
      initialRun: { id: 'existing-receipt', status: 'running' },
      onrun: async () => { throw new Error('Recovery must not resubmit') },
      onstatus,
      oncancel: async () => ({ id: 'existing-receipt', status: 'cancelled' }),
    },
  })
  try {
    await vi.waitFor(() => expect(onstatus).toHaveBeenCalledOnce())
    const cancel = [
      ...target.querySelectorAll('button'),
    ].find(item => item.textContent?.trim() === uiM('tool_cancel'))!
    cancel.click()
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_status_cancelled')))
    expect(onstatus.mock.calls[0]?.[1].aborted).toBe(true)
    pending.resolve({ id: 'existing-receipt', status: 'running' })
    await pending.promise
    flushSync()
    expect(target.textContent).toContain(uiM('tool_status_cancelled'))
    expect(target.querySelector('select')?.disabled).toBe(false)
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('仅有幂等键且服务确认尚无记录后，允许核对重填并沿用同一个键', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onrun = vi.fn(async (_request: ToolRunRequest): Promise<ToolRun> => ({ id: 'new-receipt', status: 'succeeded' }))
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: catalog,
      initialRun: { id: 'pending.original-key', idempotencyKey: 'original-key', status: 'unknown' },
      onstatus: async () => null,
      onrun,
    },
  })
  try {
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('tool_submission_not_found')))
    expect(target.querySelector('select')!.disabled).toBe(false)
    const input = target.querySelector('textarea')!
    expect(input.disabled).toBe(false)
    input.value = 'Checked original parameters'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(onrun).toHaveBeenCalledOnce())
    expect(onrun.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: 'original-key',
      input: { prompt: 'Checked original parameters' },
    })
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('已知回执仍未核实时，明确确认旧任务可能继续后才开始另一操作', async () => {
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
  const onrunchange = vi.fn<(run: ToolRun | undefined) => void>()
  const oncancel = vi.fn(async (): Promise<ToolRun> => ({ id: 'existing-receipt', status: 'cancelled' }))
  const component = mount(ToolWorkspace, {
    target,
    props: {
      tools: catalog,
      initialRun: { id: 'existing-receipt', status: 'unknown' },
      onstatus: async () => ({ id: 'existing-receipt', status: 'unknown' }),
      onrun: async () => ({ id: 'another-run', status: 'succeeded' }),
      onrunchange,
      oncancel,
    },
  })
  try {
    const start = () => [
      ...target.querySelectorAll('button'),
    ].find(button => button.textContent?.trim() === uiM('tool_new_operation'))
    await vi.waitFor(() => expect(start()).toBeDefined())
    expect(target.querySelector('select')!.disabled).toBe(true)
    start()!.click()
    flushSync()
    const dialog = target.querySelector('dialog')!
    expect(dialog.textContent).toContain(uiM('tool_new_operation_confirm'))
    const confirm = [
      ...dialog.querySelectorAll('button'),
    ].find(button => button.textContent?.trim() === uiM('tool_new_operation'))!
    confirm.click()
    await vi.waitFor(() => expect(onrunchange).toHaveBeenLastCalledWith(undefined))
    expect(target.querySelector('select')!.disabled).toBe(false)
    expect(oncancel).not.toHaveBeenCalled()
  }
  finally {
    await unmount(component)
    if (show)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    if (close)
      Object.defineProperty(HTMLDialogElement.prototype, 'close', close)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    target.remove()
  }
})
