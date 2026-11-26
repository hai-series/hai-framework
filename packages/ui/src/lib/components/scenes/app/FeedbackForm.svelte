<!-- @component FeedbackForm 发送文本和本次手动选择的附件。 -->
<script lang='ts'>
  import type { FeedbackCaptureDraft } from './feedback-functions.js'
  import type { FeedbackSubmitAction } from './feedback-types.js'
  import { feedbackLimits } from '@h-ai/api-contract/feedback'
  import { core } from '@h-ai/core'
  import { uiM } from '../../../messages.js'
  import { errorMessage, useToastFeedback } from '../../../toast.svelte.js'
  import Button from '../../primitives/Button.svelte'
  import { captureSize, encodeFeedbackCapture, encodeFeedbackFile } from './feedback-functions.js'

  interface Props {
    onsubmit: FeedbackSubmitAction
    onrequestinfo?: FeedbackSubmitAction
    oncomplete?: (id: string) => void
    onbusy?: (busy: boolean) => void
    reply?: boolean
    capture?: FeedbackCaptureDraft
    preparing?: boolean
  }

  const { onsubmit, onrequestinfo, oncomplete, onbusy, reply = false, capture, preparing = false }: Props = $props()
  const formId = $props.id()
  let body = $state('')
  let files = $state.raw<File[]>([])
  let error = $state('')
  let busy = $state(false)
  let attempt: { id: string, requestInfo: boolean, capture?: FeedbackCaptureDraft } | undefined
  const selectedCapture = $derived(reply ? undefined : capture)
  const captureBytes = $derived(captureSize(selectedCapture))
  const canSend = $derived(Boolean(body.trim() || files.length || captureBytes || selectedCapture?.includeServerLogs))

  function edit() {
    attempt = undefined
    error = ''
  }

  function selectFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const selected = [
      ...files,
      ...Array.from(input.files ?? []),
    ]
    input.value = ''
    if (selected.length > feedbackLimits.maxFiles
      || selected.some(file => file.size === 0 || file.size > feedbackLimits.maxFileBytes || file.name.length > 255)
      || selected.reduce((total, file) => total + file.size, captureBytes) > feedbackLimits.maxTotalFileBytes) {
      error = uiM('feedback_file_limits')
      return
    }
    files = selected
    edit()
  }

  async function send(requestInfo = false) {
    if (busy || preparing)
      return
    const action = requestInfo ? onrequestinfo : onsubmit
    if (!action)
      return
    if (!canSend) {
      error = uiM('feedback_error_empty')
      return
    }
    if (files.reduce((sum, file) => sum + file.size, captureBytes) > feedbackLimits.maxTotalFileBytes) {
      error = uiM('feedback_file_limits')
      return
    }
    if (attempt?.requestInfo !== requestInfo || attempt.capture !== selectedCapture) {
      attempt = {
        id: core.id.uuid(),
        requestInfo,
        capture: selectedCapture,
      }
    }
    const id = attempt.id
    error = ''
    busy = true
    onbusy?.(true)
    try {
      const attachments = await Promise.all(files.map(encodeFeedbackFile))
      const result = await action({
        id,
        body: body.trim(),
        attachments,
        ...(selectedCapture
          ? { capture: await encodeFeedbackCapture(selectedCapture) }
          : {}),
      })
      if (!result.success) {
        error = errorMessage(result.error, uiM('feedback_action_failed'))
        return
      }
      files = []
      body = ''
      attempt = undefined
      oncomplete?.(id)
    }
    catch (cause) {
      error = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      busy = false
      onbusy?.(false)
    }
  }

  useToastFeedback(() => error)
</script>

<form class='space-y-4' onsubmit={(event) => {
  event.preventDefault()
  void send()
}}>
  <div class='space-y-1'>
    <label for={`${formId}-body`} class='block text-sm font-medium'>{uiM(reply ? 'feedback_reply' : 'feedback_content_label')}</label>
    <textarea id={`${formId}-body`} class='textarea w-full min-h-24' bind:value={body} maxlength={feedbackLimits.maxBodyLength} oninput={edit} disabled={busy}></textarea>
  </div>
  <div class='space-y-1'>
    <label for={`${formId}-files`} class='block text-sm font-medium'>{uiM('feedback_attachments')}</label>
    <input id={`${formId}-files`} class='file-input file-input-sm w-full' type='file' multiple onchange={selectFiles} disabled={busy} aria-describedby={`${formId}-limits`}>
    <p id={`${formId}-limits`} class='text-xs text-base-content/70'>{uiM('feedback_file_limits')}</p>
    {#if files.length}
      <ul class='space-y-1'>
        {#each files as file, index (file)}
          <li class='flex items-center justify-between gap-2 rounded-lg bg-base-200 px-2'>
            <span class='min-w-0 break-all text-sm'>{file.name}</span>
            <Button type='button' size='xs' variant='ghost' disabled={busy} onclick={() => {
              files = files.filter((_, position) => position !== index)
              edit()
            }}>{uiM('feedback_remove')}</Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class='flex flex-wrap justify-end gap-2'>
    {#if onrequestinfo}
      <Button type='button' size='sm' variant='outline' disabled={busy || (!body.trim() && !files.length)} onclick={() => void send(true)}>{uiM('feedback_request_info')}</Button>
    {/if}
    <Button type='submit' size='sm' variant='primary' loading={busy} disabled={!canSend || preparing}>{uiM(reply ? 'feedback_send_reply' : 'feedback_submit')}</Button>
  </div>
</form>
