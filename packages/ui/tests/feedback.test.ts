// @vitest-environment jsdom
import type { FeedbackSubmitAction, FeedbackViewActions } from '../src/lib/components/scenes/app/feedback-types.js'
import { core, HaiCommonError } from '@h-ai/core'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import FeedbackForm from '../src/lib/components/scenes/app/FeedbackForm.svelte'
import FeedbackList from '../src/lib/components/scenes/app/FeedbackList.svelte'

it('提交失败保留正文和文件，使用同一个 UUID 再发送', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onsubmit = vi.fn<FeedbackSubmitAction>()
    .mockResolvedValueOnce(core.err(HaiCommonError.SERVICE_UNAVAILABLE, 'Retry'))
    .mockResolvedValueOnce(core.ok(undefined))
  const component = mount(FeedbackForm, {
    target,
    props: { onsubmit },
  })
  try {
    flushSync()
    const file = new File(['instructions'], 'steps.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('instructions').buffer,
    })
    const selector = target.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(selector, 'files', {
      value: [file],
    })
    selector.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    const send = () => target.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    send()
    await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(target.querySelector('input')?.disabled).toBe(false))
    expect(target.textContent).toContain('steps.txt')
    send()
    await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledTimes(2))
    expect(onsubmit.mock.calls[1]?.[0]).toEqual(onsubmit.mock.calls[0]?.[0])
    expect(onsubmit.mock.calls[0]?.[0]?.attachments).toEqual([
      { name: 'steps.txt', contentType: 'text/plain', dataBase64: 'aW5zdHJ1Y3Rpb25z' },
    ])
    await vi.waitFor(() => expect(target.textContent).not.toContain('steps.txt'))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('切换处理状态从第一页查询，迟到的旧列表不覆盖筛选结果', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const unused = async () => core.err(HaiCommonError.NOT_FOUND, 'Missing')
  const id = core.id.uuid()
  const report = {
    id,
    body: 'Awaiting details',
    appId: 'orders',
    scopeId: 'scope-1',
    userId: 'author',
    status: 'awaiting_user' as const,
    createdAt: 1,
    updatedAt: 1,
  }
  let resolveFirst: (() => void) | undefined
  const list = vi.fn<FeedbackViewActions['list']>().mockImplementationOnce(() => new Promise((resolve) => {
    resolveFirst = () => resolve(core.ok({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    }))
  })).mockResolvedValueOnce(core.ok({
    items: [report],
    page: 1,
    pageSize: 20,
    total: 1,
  }))
  const component = mount(FeedbackList, {
    target,
    props: {
      actions: {
        list,
        get: unused,
        listMessages: unused,
        addMessage: unused,
        getAttachment: unused,
      },
    },
  })
  try {
    flushSync()
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    const select = target.querySelector<HTMLSelectElement>('select')!
    select.value = 'awaiting_user'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, status: 'awaiting_user' }))
    resolveFirst?.()
    await vi.waitFor(() => expect(target.textContent).toContain(report.body))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('仅有读取权限时可以打开反馈详情，界面不提供回复操作', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const id = core.id.uuid()
  const unavailable = async () => core.err(HaiCommonError.NOT_FOUND, 'Missing')
  const component = mount(FeedbackList, {
    target,
    props: {
      initialId: id,
      canReply: false,
      actions: {
        list: unavailable,
        get: async () => core.ok({
          report: {
            id,
            body: 'Read-only feedback',
            appId: 'orders',
            scopeId: 'scope-1',
            userId: 'author',
            status: 'pending',
            createdAt: 1,
            updatedAt: 1,
          },
          attachments: [],
        }),
        listMessages: async () => core.ok({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
        }),
        addMessage: unavailable,
        getAttachment: unavailable,
      },
    },
  })
  try {
    await vi.waitFor(() => expect(target.textContent).toContain('Read-only feedback'))
    expect(target.querySelector('form')).toBeNull()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
