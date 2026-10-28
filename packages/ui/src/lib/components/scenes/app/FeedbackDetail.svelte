<!--
  @component FeedbackDetail
  反馈详情与分页材料展示；操作由宿主执行并回填真实版本。
  @example
  ```ts
  import type { ComponentProps } from 'svelte'
  import { FeedbackDetail } from '@h-ai/ui'
  const props: ComponentProps<typeof FeedbackDetail> = { permissions: { read: false } }
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { FeedbackAttachmentView, FeedbackEvidenceQuery, FeedbackEvidenceView, FeedbackHistoryView, FeedbackPage, FeedbackPermissions, FeedbackReportView, FeedbackStatusChange } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import { errorMessage, toast, useToastFeedback } from '../../../toast.svelte.js'
  import { getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Pagination from '../../compounds/Pagination.svelte'
  import Tabs from '../../compounds/Tabs.svelte'
  import Badge from '../../primitives/Badge.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import Textarea from '../../primitives/Textarea.svelte'
  import { collectionLabel, evidenceText, feedbackTime, imagePreviewUrl, notificationLabel } from './feedback-functions.js'
  import FeedbackReplay from './FeedbackReplay.svelte'

  let {
    report,
    evidence = { items: [], total: 0, page: 1, pageSize: 20 },
    attachments = [],
    history = [],
    webhook,
    permissions = {},
    loading = false,
    error = '',
    evidenceQuery = $bindable({ page: 1, pageSize: 20 }),
    onevidencequery,
    onstatus,
    onexport,
    onretry,
    onattachment,
    onreplay,
    onclose,
    class: className = '',
    ...restProps
  }: {
    report?: FeedbackReportView
    evidence?: FeedbackPage<FeedbackEvidenceView>
    attachments?: FeedbackAttachmentView[]
    history?: FeedbackHistoryView[]
    /** 持久 Webhook 任务的公开状态，由反馈详情 jobs 中的 webhook 项提供。 */
    webhook?: { status: 'pending' | 'running' | 'succeeded' | 'failed', attempts: number, lastError?: string }
    permissions?: FeedbackPermissions
    loading?: boolean
    error?: string
    evidenceQuery?: FeedbackEvidenceQuery
    onevidencequery?: (query: FeedbackEvidenceQuery) => void | Promise<void>
    onstatus?: (input: FeedbackStatusChange) => void | Promise<void>
    onexport?: (report: FeedbackReportView) => void | Promise<void>
    onretry?: (report: FeedbackReportView) => void | Promise<void>
    onattachment?: (attachment: FeedbackAttachmentView) => void | Promise<void>
    /** 按需取得完整回放事件；普通材料分页不能代替完整快照。 */
    onreplay?: () => Promise<FeedbackEvidenceView[]>
    onclose?: () => void
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let active = $state('overview')
  let busy = $state(false)
  let querying = $state(false)
  let actionError = $state('')
  let queryGeneration = 0
  let failedPreviews = $state<string[]>([])
  let note = $state('')
  let requestId = $derived(evidenceQuery.requestId ?? '')
  let errorId = $derived(evidenceQuery.errorId ?? '')
  let kind = $derived(evidenceQuery.kind ?? '')
  const tabs = $derived([
    { key: 'overview', label: uiM('feedback_overview') },
    { key: 'scene', label: uiM('feedback_scene') },
    { key: 'replay', label: uiM('feedback_replay') },
    { key: 'logs', label: uiM('feedback_logs') },
    { key: 'business', label: uiM('feedback_business') },
    { key: 'environment', label: uiM('feedback_environment') },
    { key: 'history', label: uiM('feedback_history') },
  ])

  async function run(action: (() => void | Promise<void>) | undefined) {
    if (!action || busy)
      return
    busy = true
    actionError = ''
    try {
      await action()
    }
    catch (cause) {
      actionError = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      busy = false
    }
  }
  async function query(next: Partial<FeedbackEvidenceQuery>) {
    evidenceQuery = { ...evidenceQuery, ...next }
    const generation = ++queryGeneration
    querying = true
    actionError = ''
    try {
      await onevidencequery?.(evidenceQuery)
    }
    catch (cause) {
      if (generation === queryGeneration)
        actionError = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      if (generation === queryGeneration)
        querying = false
    }
  }
  function changeTab(tab: string) {
    if (tab === 'environment')
      void query({ page: 1, kind: 'environment', requestId: undefined, errorId: undefined })
    else if (tab === 'scene')
      void query({ page: 1, kind: 'interaction', requestId: undefined, errorId: undefined })
    else if (tab === 'logs')
      void query({ page: 1, kind: undefined })
    else if (tab === 'business')
      void query({ page: 1, kind: 'business', requestId: undefined, errorId: undefined })
  }
  useToastFeedback(() => error || actionError)
  useToastFeedback(() => permissions.read === false ? uiM('feedback_permission_denied') : '', 'warning')
  useToastFeedback(() => failedPreviews.length ? uiM('feedback_preview_failed') : '', 'warning')
</script>

<section {...dataAttributes} class={`feedback-detail min-w-0 space-y-4 ${className}`} aria-label={uiM('feedback_details')}>
  {#if permissions.read !== false && report}
    <header class='flex flex-wrap items-center justify-between gap-3'>
      <div class='min-w-0'><h2 class='text-xl font-semibold break-all'>{report.number}</h2><p class='text-sm text-base-content/65'>{report.appId} · {report.appVersion || '—'} · {feedbackTime(report.createdAt)}</p></div>
      <div class='flex flex-wrap items-center gap-2'>
        <Badge variant={report.status === 'handled' ? 'success' : 'ghost'}>{uiM(report.status === 'handled' ? 'feedback_handled' : 'feedback_pending')}</Badge>
        {#if permissions.export && onexport}<Button size='sm' disabled={busy} onclick={() => run(() => onexport(report!))}>{uiM('feedback_export')}</Button>{/if}
        {#if onclose}<Button size='sm' variant='ghost' onclick={onclose}>{uiM('feedback_close')}</Button>{/if}
      </div>
    </header>
    {#if loading || querying}<p class='text-sm text-base-content/60' role='status'>{uiM('feedback_loading')}</p>{/if}
    <Tabs items={tabs} bind:active onchange={changeTab}>
      {#snippet children({ active: tab })}
        {#if tab === 'overview'}
          <div class='space-y-4 py-4'>
            <p class='whitespace-pre-wrap break-words'>{report.description || uiM('feedback_no_description')}</p>
            <dl class='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3'>
              <div><dt class='text-base-content/55'>{uiM('feedback_collection')}</dt><dd>{collectionLabel(report.collectionStatus)}</dd></div>
              <div><dt class='text-base-content/55'>{uiM('feedback_notification')}</dt><dd>{notificationLabel(report.notificationStatus)}</dd></div>
              {#if webhook}
                <div><dt class='text-base-content/55'>{uiM('feedback_webhook')}</dt><dd>{notificationLabel(webhook.status === 'succeeded' ? 'sent' : webhook.status === 'running' ? 'sending' : webhook.status)} · {uiM('feedback_attempts')}: {webhook.attempts}</dd>{#if webhook.lastError}<dd><Button variant='ghost' size='sm' onclick={() => toast.error(webhook!.lastError!)}>{uiM('toast_diagnostics')}</Button></dd>{/if}</div>
              {/if}
              <div><dt class='text-base-content/55'>{uiM('feedback_submitter')}</dt><dd class='break-all'>{report.userId || '—'}</dd></div>
              <div><dt class='text-base-content/55'>{uiM('feedback_revision')}</dt><dd>{report.evidenceRevision}</dd></div>
              {#if report.buildId}<div><dt class='text-base-content/55'>{uiM('feedback_build_id')}</dt><dd class='break-all'>{report.buildId}</dd></div>{/if}
              {#if report.commit}<div><dt class='text-base-content/55'>{uiM('feedback_commit')}</dt><dd class='break-all'>{report.commit}</dd></div>{/if}
            </dl>
            {#if webhook?.status === 'failed' && permissions.retry && onretry}<Button size='sm' disabled={busy} onclick={() => run(() => onretry(report!))}>{uiM('feedback_retry')}</Button>{/if}
          </div>
        {:else if tab === 'replay'}
          <div class='py-4'>
            {#if onreplay}<FeedbackReplay load={onreplay} />{:else}<p class='text-sm'>{uiM('feedback_replay_empty')}</p>{/if}
          </div>
        {:else if tab === 'scene' || tab === 'logs' || tab === 'environment' || tab === 'business'}
          <div class='space-y-4 py-4'>
            {#if tab === 'scene'}
              <div class='grid grid-cols-1 gap-3 xl:grid-cols-2'>
                {#each attachments as attachment (attachment.id)}
                  <article class='rounded-lg border border-base-content/10 p-3 min-w-0 space-y-2'>
                    <p class='font-medium text-sm break-all'>{attachment.name}</p>
                    {#if attachment.mimeType?.startsWith('image/') && imagePreviewUrl(attachment.url)}<img src={imagePreviewUrl(attachment.url)} alt={attachment.name} class='max-w-full rounded' loading='lazy' referrerpolicy='no-referrer' onerror={() => failedPreviews = [...failedPreviews, attachment.id]} onload={() => failedPreviews = failedPreviews.filter(id => id !== attachment.id)} />{/if}
                    {#if attachment.mimeType?.startsWith('video/') && imagePreviewUrl(attachment.url)}<!-- svelte-ignore a11y_media_has_caption (用户上传的无声录屏) -->
                      <video src={imagePreviewUrl(attachment.url)} controls preload='metadata' class='max-w-full rounded' aria-label={attachment.name}></video>{/if}
                    {#if attachment.missingReason}<Button size='sm' variant='ghost' onclick={() => toast.warning(`${uiM('feedback_missing')}: ${attachment.missingReason}`)}>{uiM('feedback_missing')}</Button>
                    {:else if onattachment}<Button size='sm' variant='ghost' disabled={busy} onclick={() => run(() => onattachment(attachment))}>{uiM('feedback_download')}</Button>{/if}
                  </article>
                {/each}
              </div>
            {/if}
            {#if tab === 'logs'}
              <form onsubmit={(event) => {
                event.preventDefault()
                void query({ page: 1, kind: kind || undefined, requestId: requestId || undefined, errorId: errorId || undefined })
              }}>
                <FormLayout columns={2}>
                  <FormField label={uiM('feedback_kind')}><Input bind:value={kind} /></FormField>
                  <FormField label={uiM('feedback_request_id')}><Input bind:value={requestId} /></FormField>
                  <FormField label={uiM('feedback_error_id')}><Input bind:value={errorId} /></FormField>
                  <Button type='submit' size='sm' loading={querying}>{uiM('feedback_apply_filters')}</Button>
                </FormLayout>
              </form>
            {/if}
            {#if !evidence.items.length && !loading}<p class='rounded-lg bg-base-200 p-4 text-sm text-base-content/65'>{uiM('feedback_evidence_empty')}</p>{/if}
            {#each evidence.items as item (item.id)}
              <article class='min-w-0 rounded-lg border border-base-content/10 p-3 space-y-2'>
                <div class='flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/65'><span>{feedbackTime(item.timestamp)}</span><span>{uiM('feedback_source')}: {item.source} #{item.sequence}</span><span>{item.kind}</span>{#if item.requestId}<span class='break-all'>{uiM('feedback_request_id')}: {item.requestId}</span>{/if}{#if item.errorId}<span class='text-error break-all'>{uiM('feedback_error_id')}: {item.errorId}</span>{/if}</div>
                {#if item.missingReason}<Button size='sm' variant='ghost' onclick={() => toast.warning(`${uiM('feedback_missing')}: ${item.missingReason}`)}>{uiM('feedback_missing')}</Button>{/if}
                <pre class='max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-base-200 p-3 text-xs'>{evidenceText(item.data)}</pre>
              </article>
            {/each}
            <div class='overflow-x-auto'><Pagination page={evidence.page} total={evidence.total} pageSize={evidence.pageSize} showSizeChanger onchange={page => query({ page })} onpagesizechange={pageSize => query({ page: 1, pageSize })} /></div>
          </div>
        {:else if tab === 'history'}
          <div class='space-y-4 py-4'>
            <p class='text-sm'>{uiM('feedback_notification')}: {notificationLabel(report.notificationStatus)}</p>
            {#if onstatus && ((report.status === 'pending' && permissions.process) || (report.status === 'handled' && permissions.reopen))}
              <form class='space-y-3' onsubmit={(event) => {
                event.preventDefault()
                void run(() => onstatus({ id: report!.id, status: report!.status === 'pending' ? 'handled' : 'pending', expectedVersion: report!.version, note: note.trim() || undefined }))
              }}>
                <FormLayout><FormField label={uiM('feedback_note')}><Textarea bind:value={note} maxlength={4000} disabled={busy} /></FormField></FormLayout>
                <Button type='submit' variant='primary' loading={busy}>{uiM(report.status === 'pending' ? 'feedback_handle' : 'feedback_reopen')}</Button>
              </form>
            {/if}
            {#if permissions.retry && onretry && (report.notificationStatus === 'failed' || report.collectionStatus === 'partial' || report.collectionStatus === 'failed')}<Button size='sm' disabled={busy} onclick={() => run(() => onretry(report!))}>{uiM('feedback_retry')}</Button>{/if}
            <ol class='space-y-3'>
              {#each history as change (change.id)}
                <li class='rounded-lg border border-base-content/10 p-3 text-sm'><p class='text-base-content/60'>{feedbackTime(change.createdAt)} · {change.actorId}</p><p>{uiM(change.fromStatus === 'handled' ? 'feedback_handled' : 'feedback_pending')} → {uiM(change.toStatus === 'handled' ? 'feedback_handled' : 'feedback_pending')}</p>{#if change.note}<p class='mt-1 whitespace-pre-wrap break-words'>{change.note}</p>{/if}</li>
              {/each}
            </ol>
          </div>
        {/if}
      {/snippet}
    </Tabs>
  {:else if loading}
    <p role='status'>{uiM('feedback_loading')}</p>
  {:else}
    <p class='text-sm text-base-content/60'>{uiM('feedback_empty')}</p>
  {/if}
</section>
