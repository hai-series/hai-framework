/** 反馈页面的 API 与采集编排；界面仅调用这些动作。 */
import type { FeedbackEvidence, FeedbackListInput } from '@h-ai/api-contract/feedback'
import type { FeedbackAnnotation, FeedbackFormData, FeedbackListQuery } from '@h-ai/ui/components/scenes/app/index'
import { adminBuildMetadata } from '$lib/build-metadata.js'
import * as m from '$lib/paraglide/messages.js'
import { apiFetch, observeAdminRequests } from '$lib/utils/api.js'
import { feedbackApiBaseUrl } from '$lib/utils/feedback-browser.js'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { createFeedbackClient, createFeedbackReview } from '@h-ai/feedback/client'

const http = apiClient.create(apiContract.create({ feedback: apiContract.feedback }))
const capture = createFeedbackClient()
let initialize: Promise<void> | undefined
let stopRequests: (() => void) | undefined
const review = createFeedbackReview(http.feedback.reports)

export async function initFeedbackBrowser(): Promise<void> {
  initialize ??= (async () => {
    const initialized = await http.init({ baseUrl: feedbackApiBaseUrl(), fetch: apiFetch, clientName: 'admin-console' })
    if (!initialized.success)
      throw new Error(initialized.error.message)
    const result = await capture.init({ appId: 'admin-console', ...adminBuildMetadata, cookieAllowlist: ['PARAGLIDE_LOCALE', 'theme'], replay: true, actions: {
      policy: () => http.feedback.reports.policy({}),
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

export function pauseFeedback() {
  capture.pause()
}

export function feedbackDraftView() {
  const draft = capture.getDraft()
  return {
    ...capture.getView(),
    evidenceSummary: [{ label: m.feedback_material_missing(), count: draft?.missing.length ?? 0, status: draft?.missing.length ? 'partial' as const : 'complete' as const, detail: draft?.missing.join(', ') }],
  }
}

export async function submitFeedback(input: FeedbackFormData) {
  const result = await capture.submit({ description: input.description, category: input.type, contact: input.contact, files: input.files, removedAttachmentIds: input.removedAttachmentIds })
  if (!result.success)
    throw new Error(result.error.message)
  return { number: result.data.number, collectionStatus: result.data.collectionStatus }
}

export async function annotateFeedback(input: FeedbackAnnotation) {
  const result = await capture.annotate(input.id, { mode: input.mode, ...input.rect, coordinateSpace: 'ratio' })
  if (!result.success)
    throw new Error(result.error.message)
  return feedbackDraftView()
}

export async function captureFeedbackPage(attachmentId?: string) {
  const result = await capture.captureScreenshot(attachmentId)
  if (!result.success)
    throw new Error(result.error.message)
  return feedbackDraftView()
}

export async function addFeedbackFiles(files: File[], removedAttachmentIds: readonly string[] = []) {
  const result = await capture.addFiles(files, removedAttachmentIds)
  if (!result.success)
    throw new Error(result.error.message)
  return feedbackDraftView()
}

export async function exportLocalFeedback(input: FeedbackFormData) {
  const result = await capture.saveDraft({ ...input, category: input.type })
  if (!result.success)
    throw new Error(result.error.message)
  return result.data.status !== 'cancelled'
}

export function feedbackDraftId() {
  return capture.getDraft()?.submissionId ?? ''
}

export function feedbackListParameters(query: FeedbackListQuery): FeedbackListInput {
  return { page: query.page, pageSize: query.pageSize, status: query.status, collectionStatus: query.collectionStatus, appId: query.appId, appVersion: query.appVersion, search: query.search, from: query.from, to: query.to, sortDirection: query.sortDirection }
}

export const feedbackApi = http

export async function retryFeedback(id: string) {
  const result = await review.retryReport(id)
  if (!result.success)
    throw new Error(result.error.message)
}

export async function loadFeedbackReplay(id: string): Promise<FeedbackEvidence[]> {
  const result = await review.loadReplay(id)
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

export async function exportFeedback(id: string) {
  const result = await review.exportReport(id)
  if (!result.success)
    throw new Error(result.error.message)
}

export async function closeFeedbackBrowser() {
  stopRequests?.()
  stopRequests = undefined
  review.close()
  await capture.close({ discard: true })
  await http.close()
  initialize = undefined
}
