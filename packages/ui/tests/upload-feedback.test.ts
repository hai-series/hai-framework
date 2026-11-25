// @vitest-environment jsdom
import type { UploadHandler } from '../src/lib/components/scenes/types.js'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import AvatarUpload from '../src/lib/components/scenes/storage/AvatarUpload.svelte'
import FileUpload from '../src/lib/components/scenes/storage/FileUpload.svelte'
import ImageUpload from '../src/lib/components/scenes/storage/ImageUpload.svelte'
import { uiM } from '../src/lib/messages.js'
import { ui } from '../src/lib/ui-toast.js'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
afterEach(() => {
  ui.toast.clear()
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
})

it.each(['avatar', 'image', 'file'])('%s 上传失败统一 Toast，隐藏原始异常，保留重试与关联编号', async (kind) => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  const target = document.body.appendChild(document.createElement('div'))
  const uploadHandler = vi.fn(async () => {
    throw new Error('Private storage details (traceId: upload-request)')
  })
  const onerror = vi.fn()
  const props = { uploadHandler, onerror }
  const component = kind === 'avatar'
    ? mount(AvatarUpload, { target, props })
    : kind === 'image'
      ? mount(ImageUpload, { target, props })
      : mount(FileUpload, { target, props })
  try {
    flushSync()
    const input = target.querySelector<HTMLInputElement>('input[type=file]')!
    const file = new File(['example'], 'example.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(ui.toast.items.at(-1)).toMatchObject({ message: '上传失败', traceId: 'upload-request' }))
    expect(ui.toast.items).toHaveLength(1)
    expect(target.textContent).not.toContain('Private storage')
    expect(onerror).toHaveBeenCalledWith('上传失败 (traceId: upload-request)')
    expect(input.disabled).toBe(false)
    ui.toast.clear()
    if (kind === 'file')
      target.querySelector<HTMLButtonElement>(`[aria-label="${uiM('file_upload_retry')}"]`)!.click()
    else
      input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(onerror).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(ui.toast.items).toHaveLength(1))
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('移除在途文件后，即使上传器以普通异常结束也不误报失败', async () => {
  const pending = Promise.withResolvers<{ url: string }>()
  let settled = false
  const uploadHandler = vi.fn(async () => {
    try {
      return await pending.promise
    }
    finally {
      settled = true
    }
  })
  const onerror = vi.fn()
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(FileUpload, {
    target,
    props: { uploadHandler, onerror },
  })
  try {
    flushSync()
    const input = target.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', {
      value: [
        new File(['example'], 'example.txt'),
      ],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(uploadHandler).toHaveBeenCalledOnce())
    flushSync()
    target.querySelector<HTMLButtonElement>(`[aria-label="${uiM('file_upload_remove')}"]`)!.click()
    pending.reject(new Error('Uploader stopped'))
    await vi.waitFor(() => expect(settled).toBe(true))
    flushSync()
    expect(onerror).not.toHaveBeenCalled()
    expect(ui.toast.items).toHaveLength(0)
    expect(target.textContent).not.toContain('example.txt')
  }
  finally {
    pending.resolve({ url: '/unused' })
    await unmount(component)
    target.remove()
  }
})

function selectFiles(target: HTMLElement, files: File[]) {
  const input = target.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  flushSync()
}

it.each(['清空', '卸载', '移除'])('即使已有请求完成，FileUpload %s后也不再上传已取消的排队文件', async (action) => {
  const pending = Promise.withResolvers<{ url: string }>()
  const uploadHandler = vi.fn<UploadHandler>(() => pending.promise)
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(FileUpload, {
    target,
    props: {
      maxFiles: 4,
      multiple: true,
      uploadHandler,
      autoUpload: false,
    },
  })
  let mounted = true
  try {
    flushSync()
    selectFiles(target, ['a.txt', 'b.txt', 'c.txt', 'd.txt'].map(name => new File(['data'], name)))
    const upload = component.upload()
    expect(uploadHandler).toHaveBeenCalledTimes(3)
    if (action === '清空') {
      component.clear()
    }
    else if (action === '卸载') {
      await unmount(component)
      mounted = false
    }
    else {
      target.querySelectorAll<HTMLButtonElement>(`[aria-label="${uiM('file_upload_remove')}"]`)[3]!.click()
    }
    pending.resolve({ url: '/files/uploaded.txt' })
    await upload
    expect(uploadHandler.mock.calls.map(([file]) => file.name)).toEqual(['a.txt', 'b.txt', 'c.txt'])
  }
  finally {
    pending.resolve({ url: '/unused' })
    if (mounted)
      await unmount(component)
    target.remove()
  }
})

it('fileUpload 拒绝不符合尺寸或类型限制的文件，不提供上传重试', async () => {
  const uploadHandler = vi.fn<UploadHandler>(async () => ({ url: '/files/report.txt' }))
  const onerror = vi.fn()
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(FileUpload, {
    target,
    props: {
      maxSize: 2,
      maxFiles: 2,
      accept: '.txt',
      multiple: true,
      uploadHandler,
      onerror,
    },
  })
  try {
    flushSync()
    selectFiles(target, [
      new File(['large'], 'large.txt'),
      new File(['x'], 'report.pdf'),
    ])
    expect(onerror).toHaveBeenCalledTimes(2)
    expect(target.querySelector(`[aria-label="${uiM('file_upload_retry')}"]`)).toBeNull()
    await component.upload()
    expect(uploadHandler).not.toHaveBeenCalled()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it.each(['图片', '头像'])('%s上传仅接收最新结果，卸载后不触发回写', async (kind) => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  const pending = new Map(['old.png', 'new.png', 'pending.png'].map(name => [
    name,
    Promise.withResolvers<{ url: string }>(),
  ]))
  const uploadHandler = vi.fn<UploadHandler>(file => pending.get(file.name)!.promise)
  const onchange = vi.fn()
  const onerror = vi.fn()
  const target = document.body.appendChild(document.createElement('div'))
  const props = { uploadHandler, onchange, onerror }
  const component = kind === '图片'
    ? mount(ImageUpload, { target, props })
    : mount(AvatarUpload, { target, props })
  let mounted = true
  try {
    flushSync()
    selectFiles(target, [
      new File(['old'], 'old.png', { type: 'image/png' }),
    ])
    selectFiles(target, [
      new File(['new'], 'new.png', { type: 'image/png' }),
    ])
    expect(uploadHandler.mock.calls[0]![1].signal.aborted).toBe(true)
    const next = pending.get('new.png')!
    next.resolve({ url: '/files/new.png' })
    await next.promise
    const old = pending.get('old.png')!
    old.resolve({ url: '/files/old.png' })
    await old.promise

    selectFiles(target, [
      new File(['pending'], 'pending.png', { type: 'image/png' }),
    ])
    await unmount(component)
    mounted = false
    expect(uploadHandler.mock.calls[2]![1].signal.aborted).toBe(true)
    const abandoned = pending.get('pending.png')!
    abandoned.resolve({ url: '/files/pending.png' })
    await abandoned.promise
    expect(onchange).toHaveBeenCalledExactlyOnceWith('/files/new.png')
    expect(onerror).not.toHaveBeenCalled()
  }
  finally {
    for (const request of pending.values())
      request.resolve({ url: '/unused' })
    if (mounted)
      await unmount(component)
    target.remove()
  }
})
