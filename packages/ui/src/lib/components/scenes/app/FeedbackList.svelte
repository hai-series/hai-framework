<!--
  @component FeedbackList
  反馈管理列表；分页、筛选及操作通过宿主回调接入，列表不读取完整材料。
  @example
  ```ts
  import type { ComponentProps } from 'svelte'
  import { FeedbackList } from '@h-ai/ui'
  const props: ComponentProps<typeof FeedbackList> = { data: { items: [], total: 0, page: 1, pageSize: 20 } }
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { FeedbackListQuery, FeedbackPage, FeedbackPermissions, FeedbackReportView, FeedbackStatusChange } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import DataTable from '../../compounds/DataTable.svelte'
  import Pagination from '../../compounds/Pagination.svelte'
  import TableToolbar from '../../compounds/TableToolbar.svelte'
  import Badge from '../../primitives/Badge.svelte'
  import Button from '../../primitives/Button.svelte'
  import { collectionLabel, feedbackTime, notificationLabel } from './feedback-functions.js'

  let {
    data,
    query = $bindable(),
    permissions = {},
    loading = false,
    error = '',
    onquerychange,
    onview,
    onstatus,
    onexport,
    onretry,
    class: className = '',
    ...restProps
  }: {
    data: FeedbackPage<FeedbackReportView>
    query?: FeedbackListQuery
    permissions?: FeedbackPermissions
    loading?: boolean
    error?: string
    onquerychange?: (query: FeedbackListQuery) => void | Promise<void>
    onview?: (report: FeedbackReportView) => void | Promise<void>
    onstatus?: (change: FeedbackStatusChange) => void | Promise<void>
    onexport?: (report: FeedbackReportView) => void | Promise<void>
    onretry?: (report: FeedbackReportView) => void | Promise<void>
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const effectiveQuery = $derived(query ?? { page: data.page, pageSize: data.pageSize })
  const pageSizeOptions = $derived([...new Set([data.pageSize, 10, 20, 50, 100])].sort((left, right) => left - right))
  let actionError = $state('')
  let busyId = $state('')
  let search = $derived(effectiveQuery.search ?? '')
  let sortDirection = $derived(effectiveQuery.sortDirection ?? 'desc')
  let filterValues = $derived<Record<string, unknown>>({ status: effectiveQuery.status ?? '', collectionStatus: effectiveQuery.collectionStatus ?? '', appId: effectiveQuery.appId ?? '', appVersion: effectiveQuery.appVersion ?? '', from: effectiveQuery.from ? new Date(effectiveQuery.from).toISOString().slice(0, 10) : '', to: effectiveQuery.to ? new Date(effectiveQuery.to).toISOString().slice(0, 10) : '' })
  const columns = $derived([
    { key: 'number', label: uiM('feedback_number') },
    { key: 'description', label: uiM('feedback_summary') },
    { key: 'appId', label: uiM('feedback_application') },
    { key: 'appVersion', label: uiM('feedback_version') },
    { key: 'userId', label: uiM('feedback_submitter') },
    { key: 'createdAt', label: uiM('feedback_created_at'), sortable: true },
    { key: 'status', label: uiM('feedback_processing') },
    { key: 'collectionStatus', label: uiM('feedback_collection') },
    { key: 'notificationStatus', label: uiM('feedback_notification') },
  ])
  const filterFields = $derived([
    { id: 'status', label: uiM('feedback_processing'), type: 'select', options: [{ label: uiM('feedback_pending'), value: 'pending' }, { label: uiM('feedback_handled'), value: 'handled' }] },
    { id: 'collectionStatus', label: uiM('feedback_collection'), type: 'select', options: ['collecting', 'complete', 'partial', 'failed'].map(value => ({ value, label: collectionLabel(value as FeedbackReportView['collectionStatus']) })) },
    { id: 'appId', label: uiM('feedback_application'), type: 'text' },
    { id: 'appVersion', label: uiM('feedback_version'), type: 'text' },
    { id: 'createdAt', label: uiM('feedback_date_range'), type: 'date-range', startKey: 'from', endKey: 'to' },
  ])

  async function update(next: Partial<FeedbackListQuery>) {
    query = { ...effectiveQuery, ...next }
    actionError = ''
    try {
      await onquerychange?.(query)
    }
    catch (cause) {
      actionError = cause instanceof Error ? cause.message : uiM('feedback_action_failed')
    }
  }
  function filter(values: Record<string, unknown>) {
    const from = values.from ? Date.parse(String(values.from)) : undefined
    const to = values.to ? Date.parse(String(values.to)) + 86_400_000 - 1 : undefined
    void update({ page: 1, status: values.status === 'pending' || values.status === 'handled' ? values.status : undefined, collectionStatus: ['collecting', 'complete', 'partial', 'failed'].includes(String(values.collectionStatus)) ? values.collectionStatus as FeedbackReportView['collectionStatus'] : undefined, appId: String(values.appId ?? '') || undefined, appVersion: String(values.appVersion ?? '') || undefined, from: Number.isFinite(from) ? from : undefined, to: Number.isFinite(to) ? to : undefined })
  }
  async function run(report: FeedbackReportView, action: (() => void | Promise<void>) | undefined) {
    if (!action || busyId)
      return
    busyId = report.id
    actionError = ''
    try {
      await action()
    }
    catch (cause) {
      actionError = cause instanceof Error ? cause.message : uiM('feedback_action_failed')
    }
    finally {
      busyId = ''
    }
  }
</script>

<section {...dataAttributes} class={`feedback-list flex min-h-0 min-w-0 flex-1 flex-col gap-3 ${className}`} aria-label={uiM('feedback_list_title')}>
  {#if permissions.read === false}
    <p role='alert' class='alert alert-warning'>{uiM('feedback_permission_denied')}</p>
  {:else}
    <TableToolbar bind:searchValue={search} {filterFields} bind:filterValues sortableColumns={[{ key: 'createdAt', label: uiM('feedback_created_at') }]} sortBy='createdAt' bind:sortDirection searchPlaceholder={uiM('feedback_search')} onsearch={value => update({ page: 1, search: value || undefined })} onfilterchange={filter} onclearfilters={() => update({ page: 1, status: undefined, collectionStatus: undefined, appId: undefined, appVersion: undefined, from: undefined, to: undefined })} onsort={(_, direction) => update({ page: 1, sortDirection: direction })}>
      {#snippet leading()}<h2 class='font-semibold text-lg'>{uiM('feedback_list_title')}</h2>{/snippet}
    </TableToolbar>
    {#if error || actionError}<p role='alert' class='alert alert-error break-words'>{error || actionError}</p>{/if}
    <div class='min-h-0 min-w-0 flex-1 overflow-hidden'>
      <DataTable data={data.items} {columns} keyField='id' density='compact' {loading} sortKey='createdAt' sortDir={sortDirection} onsort={(_, direction) => update({ page: 1, sortDirection: direction })} class='h-full'>
        {#snippet cell(item, key)}
          {#if key === 'number'}
            {#if onview}<Button size='xs' variant='ghost' onclick={() => run(item, () => onview(item))}>{item.number}</Button>{:else}{item.number}{/if}
          {:else if key === 'description'}<span class='block max-w-sm truncate' title={item.description || item.summary || uiM('feedback_no_description')}>{item.description || item.summary || uiM('feedback_no_description')}</span>
          {:else if key === 'appId'}{item.appId}
          {:else if key === 'appVersion'}{item.appVersion || '—'}
          {:else if key === 'userId'}{item.userId || '—'}
          {:else if key === 'createdAt'}{feedbackTime(item.createdAt)}
          {:else if key === 'status'}<Badge size='sm' variant={item.status === 'handled' ? 'success' : 'ghost'}>{uiM(item.status === 'handled' ? 'feedback_handled' : 'feedback_pending')}</Badge>
          {:else if key === 'collectionStatus'}<span class:text-warning={item.collectionStatus === 'failed' || item.collectionStatus === 'partial'}>{collectionLabel(item.collectionStatus)}</span>
          {:else if key === 'notificationStatus'}{notificationLabel(item.notificationStatus)}{/if}
        {/snippet}
        {#snippet actions(item)}
          <div class='flex flex-wrap items-center gap-1'>
            {#if onview}<Button size='xs' variant='ghost' disabled={Boolean(busyId)} onclick={() => run(item, () => onview(item))}>{uiM('feedback_details')}</Button>{/if}
            {#if onstatus && ((item.status === 'pending' && permissions.process) || (item.status === 'handled' && permissions.reopen))}
              <Button size='xs' variant='ghost' loading={busyId === item.id} disabled={Boolean(busyId)} onclick={() => run(item, () => onstatus({ id: item.id, status: item.status === 'pending' ? 'handled' : 'pending', expectedVersion: item.version }))}>{uiM(item.status === 'pending' ? 'feedback_handle' : 'feedback_reopen')}</Button>
            {/if}
            {#if permissions.export && onexport}<Button size='xs' variant='ghost' disabled={Boolean(busyId)} onclick={() => run(item, () => onexport(item))}>{uiM('feedback_export')}</Button>{/if}
            {#if permissions.retry && onretry && (item.collectionStatus === 'partial' || item.collectionStatus === 'failed' || item.notificationStatus === 'failed')}<Button size='xs' variant='ghost' disabled={Boolean(busyId)} onclick={() => run(item, () => onretry(item))}>{uiM('feedback_retry')}</Button>{/if}
          </div>
        {/snippet}
      </DataTable>
    </div>
    <div class='shrink-0 rounded-lg border border-base-content/10 bg-base-100 px-3 py-2 overflow-x-auto'>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} {pageSizeOptions} showSizeChanger showJumper onchange={page => update({ page })} onpagesizechange={pageSize => update({ page: 1, pageSize })} />
    </div>
  {/if}
</section>
