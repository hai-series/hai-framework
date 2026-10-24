<!-- 反馈截图的交互选区；由宿主回调实际遮挡/标注图像。 -->
<script lang='ts'>
  import type { FeedbackAnnotation, FeedbackAttachmentView } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import { imagePreviewUrl } from './feedback-functions.js'

  const { attachment, onannotate }: {
    attachment: FeedbackAttachmentView
    onannotate?: (annotation: FeedbackAnnotation) => Promise<void>
  } = $props()

  let mode = $state<'mask' | 'outline'>('outline')
  let left = $state('10')
  let top = $state('10')
  let width = $state('20')
  let height = $state('20')
  let start = $state<{ x: number, y: number } | null>(null)
  let selected = $state(false)
  let loading = $state(false)
  let error = $state('')
  let imageFailed = $state(false)
  const url = $derived(imagePreviewUrl(attachment.url))
  const rect = $derived({ x: Math.max(0, Math.min(1, Number(left) / 100)), y: Math.max(0, Math.min(1, Number(top) / 100)), width: Math.max(0, Math.min(1, Number(width) / 100)), height: Math.max(0, Math.min(1, Number(height) / 100)) })

  function point(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)) }
  }
  function begin(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (!onannotate || loading)
      return
    event.preventDefault()
    start = point(event)
    selected = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (!start)
      return
    const end = point(event)
    left = Math.min(start.x, end.x).toFixed(1)
    top = Math.min(start.y, end.y).toFixed(1)
    width = Math.abs(end.x - start.x).toFixed(1)
    height = Math.abs(end.y - start.y).toFixed(1)
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
      error = cause instanceof Error ? cause.message : uiM('feedback_action_failed')
    }
    finally {
      loading = false
    }
  }
</script>

{#if url}
  <div class='space-y-3 min-w-0'>
    <div class='relative overflow-hidden rounded-lg border border-base-content/10 select-none' role='img' aria-label={attachment.name} style:touch-action={onannotate ? 'none' : 'auto'} onpointerdown={begin} onpointermove={move} onpointerup={() => start = null} onpointercancel={() => start = null}>
      <img src={url} alt={attachment.name} class='block max-w-full h-auto' draggable='false' referrerpolicy='no-referrer' onerror={() => imageFailed = true} onload={() => imageFailed = false} />
      {#if selected}
        <div class:mask-preview={mode === 'mask'} class='pointer-events-none absolute border-2 border-error' style:left={`${rect.x * 100}%`} style:top={`${rect.y * 100}%`} style:width={`${rect.width * 100}%`} style:height={`${rect.height * 100}%`}></div>
      {/if}
    </div>
    {#if imageFailed}<p class='text-warning text-sm' role='status'>{uiM('feedback_preview_failed')}</p>{/if}
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
      <FormLayout columns={2}>
        <FormField label={uiM('feedback_mark_x')}><Input type='number' min={0} max={100} bind:value={left} oninput={() => selected = true} /></FormField>
        <FormField label={uiM('feedback_mark_y')}><Input type='number' min={0} max={100} bind:value={top} oninput={() => selected = true} /></FormField>
        <FormField label={uiM('feedback_mark_width')}><Input type='number' min={1} max={100} bind:value={width} oninput={() => selected = true} /></FormField>
        <FormField label={uiM('feedback_mark_height')}><Input type='number' min={1} max={100} bind:value={height} oninput={() => selected = true} /></FormField>
      </FormLayout>
      <div class='flex flex-wrap gap-2'>
        <Button size='sm' {loading} disabled={!selected} onclick={apply}>{uiM('feedback_mark_apply')}</Button>
        <Button size='sm' variant='ghost' onclick={() => selected = false}>{uiM('feedback_mark_clear')}</Button>
      </div>
    {/if}
    {#if error}<p class='text-error text-sm break-words' role='alert'>{error}</p>{/if}
  </div>
{/if}

<style>
  .mask-preview { background: black; }
</style>
