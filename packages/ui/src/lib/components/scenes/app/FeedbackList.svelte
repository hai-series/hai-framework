<!-- @component FeedbackList 分页查看本人或有权处理的反馈并进入对话。 -->
<script lang='ts'>
  import type { FeedbackReport, FeedbackStatus } from '@h-ai/api-contract/feedback'
  import type { FeedbackViewActions } from './feedback-types.js'
  import { onMount } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { errorMessage, useToastFeedback } from '../../../toast.svelte.js'
  import Pagination from '../../compounds/Pagination.svelte'
  import Button from '../../primitives/Button.svelte'
  import { statusLabel } from './feedback-functions.js'
  import FeedbackDetail from './FeedbackDetail.svelte'

  interface Props {
    actions: FeedbackViewActions
    canProcess?: boolean
    canReply?: boolean
    initialId?: string
  }

  const { actions, canProcess = false, canReply = true, initialId }: Props = $props()
  let selected = $state<string>()
  let items = $state<FeedbackReport[]>([])
  let page = $state(1)
  let pageSize = $state(20)
  let total = $state(0)
  let status = $state<FeedbackStatus | ''>('')
  let error = $state('')
  let loading = $state(true)
  let request = 0
  let disposed = false

  async function load(nextPage = 1) {
    const current = ++request
    error = ''
    loading = true
    try {
      const result = await actions.list({ page: nextPage, status: status || undefined })
      if (disposed || current !== request)
        return
      if (!result.success) {
        error = errorMessage(result.error, uiM('feedback_action_failed'))
        return
      }
      items = result.data.items
      page = result.data.page
      pageSize = result.data.pageSize
      total = result.data.total
    }
    catch (cause) {
      if (!disposed && current === request)
        error = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      if (!disposed && current === request)
        loading = false
    }
  }

  function showList() {
    selected = undefined
    void load(page)
  }

  onMount(() => {
    selected = initialId
    if (!selected)
      void load()
    return () => {
      disposed = true
    }
  })
  useToastFeedback(() => error)
</script>

<section class='feedback-list min-w-0 space-y-3' aria-label={uiM('feedback_list_title')}>
  {#if selected}
    <Button size='sm' variant='ghost' onclick={showList}>{uiM('feedback_back_to_list')}</Button>
    {#key selected}
      <FeedbackDetail id={selected} {actions} {canProcess} {canReply} />
    {/key}
  {:else}
    <div class='flex flex-wrap items-center gap-2'>
      <label class='flex items-center gap-2 text-sm'>
        {uiM('feedback_processing')}
        <select class='select select-sm' bind:value={status} onchange={() => void load()}>
          <option value=''>{uiM('feedback_all_statuses')}</option>
          <option value='pending'>{statusLabel('pending')}</option>
          <option value='awaiting_user'>{statusLabel('awaiting_user')}</option>
          <option value='handled'>{statusLabel('handled')}</option>
        </select>
      </label>
      <Button size='sm' variant='ghost' disabled={loading} onclick={() => void load(page)}>{uiM('feedback_refresh')}</Button>
    </div>
    {#if !loading && !items.length && !error}
      <p class='py-4 text-sm text-base-content/70'>{uiM('feedback_empty')}</p>
    {/if}
    {#if loading}
      <p role='status' class='text-sm text-base-content/70'>{uiM('feedback_loading')}</p>
    {/if}
    <ul class='divide-y divide-base-content/10 rounded-xl border border-base-content/15'>
      {#each items as report (report.id)}
        <li class='flex min-w-0 items-start gap-3 p-3'>
          <button type='button' class='min-w-0 flex-1 cursor-pointer text-left hover:text-primary' onclick={() => { selected = report.id }}>
            <span class='line-clamp-2 break-words'>{report.body || uiM('feedback_attachments')}</span>
            <time datetime={new Date(report.updatedAt).toISOString()} class='text-xs text-base-content/70'>{new Date(report.updatedAt).toLocaleString()}</time>
          </button>
          <span class='badge badge-outline'>{statusLabel(report.status)}</span>
        </li>
      {/each}
    </ul>
    {#if total > pageSize}
      <Pagination {page} {pageSize} {total} size='sm' onchange={value => void load(value)} />
    {/if}
  {/if}
</section>
