// @vitest-environment jsdom
import type { FeedbackSubmitAction, FeedbackViewActions } from '../src/lib/components/scenes/app/feedback-types.js'
import { FeedbackLimitsSchema } from '@h-ai/api-contract/feedback'
import { core, HaiCommonError } from '@h-ai/core'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import FeedbackForm from '../src/lib/components/scenes/app/FeedbackForm.svelte'
import FeedbackList from '../src/lib/components/scenes/app/FeedbackList.svelte'

it('读取生效限额期间仍能查看已保存的反馈', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const id = core.id.uuid()
  const unavailable = async () => core.err(HaiCommonError.NOT_FOUND, 'Missing')
  const settings = FeedbackLimitsSchema.parse({
    limits: { maxBodyLength: 42 },
  })
  let finish: (() => void) | undefined
  const component = mount(FeedbackList, {
    target,
    props: {
      initialId: id,
      actions: {
        list: unavailable,
        get: async () => core.ok({
          report: {
            id,
            appId: 'orders',
            scopeId: 'scope-1',
            userId: 'author',
            body: 'Saved feedback',
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
        getLimits: () => new Promise((resolve) => {
          finish = () => resolve(core.ok(settings))
        }),
        addMessage: unavailable,
        getAttachment: unavailable,
      },
    },
  })
  try {
    await vi.waitFor(() => expect(target.textContent).toContain('Saved feedback'))
    expect(target.querySelector('textarea')).toBeNull()
    finish?.()
    await vi.waitFor(() => expect(target.querySelector('textarea')?.maxLength).toBe(42))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('表单显示已配置的容量并拦住超大文件', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const onsubmit = vi.fn<FeedbackSubmitAction>(async () => core.ok(undefined))
  const component = mount(FeedbackForm, {
    target,
    props: {
      onsubmit,
      limits: {
        maxBodyLength: 17,
        maxFiles: 1,
        maxFileBytes: 1024,
        maxTotalFileBytes: 2048,
      },
    },
  })
  try {
    flushSync()
    expect(target.querySelector('textarea')?.maxLength).toBe(17)
    expect(target.textContent).toContain('1 KiB')
    expect(target.textContent).toContain('2 KiB')
    const selector = target.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(selector, 'files', {
      value: [
        new File([
          'a'.repeat(1025),
        ], 'too-large.txt'),
      ],
    })
    selector.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    expect(target.textContent).not.toContain('too-large.txt')
    expect(target.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true)
    expect(onsubmit).not.toHaveBeenCalled()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

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
