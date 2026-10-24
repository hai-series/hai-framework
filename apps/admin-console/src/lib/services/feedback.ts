/** 反馈页面的 API 与采集编排；界面仅调用这些动作。 */
import type { FeedbackListInput } from '@h-ai/api-contract/feedback'
import type { FeedbackAnnotation, FeedbackFormData, FeedbackListQuery } from '@h-ai/ui/components/scenes/app/index'
import { adminBuildMetadata } from '$lib/build-metadata.js'
import * as m from '$lib/paraglide/messages.js'
import { apiFetch, observeAdminRequests } from '$lib/utils/api.js'
import { downloadFeedbackBytes, feedbackApiBaseUrl, feedbackBase64Bytes, feedbackBlobUrl, feedbackImageSize } from '$lib/utils/feedback-browser.js'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { createFeedbackClient } from '@h-ai/feedback/client'

const http = apiClient.create(apiContract.create({ feedback: apiContract.feedback }))
const capture = createFeedbackClient()
let initialize: Promise<void> | undefined
let stopRequests: (() => void) | undefined
const previewUrls = new Set<string>()

export async function initFeedbackBrowser(): Promise<void> {
  initialize ??= (async () => {
    const initialized = await http.init({ baseUrl: feedbackApiBaseUrl(), fetch: apiFetch, clientName: 'admin-console' })
    if (!initialized.success)
      throw new Error(initialized.error.message)
    const result = await capture.init({ appId: 'admin-console', ...adminBuildMetadata, cookieAllowlist: ['PARAGLIDE_LOCALE', 'theme'], actions: {
      submit: input => http.feedback.reports.submit(input),
      appendEvidence: input => http.feedback.reports.appendEvidence(input),
      completeCollection: input => http.feedback.reports.completeCollection(input),
      upload: input => http.feedback.attachments.upload(input),
    } })
    if (!result.success)
      throw new Error(result.error.message)
    stopRequests = observeAdminRequests((data) => {
      capture.record({ kind: 'request', data, requestId: typeof data.requestId === 'string' ? data.requestId : undefined })
    })
  })().catch((error) => {
    initialize = undefined
    throw error
  })
  return initialize
}

export async function prepareFeedback() {
  await initFeedbackBrowser()
  const result = await capture.prepare()
  if (!result.success)
    throw new Error(result.error.message)
  return feedbackDraftView()
}

export function feedbackDraftView() {
  for (const url of previewUrls)
    URL.revokeObjectURL(url)
  previewUrls.clear()
  const draft = capture.getDraft()
  return {
    attachments: (draft?.attachments ?? []).map((item) => {
      const url = feedbackBlobUrl(item.bytes, item.contentType)
      previewUrls.add(url)
      return { id: item.id, name: item.name, mimeType: item.contentType, size: item.size, url }
    }),
    evidenceSummary: [{ label: m.feedback_material_logs(), count: draft?.evidence.length ?? 0, status: 'complete' as const }, { label: m.feedback_material_missing(), count: draft?.missing.length ?? 0, status: draft?.missing.length ? 'partial' as const : 'complete' as const, detail: draft?.missing.join(', ') }],
  }
}

export async function submitFeedback(input: FeedbackFormData) {
  const result = await capture.submit({ description: input.description, category: input.type, contact: input.contact, files: input.files, removedAttachmentIds: input.removedAttachmentIds })
  if (!result.success)
    throw new Error(result.error.message)
  return { number: result.data.number, collectionStatus: result.data.collectionStatus }
}

export async function annotateFeedback(input: FeedbackAnnotation) {
  const attachment = capture.getDraft()?.attachments.find(item => item.id === input.id)
  if (!attachment)
    throw new Error(m.feedback_request_failed())
  const dimensions = await feedbackImageSize(attachment.bytes, attachment.contentType)
  const result = await capture.annotate(input.id, { mode: input.mode, x: input.rect.x * dimensions.width, y: input.rect.y * dimensions.height, width: input.rect.width * dimensions.width, height: input.rect.height * dimensions.height })
  if (!result.success)
    throw new Error(result.error.message)
  return feedbackDraftView()
}

export async function addFeedbackFiles(files: File[]) {
  const result = await capture.addFiles(files)
  if (!result.success)
    throw new Error(result.error.message)
  return feedbackDraftView()
}

export async function exportLocalFeedback(input: FeedbackFormData) {
  const result = await capture.exportDraft({ ...input, category: input.type })
  if (!result.success)
    throw new Error(result.error.message)
  downloadFeedbackBytes('feedback-local.zip', result.data)
}

export function feedbackDraftId() {
  return capture.getDraft()?.submissionId ?? ''
}

export function feedbackListParameters(query: FeedbackListQuery): FeedbackListInput {
  return { page: query.page, pageSize: query.pageSize, status: query.status, collectionStatus: query.collectionStatus, appId: query.appId, appVersion: query.appVersion, search: query.search, from: query.from, to: query.to, sortDirection: query.sortDirection }
}

export const feedbackApi = http

export async function exportFeedback(id: string) {
  const job = await http.feedback.reports.export({ id })
  if (!job.success)
    throw new Error(job.error.message)
  for (let attempt = 0; attempt < 60; attempt++) {
    const exported = await http.feedback.reports.getExport({ id, jobId: job.data.id })
    if (exported.success) {
      downloadFeedbackBytes(exported.data.name, feedbackBase64Bytes(exported.data.dataBase64), exported.data.contentType)
      return
    }
    if (exported.error.httpStatus !== 409)
      throw new Error(exported.error.message)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(m.feedback_export_pending())
}

export async function closeFeedbackBrowser() {
  stopRequests?.()
  stopRequests = undefined
  await capture.close()
  await http.close()
  for (const url of previewUrls)
    URL.revokeObjectURL(url)
  previewUrls.clear()
  initialize = undefined
}
