<!-- 反馈管理：宿主处理鉴权和请求，通用 UI 负责列表、详情与操作状态。 -->
<script lang='ts'>
  import type { FeedbackDetail as FeedbackDetailData } from '@h-ai/api-contract/feedback'
  import type { FeedbackAttachmentView, FeedbackEvidenceQuery, FeedbackEvidenceView, FeedbackListQuery, FeedbackPage, FeedbackReportView, FeedbackStatusChange } from '@h-ai/ui/components/scenes/app/index'
  import type { PageData } from './$types'
  import { goto, invalidateAll } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { exportFeedback, feedbackApi, feedbackListParameters, initFeedbackBrowser, loadFeedbackReplay, retryFeedback } from '$lib/services/feedback.js'
  import { downloadFeedbackBytes, feedbackBase64Bytes, feedbackBlobUrl } from '$lib/utils/feedback-browser.js'
  import { FeedbackDetail, FeedbackList, usePermission } from '@h-ai/ui'
  import { onDestroy, untrack } from 'svelte'
  import { SvelteURLSearchParams } from 'svelte/reactivity'

  const { data }: { data: PageData } = $props()
  const { hasPerm } = usePermission()
  const permissions = $derived({ read: hasPerm('feedback:read'), process: hasPerm('feedback:process'), reopen: hasPerm('feedback:reopen'), export: hasPerm('feedback:export'), retry: hasPerm('feedback:process') })
  let detail = $state<FeedbackDetailData>()
  let evidence = $state<FeedbackPage<FeedbackEvidenceView>>({ items: [], total: 0, page: 1, pageSize: 20 })
  let evidenceQuery = $state<FeedbackEvidenceQuery>({ page: 1, pageSize: 20 })
  let attachments = $state<FeedbackAttachmentView[]>([])
  let loading = $state(false)
  let actionError = $state('')
  let detailGeneration = 0
  let evidenceGeneration = 0
  const query = $derived({ ...data.query })
  const selectedFeedbackId = $derived(data.feedbackId)
  const reportRows = $derived({ ...data.reports, items: data.reports.items.map(reportView) })
  const history = $derived(detail?.history.map(item => ({ id: item.id, actorId: item.userId, fromStatus: item.from, toStatus: item.to, createdAt: item.timestamp, note: item.note })) ?? [])

  $effect(() => {
    const id = selectedFeedbackId
    if (id)
      untrack(() => { void view({ id }) })
  })

  function reportView(report: PageData['reports']['items'][number]): FeedbackReportView {
    return { ...report, description: report.description ?? report.summary ?? '', appVersion: report.appVersion ?? '' }
  }

  async function changeQuery(next: FeedbackListQuery) {
    const parameters = feedbackListParameters(next)
    const search = new SvelteURLSearchParams()
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== '')
        search.set(key, String(value))
    }
    await goto(resolve(`/admin/feedback?${search}`, {}), { keepFocus: true, noScroll: true, invalidateAll: true })
  }

  async function view(report: Pick<FeedbackReportView, 'id'>) {
    const generation = ++detailGeneration
    loading = true
    actionError = ''
    try {
      await initFeedbackBrowser()
      const loaded = await feedbackApi.feedback.reports.get({ id: report.id })
      if (!loaded.success)
        throw new Error(loaded.error.message)
      if (generation !== detailGeneration)
        return
      detail = loaded.data
      releaseUrls()
      attachments = loaded.data.attachments.map(item => ({ id: item.id, name: item.name, mimeType: item.contentType, size: item.size, missingReason: item.missingReason ?? (item.status === 'available' ? undefined : m.feedback_attachment_pending()) }))
      evidenceQuery = { page: 1, pageSize: 20 }
      await loadEvidence(evidenceQuery)
    }
    catch (cause) {
      if (generation === detailGeneration)
        actionError = cause instanceof Error ? cause.message : m.feedback_request_failed()
    }
    finally {
      if (generation === detailGeneration)
        loading = false
    }
  }

  async function loadEvidence(next: FeedbackEvidenceQuery) {
    if (!detail)
      return
    const id = detail.report.id
    const generation = ++evidenceGeneration
    const result = await feedbackApi.feedback.reports.getEvidence({ id, page: next.page, pageSize: next.pageSize, requestId: next.requestId || undefined, errorId: next.errorId || undefined, kind: next.kind as Parameters<typeof feedbackApi.feedback.reports.getEvidence>[0]['kind'] })
    if (!result.success)
      throw new Error(result.error.message)
    if (generation === evidenceGeneration && detail?.report.id === id)
      evidence = result.data
  }

  async function status(input: FeedbackStatusChange) {
    await initFeedbackBrowser()
    const changed = await feedbackApi.feedback.reports.setStatus(input)
    if (!changed.success)
      throw new Error(changed.error.message)
    if (detail?.report.id === input.id)
      await view(reportView(changed.data))
    await invalidateAll()
  }

  async function retry(report: FeedbackReportView) {
    await initFeedbackBrowser()
    await retryFeedback(report.id)
    await view(report)
    await invalidateAll()
  }

  async function attachment(item: FeedbackAttachmentView) {
    if (!detail)
      return
    const result = await feedbackApi.feedback.attachments.get({ id: detail.report.id, attachmentId: item.id })
    if (!result.success)
      throw new Error(result.error.message)
    const bytes = feedbackBase64Bytes(result.data.dataBase64)
    if (['image/png', 'image/jpeg', 'image/webp', 'video/webm', 'video/mp4'].includes(result.data.contentType)) {
      const url = feedbackBlobUrl(bytes, result.data.contentType)
      attachments = attachments.map(value => value.id === item.id ? { ...value, url } : value)
      return
    }
    downloadFeedbackBytes(result.data.name, bytes, result.data.contentType)
  }

  function releaseUrls() {
    for (const item of attachments) {
      if (item.url)
        URL.revokeObjectURL(item.url)
    }
  }
  async function closeDetail() {
    releaseUrls()
    detail = undefined
    detailGeneration++
    evidenceGeneration++
    if (selectedFeedbackId) {
      try {
        await changeQuery(query)
      }
      catch (cause) {
        actionError = cause instanceof Error ? cause.message : m.feedback_request_failed()
      }
    }
  }
  onDestroy(releaseUrls)
</script>

<svelte:head><title>{m.feedback_title()} - {m.app_title()}</title></svelte:head>

<div class='flex h-full min-h-0 min-w-0 flex-col gap-4' data-testid='feedback-management'>
  {#if detail}
    <div class='min-h-0 overflow-y-auto rounded-xl bg-base-100 p-4 sm:p-6'>
      <FeedbackDetail report={reportView(detail.report)} webhook={detail.jobs.find(job => job.type === 'webhook')} {evidence} {attachments} {history} {permissions} {loading} error={actionError} bind:evidenceQuery onevidencequery={loadEvidence} onreplay={() => loadFeedbackReplay(detail!.report.id)} onstatus={status} onretry={retry} onexport={report => exportFeedback(report.id)} onattachment={attachment} onclose={closeDetail} />
    </div>
  {:else}
    <FeedbackList data={reportRows} {query} {permissions} {loading} error={actionError} onquerychange={changeQuery} onview={view} onstatus={status} onretry={retry} onexport={report => exportFeedback(report.id)} />
  {/if}
</div>
