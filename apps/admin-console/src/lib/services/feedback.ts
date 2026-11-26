import type { HaiResult } from '@h-ai/core'
import type { FeedbackSubmitAction, FeedbackViewActions } from '@h-ai/ui'
import { resolve } from '$app/paths'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { apiFetch } from '#lib/utils/api.js'

const http = apiClient.create(apiContract.create({ feedback: apiContract.feedback }))
const { reports, attachments } = http.feedback
let initialization: Promise<HaiResult<void>> | undefined

async function request<T>(action: () => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
  const base = resolve('/').replace(/\/$/, '')
  const pending = initialization ??= http.init({
    baseUrl: new URL(`${base}/api`, location.origin).href,
    fetch: apiFetch,
    clientName: 'admin-console',
  })
  const ready = await pending
  if (!ready.success) {
    if (initialization === pending)
      initialization = undefined
    return ready
  }
  return action()
}

export const submitFeedback: FeedbackSubmitAction = input => request(() => reports.submit(input))

const detail: Omit<FeedbackViewActions, 'list'> = {
  get: input => request(() => reports.get(input)),
  listMessages: input => request(() => reports.listMessages(input)),
  addMessage: input => request(() => reports.addMessage(input)),
  getAttachment: input => request(() => attachments.get(input)),
}

export const myFeedbackActions: FeedbackViewActions = {
  ...detail,
  list: input => request(() => reports.listMine(input)),
}
export const staffFeedbackActions: FeedbackViewActions = {
  ...detail,
  list: input => request(() => reports.list(input)),
  setStatus: input => request(() => reports.setStatus(input)),
}
