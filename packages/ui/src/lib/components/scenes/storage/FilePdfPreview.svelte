<!-- 只绘制 PDF 页面，不挂载文档链接、脚本、表单或注释。 -->
<script lang='ts'>
  import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import Button from '../../primitives/Button.svelte'
  import { loadPdfPreview } from './file-preview-pdf.js'

  const { url }: { url: string } = $props()
  const MAX_CANVAS_EDGE = 1_600
  const MAX_IMAGE_PIXELS = 16_000_000
  const PREVIEW_TIMEOUT = 20_000
  let pdf = $state.raw<PDFDocumentProxy>()
  let canvas = $state<HTMLCanvasElement>()
  let pageNumber = $state(1)
  let loading = $state(true)
  let rendering = $state(false)
  let failed = $state(false)
  let renderFailed = $state(false)
  let attempt = $state(0)
  let disableAnnotations: number

  $effect(() => {
    void attempt
    const source = url
    const controller = new AbortController()
    let releaseWorker: (() => void) | undefined
    let loadingTask: PDFDocumentLoadingTask | undefined
    pdf = undefined
    pageNumber = 1
    loading = true
    failed = false
    renderFailed = false

    function release() {
      const terminate = releaseWorker
      if (!terminate)
        return
      releaseWorker = undefined
      if (!loadingTask) {
        terminate()
        return
      }
      // 给解析器关闭文档的机会，也要能回收已经无响应的 Worker。
      const deadline = setTimeout(terminate, 1_000)
      void loadingTask.destroy().catch(() => {}).finally(() => {
        clearTimeout(deadline)
        terminate()
      })
    }

    const timeout = setTimeout(() => {
      failed = true
      loading = false
      controller.abort()
      release()
    }, PREVIEW_TIMEOUT)

    void (async () => {
      try {
        const data = await loadPdfPreview(source, controller.signal)
        controller.signal.throwIfAborted()
        const { getDocument, PDFWorker, AnnotationMode, VerbosityLevel } = await import('pdfjs-dist')
        controller.signal.throwIfAborted()
        const port = new Worker(new URL('./file-preview-pdf-worker.js', import.meta.url), { type: 'module' })
        releaseWorker = () => port.terminate()
        const worker = PDFWorker.create({ port })
        releaseWorker = () => {
          worker.destroy()
          port.terminate()
        }
        disableAnnotations = AnnotationMode.DISABLE
        loadingTask = getDocument({
          data,
          worker,
          enableXfa: false,
          disableWorkerRendering: true,
          useWasm: false,
          useWorkerFetch: false,
          maxImageSize: MAX_IMAGE_PIXELS,
          canvasMaxAreaInBytes: MAX_IMAGE_PIXELS * 4,
          verbosity: VerbosityLevel.ERRORS,
        })
        const document = await loadingTask.promise
        controller.signal.throwIfAborted()
        pdf = document
      }
      catch {
        if (!controller.signal.aborted)
          failed = true
        release()
      }
      finally {
        clearTimeout(timeout)
        if (!controller.signal.aborted)
          loading = false
      }
    })()

    return () => {
      clearTimeout(timeout)
      controller.abort()
      release()
    }
  })

  $effect(() => {
    const document = pdf
    const target = canvas
    const currentPage = pageNumber
    if (!document || !target)
      return
    let cancelled = false
    let task: RenderTask | undefined
    let page: PDFPageProxy | undefined
    rendering = true
    renderFailed = false

    void (async () => {
      try {
        page = await document.getPage(currentPage)
        if (cancelled)
          return
        const { width, height } = page.getViewport({ scale: 1 })
        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)
          throw new Error('Invalid PDF page size')
        const scale = Math.min(2, MAX_CANVAS_EDGE / Math.max(width, height))
        const viewport = page.getViewport({ scale })
        target.width = Math.max(1, Math.floor(viewport.width))
        target.height = Math.max(1, Math.floor(viewport.height))
        task = page.render({ canvas: target, viewport, annotationMode: disableAnnotations })
        await task.promise
      }
      catch {
        if (!cancelled)
          renderFailed = true
      }
      finally {
        page?.cleanup()
        if (!cancelled)
          rendering = false
      }
    })()

    return () => {
      cancelled = true
      task?.cancel()
    }
  })
  useToastFeedback(() => failed || renderFailed
    ? uiM('file_list_preview_failed')
    : '')
</script>

{#if loading}
  <p role='status'>{uiM('common_loading')}</p>
{:else if failed || renderFailed}
  <Button size='sm' onclick={() => attempt += 1}>{uiM('file_list_retry')}</Button>
{:else if pdf}
  {#if pdf.numPages > 1}
    <div class='flex items-center justify-center gap-3 pb-3'>
      <Button size='sm' disabled={pageNumber <= 1} onclick={() => pageNumber -= 1}>{uiM('pagination_previous')}</Button>
      <span aria-live='polite'>{uiM('pagination_page_info', { page: pageNumber, total: pdf.numPages })}</span>
      <Button size='sm' disabled={pageNumber >= pdf.numPages} onclick={() => pageNumber += 1}>{uiM('pagination_next')}</Button>
    </div>
  {/if}
  {#if rendering}
    <p role='status'>{uiM('common_loading')}</p>
  {/if}
  <div
    role='img'
    aria-label={uiM('pagination_page_info', { page: pageNumber, total: pdf.numPages })}
    hidden={rendering}
  >
    <canvas bind:this={canvas} class='mx-auto max-h-[70vh] max-w-full object-contain'></canvas>
  </div>
{/if}
