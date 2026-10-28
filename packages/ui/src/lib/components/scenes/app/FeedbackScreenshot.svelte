<!-- 反馈截图的交互选区；由宿主回调实际遮挡/标注图像。 -->
<script lang='ts'>
  import type { FeedbackAnnotation, FeedbackAttachmentView } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import { errorMessage, useToastFeedback } from '../../../toast.svelte.js'
  import Button from '../../primitives/Button.svelte'
  import { imagePreviewUrl } from './feedback-functions.js'

  const { attachment, onannotate }: {
    attachment: FeedbackAttachmentView
    onannotate?: (annotation: FeedbackAnnotation) => Promise<void>
  } = $props()

  let mode = $state<'mask' | 'outline'>('outline')
  let rect = $state({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })
  let start = $state<{ x: number, y: number } | null>(null)
  let selected = $state(false)
  let loading = $state(false)
  let error = $state('')
  let imageFailed = $state(false)
  useToastFeedback(() => imageFailed ? uiM('feedback_preview_failed') : '', 'warning')
  const url = $derived(imagePreviewUrl(attachment.url))

  function point(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const bounds = (event.currentTarget.querySelector('img') ?? event.currentTarget).getBoundingClientRect()
    if (!bounds.width || !bounds.height)
      return { x: 0, y: 0 }
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  function begin(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (!onannotate || loading)
      return
    event.preventDefault()
    start = point(event)
    rect = { ...start, width: 0, height: 0 }
    selected = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (!start)
      return
    const end = point(event)
    rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
  }
  function keydown(event: KeyboardEvent) {
    if (!onannotate || loading)
      return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selected = true
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return
    event.preventDefault()
    selected = true
    const dx = event.key === 'ArrowLeft' ? -0.01 : event.key === 'ArrowRight' ? 0.01 : 0
    const dy = event.key === 'ArrowUp' ? -0.01 : event.key === 'ArrowDown' ? 0.01 : 0
    rect = event.shiftKey
      ? { ...rect, width: Math.max(0.01, Math.min(1 - rect.x, rect.width + dx)), height: Math.max(0.01, Math.min(1 - rect.y, rect.height + dy)) }
      : { ...rect, x: Math.max(0, Math.min(1 - rect.width, rect.x + dx)), y: Math.max(0, Math.min(1 - rect.height, rect.y + dy)) }
  }
  function end(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    move(event)
    start = null
  }
  function cancel() {
    start = null
    selected = false
  }
  async function apply() {
    if (!onannotate || loading || !Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0)
      return
    loading = true
    error = ''
    try {
      await onannotate({ id: attachment.id, mode, rect: { ...rect, width: Math.min(rect.width, 1 - rect.x), height: Math.min(rect.height, 1 - rect.y) } })
      selected = false
    }
    catch (cause) {
      error = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      loading = false
    }
  }
  useToastFeedback(() => error)
</script>

{#if url}
  <div class='space-y-3 min-w-0'>
    <div class='relative w-fit max-w-full overflow-hidden rounded-lg border border-base-content/10 select-none' role='button' aria-label={attachment.name} aria-disabled={!onannotate} tabindex={onannotate ? 0 : -1} onkeydown={keydown} style:touch-action={onannotate ? 'none' : 'auto'} onpointerdown={begin} onpointermove={move} onpointerup={end} onpointercancel={cancel}>
      <img src={url} alt={attachment.name} class='block max-w-full h-auto' draggable='false' referrerpolicy='no-referrer' onerror={() => imageFailed = true} onload={() => imageFailed = false} />
      {#if selected}
        <div class:mask-preview={mode === 'mask'} class='pointer-events-none absolute border-2 border-error' style:left={`${rect.x * 100}%`} style:top={`${rect.y * 100}%`} style:width={`${rect.width * 100}%`} style:height={`${rect.height * 100}%`}></div>
      {/if}
    </div>
    {#if onannotate && !imageFailed}
      <div class='flex flex-wrap gap-2'>
        <Button size='xs' variant={mode === 'outline' ? 'primary' : 'ghost'} onclick={() => {
          mode = 'outline'
          selected = true
        }}>{uiM('feedback_mark_outline')}</Button>
        <Button size='xs' variant={mode === 'mask' ? 'primary' : 'ghost'} onclick={() => {
          mode = 'mask'
          selected = true
        }}>{uiM('feedback_mark_mask')}</Button>
      </div>
      <p class='text-xs text-base-content/60'>{uiM('feedback_mark_hint')}</p>
      <div class='flex flex-wrap gap-2'>
        <Button size='sm' {loading} disabled={!selected || rect.width <= 0 || rect.height <= 0} onclick={apply}>{uiM('feedback_mark_apply')}</Button>
        <Button size='sm' variant='ghost' onclick={() => selected = false}>{uiM('feedback_mark_clear')}</Button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .mask-preview { background: black; }
</style>
