<script lang='ts'>
  import type { FeedbackAttachmentKind } from '@h-ai/api-contract/feedback'
  import { uiM } from '../../../messages.js'
  import { isPreviewImage } from './feedback-functions.js'
  import FeedbackReplay from './FeedbackReplay.svelte'

  const { file, kind }: { file: File, kind: FeedbackAttachmentKind } = $props()
  let url = $state<string>()
  let text = $state<string>()

  $effect(() => {
    if (!isPreviewImage(file.type) && (kind !== 'recording' || !['video/mp4', 'video/webm'].includes(file.type)))
      return
    const preview = URL.createObjectURL(file)
    url = preview
    return () => URL.revokeObjectURL(preview)
  })

  $effect(() => {
    if (kind !== 'browser_logs' && kind !== 'server_logs')
      return
    let active = true
    text = undefined
    void file.text().then((value) => {
      if (!active)
        return
      const records: unknown = JSON.parse(value)
      text = Array.isArray(records)
        ? records.map(record => JSON.stringify(record)).join('\n')
        : value
    }).catch(() => {
      if (active)
        text = uiM('feedback_action_failed')
    })
    return () => {
      active = false
    }
  })

  async function replay() {
    const records: unknown = JSON.parse(await file.text())
    return Array.isArray(records)
      ? records
      : []
  }
</script>

{#if kind === 'replay'}
  <FeedbackReplay load={replay} />
{:else if kind === 'browser_logs' || kind === 'server_logs'}
  {#if text === undefined}
    <p role='status'>{uiM('feedback_loading')}</p>
  {:else}
    <pre class='max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs'>{text}</pre>
  {/if}
{:else if url && kind === 'recording'}
  <!-- svelte-ignore a11y_media_has_caption (录制源只包含视频轨道) -->
  <video src={url} controls preload='metadata' class='max-h-96 max-w-full'></video>
{:else if url}
  <img src={url} alt={file.name} class='max-h-96 max-w-full object-contain' />
{/if}
