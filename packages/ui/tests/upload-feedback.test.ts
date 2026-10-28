// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import AvatarUpload from '../src/lib/components/scenes/storage/AvatarUpload.svelte'
import FileUpload from '../src/lib/components/scenes/storage/FileUpload.svelte'
import ImageUpload from '../src/lib/components/scenes/storage/ImageUpload.svelte'
import { uiM } from '../src/lib/messages.js'
import { toast } from '../src/lib/toast.svelte.js'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
afterEach(() => {
  toast.clear()
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
  const component = kind === 'avatar' ? mount(AvatarUpload, { target, props }) : kind === 'image' ? mount(ImageUpload, { target, props }) : mount(FileUpload, { target, props })
  try {
    flushSync()
    const input = target.querySelector<HTMLInputElement>('input[type=file]')!
    const file = new File(['example'], 'example.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(toast.items.at(-1)).toMatchObject({ message: '上传失败', traceId: 'upload-request' }))
    expect(toast.items).toHaveLength(1)
    expect(target.textContent).not.toContain('Private storage')
    expect(onerror).toHaveBeenCalledWith('上传失败 (traceId: upload-request)')
    expect(input.disabled).toBe(false)
    toast.clear()
    if (kind === 'file')
      target.querySelector<HTMLButtonElement>(`[aria-label="${uiM('file_upload_retry')}"]`)!.click()
    else
      input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(onerror).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(toast.items).toHaveLength(1))
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
  const component = mount(FileUpload, { target, props: { uploadHandler, onerror } })
  try {
    flushSync()
    const input = target.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [new File(['example'], 'example.txt')] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(uploadHandler).toHaveBeenCalledOnce())
    flushSync()
    target.querySelector<HTMLButtonElement>(`[aria-label="${uiM('file_upload_remove')}"]`)!.click()
    pending.reject(new Error('Uploader stopped'))
    await vi.waitFor(() => expect(settled).toBe(true))
    flushSync()
    expect(onerror).not.toHaveBeenCalled()
    expect(toast.items).toHaveLength(0)
    expect(target.textContent).not.toContain('example.txt')
  }
  finally {
    pending.resolve({ url: '/unused' })
    await unmount(component)
    target.remove()
  }
})
