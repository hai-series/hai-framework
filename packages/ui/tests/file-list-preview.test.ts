// @vitest-environment jsdom
import type { FileItem } from '../src/lib/components/scenes/types.js'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FileList from '../src/lib/components/scenes/storage/FileList.svelte'
import { uiM } from '../src/lib/messages.js'
import { ui } from '../src/lib/ui-toast.js'

const renderer = vi.hoisted(() => {
  const getDocument = vi.fn()
  const destroy = vi.fn()
  const terminate = vi.fn()
  return { getDocument, destroy, terminate }
})
vi.mock('pdfjs-dist', () => ({
  getDocument: renderer.getDocument,
  PDFWorker: {
    create: () => ({ destroy: renderer.destroy }),
  },
  AnnotationMode: { DISABLE: 0 },
  VerbosityLevel: { ERRORS: 0 },
}))

const pdfFile: FileItem = {
  id: 'report',
  name: 'report.pdf',
  size: 100,
  type: 'application/pdf',
  url: '/reports/report.pdf',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('Worker', class {
    terminate = renderer.terminate
  })
})
afterEach(() => {
  ui.toast.clear()
  vi.unstubAllGlobals()
})

function openPreview(target: HTMLElement) {
  flushSync()
  target.querySelector<HTMLButtonElement>(`[aria-label="${uiM('file_list_preview')}"]`)!.click()
  flushSync()
}

it('重试后以无注释的画布逐页渲染 PDF，关闭时释放解析器资源', async () => {
  const bytes = new Uint8Array(new TextEncoder().encode('%PDF-1.7'))
  const fetch = vi.fn(async () => new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf' },
  })).mockResolvedValueOnce(new Response(null, { status: 503 }))
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 850 * scale }),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    })),
    cleanup: vi.fn(),
  }
  const getPage = vi.fn(async () => page)
  const close = vi.fn(async () => {})
  renderer.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage }),
    destroy: close,
  })
  vi.stubGlobal('fetch', fetch)
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(FileList, {
    target,
    props: {
      files: [pdfFile],
    },
  })
  try {
    openPreview(target)
    await vi.waitFor(() => expect(ui.toast.items.at(-1)?.message).toBe(uiM('file_list_preview_failed')))
    const retry = Array.from(target.querySelectorAll('button')).find(button => button.textContent?.trim() === uiM('file_list_retry'))
    expect(retry).toBeDefined()
    retry!.click()
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(new URL(pdfFile.url!, document.baseURI), expect.objectContaining({
      credentials: 'same-origin',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    }))
    expect(renderer.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      data: bytes,
      enableXfa: false,
      useWorkerFetch: false,
    }))
    expect(getPage).toHaveBeenCalledExactlyOnceWith(1)
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({
      annotationMode: 0,
      canvas: expect.any(HTMLCanvasElement),
    }))
    expect(target.querySelector('iframe, object, embed')).toBeNull()
    const next = Array.from(target.querySelectorAll('button')).find(button => button.textContent?.trim() === uiM('pagination_next'))
    expect(next).toBeDefined()
    next!.click()
    await vi.waitFor(() => expect(getPage).toHaveBeenLastCalledWith(2))
    target.querySelector<HTMLButtonElement>(`[role="dialog"] button[aria-label="${uiM('common_close')}"]`)!.click()
    flushSync()
    await vi.waitFor(() => expect(renderer.terminate).toHaveBeenCalledOnce())
    expect(close).toHaveBeenCalledOnce()
    expect(renderer.destroy).toHaveBeenCalledOnce()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it.each([
  ['协议', 'data:text/plain,Report', undefined],
  [
    '响应类型',
    '/reports/report.pdf',
    new Response('%PDF-1.7', {
      headers: { 'Content-Type': 'text/plain' },
    }),
  ],
  [
    '文件签名',
    '/reports/report.pdf',
    new Response('Not a PDF', {
      headers: { 'Content-Type': 'application/pdf' },
    }),
  ],
  [
    '输入大小',
    '/reports/report.pdf',
    new Response('%PDF-1.7', {
      headers: { 'Content-Type': 'application/pdf', 'Content-Length': '20971521' },
    }),
  ],
] as const)('文件的%s不受支持时显示预览错误，不交给解析器', async (_kind, url, response) => {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(FileList, {
    target,
    props: {
      files: [
        { ...pdfFile, url },
      ],
    },
  })
  try {
    openPreview(target)
    await vi.waitFor(() => expect(ui.toast.items.at(-1)?.message).toBe(uiM('file_list_preview_failed')))
    expect(fetch).toHaveBeenCalledTimes(response ? 1 : 0)
    expect(renderer.getDocument).not.toHaveBeenCalled()
    expect(target.querySelector('iframe, object, embed')).toBeNull()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})

it('关闭预览会中止尚未完成的 PDF 请求，宿主预览回调优先', async () => {
  const onpreview = vi.fn()
  const fetch = vi.fn((_url: URL, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
  }))
  vi.stubGlobal('fetch', fetch)
  const target = document.body.appendChild(document.createElement('div'))
  const customTarget = document.body.appendChild(document.createElement('div'))
  const component = mount(FileList, {
    target,
    props: {
      files: [pdfFile],
    },
  })
  const custom = mount(FileList, {
    target: customTarget,
    props: {
      files: [pdfFile],
      onpreview,
    },
  })
  try {
    openPreview(customTarget)
    expect(onpreview).toHaveBeenCalledExactlyOnceWith(pdfFile)
    expect(fetch).not.toHaveBeenCalled()
    openPreview(target)
    expect(fetch).toHaveBeenCalledOnce()
    target.querySelector<HTMLButtonElement>(`[role="dialog"] button[aria-label="${uiM('common_close')}"]`)!.click()
    flushSync()
    expect(fetch.mock.calls[0]![1].signal?.aborted).toBe(true)
    expect(renderer.getDocument).not.toHaveBeenCalled()
  }
  finally {
    await unmount(component)
    await unmount(custom)
    target.remove()
    customTarget.remove()
  }
})
