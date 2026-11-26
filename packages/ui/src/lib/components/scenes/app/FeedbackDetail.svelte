<!-- @component FeedbackDetail 展示首帖、处理状态、双方消息和授权附件。 -->
<script lang='ts'>
  import type { FeedbackDetail as Detail, FeedbackAttachment, FeedbackAttachmentKind, FeedbackLimits, FeedbackMessage, FeedbackSetStatusInput, FeedbackSubmitInput } from '@h-ai/api-contract/feedback'
  import type { FeedbackViewActions } from './feedback-types.js'
  import { onMount } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { errorMessage, useToastFeedback } from '../../../toast.svelte.js'
  import Pagination from '../../compounds/Pagination.svelte'
  import Button from '../../primitives/Button.svelte'
  import { captureLabels, decodeFeedbackFile, isPreviewImage, statusLabel } from './feedback-functions.js'
  import FeedbackCapturePreview from './FeedbackCapturePreview.svelte'
  import FeedbackForm from './FeedbackForm.svelte'

  interface Props {
    id: string
    actions: Omit<FeedbackViewActions, 'list'>
    canProcess?: boolean
    canReply?: boolean
    onchange?: () => void
  }

  const { id, actions, canProcess = false, canReply = true, onchange }: Props = $props()
  let report = $state<Detail>()
  let limits = $state.raw<FeedbackLimits['limits']>()
  let messages = $state<FeedbackMessage[]>([])
  let total = $state(0)
  let page = $state(1)
  let pageSize = $state(20)
  let loading = $state(true)
  let busy = $state(false)
  let error = $state('')
  let activePreview = $state.raw<{ file: File, kind: FeedbackAttachmentKind }>()
  let gettingFile = $state('')
  let request = 0
  let disposed = false

  function closePreview() {
    activePreview = undefined
  }

  async function load(nextPage = 1) {
    const token = ++request
    error = ''
    loading = true
    try {
      const [summary, conversation, settings] = await Promise.all([
        actions.get({ id }),
        actions.listMessages({ id, page: nextPage }),
        canReply && !limits
          ? actions.getLimits?.()
          : undefined,
      ])
      if (disposed || token !== request)
        return
      if (!summary.success || !conversation.success) {
        error = errorMessage(!summary.success
          ? summary.error
          : !conversation.success
          ? conversation.error
          : undefined, uiM('feedback_action_failed'))
        return
      }
      report = summary.data
      messages = [...conversation.data.items].reverse()
      total = conversation.data.total
      page = conversation.data.page
      pageSize = conversation.data.pageSize
      if (settings?.success)
        limits = settings.data.limits
      else if (settings)
        error = errorMessage(settings.error, uiM('feedback_action_failed'))
    }
    catch (cause) {
      if (!disposed && token === request)
        error = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      if (!disposed && token === request)
        loading = false
    }
  }

  async function changeStatus(status: FeedbackSetStatusInput['status']) {
    if (!actions.setStatus || busy)
      return
    busy = true
    error = ''
    try {
      const result = await actions.setStatus({ id, status })
      if (!result.success) {
        error = errorMessage(result.error, uiM('feedback_action_failed'))
        return
      }
      if (report && !disposed) {
        report = { ...report, report: result.data }
        onchange?.()
      }
    }
    catch (cause) {
      if (!disposed)
        error = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      busy = false
    }
  }

  function send(input: FeedbackSubmitInput, kind: FeedbackMessage['kind']) {
    return actions.addMessage({
      id,
      messageId: input.id,
      body: input.body,
      attachments: input.attachments,
      kind,
    })
  }

  async function fileAction(file: FeedbackAttachment, preview: boolean) {
    if (gettingFile)
      return
    gettingFile = file.id
    error = ''
    try {
      const result = await actions.getAttachment({ id, attachmentId: file.id })
      if (disposed)
        return
      if (!result.success) {
        error = errorMessage(result.error, uiM('feedback_action_failed'))
        return
      }
      if (preview && (file.kind !== 'file' || isPreviewImage(result.data.contentType))) {
        activePreview = {
          file: decodeFeedbackFile(result.data),
          kind: file.kind,
        }
      }
      else {
        const url = URL.createObjectURL(decodeFeedbackFile(result.data, true))
        const link = document.createElement('a')
        link.href = url
        link.download = result.data.name
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    }
    catch (cause) {
      if (!disposed)
        error = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      gettingFile = ''
    }
  }

  onMount(() => {
    void load()
    return () => {
      disposed = true
      closePreview()
    }
  })
  useToastFeedback(() => error)
</script>

{#snippet files(items: FeedbackAttachment[])}
  {#if items.length}
    <ul class='space-y-1'>
      {#each items as item (item.id)}
        <li class='flex flex-wrap items-center gap-x-2'>
          <span class='break-all text-sm'>{item.kind === 'file'
            ? item.name
            : uiM(captureLabels[item.kind])}</span>
          {#if item.kind !== 'file'}
            <Button size='xs' variant='ghost' disabled={!!gettingFile && gettingFile !== item.id} onclick={() => void fileAction(item, true)}>{uiM('feedback_capture_preview')}</Button>
          {:else if isPreviewImage(item.contentType)}
            <Button size='xs' variant='ghost' disabled={!!gettingFile && gettingFile !== item.id} onclick={() => void fileAction(item, true)}>{uiM('feedback_preview')}</Button>
          {/if}
          <Button size='xs' variant='ghost' disabled={!!gettingFile && gettingFile !== item.id} onclick={() => void fileAction(item, false)}>{uiM('feedback_download')}</Button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<section class='min-w-0 space-y-5' data-testid='feedback-detail'>
  {#if report}
    <div class='flex flex-wrap items-center gap-2'>
      <span class='badge badge-outline' data-testid='feedback-status'>{statusLabel(report.report.status)}</span>
      {#if canProcess && actions.setStatus}
        {#if report.report.status !== 'handled'}
          <Button size='sm' variant='outline' disabled={busy} onclick={() => void changeStatus('handled')}>{uiM('feedback_handle')}</Button>
        {/if}
        {#if report.report.status !== 'pending'}
          <Button size='sm' variant='ghost' disabled={busy} onclick={() => void changeStatus('pending')}>{uiM('feedback_reopen')}</Button>
        {/if}
      {/if}
      <Button size='sm' variant='ghost' disabled={loading} onclick={() => void load(page)}>{uiM('feedback_refresh')}</Button>
    </div>
    <div class='space-y-2 rounded-xl border border-base-content/15 p-3'>
      <p class='whitespace-pre-wrap break-words'>{report.report.body}</p>
      {@render files(report.attachments.filter(attachment => attachment.kind === 'file'))}
      {#if report.attachments.some(attachment => attachment.kind !== 'file')}
        <section class='mt-3 space-y-2' aria-label={uiM('feedback_capture_title')}>
          <h3 class='text-sm font-medium'>{uiM('feedback_capture_title')}</h3>
          {@render files(report.attachments.filter(attachment => attachment.kind !== 'file'))}
        </section>
      {/if}
    </div>
    {#if activePreview}
      <figure class='space-y-2 rounded-xl bg-base-200 p-3'>
        <figcaption class='flex items-center justify-between gap-3 break-all'>
          {activePreview.file.name}
          <Button size='xs' variant='ghost' onclick={closePreview}>{uiM('feedback_close')}</Button>
        </figcaption>
        {#key activePreview}
          <FeedbackCapturePreview file={activePreview.file} kind={activePreview.kind} />
        {/key}
      </figure>
    {/if}
    <section aria-label={uiM('feedback_conversation')} class='space-y-3'>
      {#if total > pageSize}
        <Pagination {page} {pageSize} {total} size='sm' showTotal={false} onchange={value => void load(value)} />
      {/if}
      {#each messages as message (message.id)}
        <article class='space-y-2 rounded-xl border border-base-content/15 p-3'>
          <div class='flex flex-wrap gap-2 text-sm text-base-content/80'>
            <strong>{uiM(message.authorRole === 'author'
              ? 'feedback_author'
              : 'feedback_staff')}</strong>
            {#if message.kind === 'request_info'}
              <span class='badge badge-info badge-outline badge-sm'>{uiM('feedback_request_info')}</span>
            {/if}
            <time datetime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString()}</time>
          </div>
          <p class='whitespace-pre-wrap break-words'>{message.body}</p>
          {@render files(message.attachments)}
        </article>
      {/each}
    </section>
    {#if canReply && (!actions.getLimits || limits)}
      <FeedbackForm reply {limits} onsubmit={input => send(input, 'reply')} onrequestinfo={canProcess
        ? input => send(input, 'request_info')
        : undefined} oncomplete={() => {
        if (!disposed) {
          void load()
          onchange?.()
        }
      }} />
    {/if}
  {:else if !loading}
    <Button size='sm' variant='outline' onclick={() => void load()}>{uiM('feedback_refresh')}</Button>
  {/if}
  {#if loading}
    <p role='status' class='text-sm text-base-content/70'>{uiM('feedback_loading')}</p>
  {/if}
</section>
