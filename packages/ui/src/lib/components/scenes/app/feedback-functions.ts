import type { FeedbackAttachmentData, FeedbackAttachmentInput, FeedbackStatus } from '@h-ai/api-contract/feedback'
import { uiM } from '../../../messages.js'

const statusLabels = {
  pending: 'feedback_pending',
  awaiting_user: 'feedback_awaiting_user',
  handled: 'feedback_handled',
} as const

export function statusLabel(status: FeedbackStatus) {
  return uiM(statusLabels[status])
}

export async function encodeFeedbackFile(file: File): Promise<FeedbackAttachmentInput> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks: string[] = []
  for (let start = 0; start < bytes.length; start += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 32768)))
  return {
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    dataBase64: btoa(chunks.join('')),
  }
}

export function isPreviewImage(contentType: string) {
  return [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ].includes(contentType)
}

export function createFeedbackFileUrl(file: FeedbackAttachmentData, preview: boolean) {
  const bytes = Uint8Array.from(atob(file.dataBase64), character => character.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], {
    type: preview && isPreviewImage(file.contentType)
      ? file.contentType
      : 'application/octet-stream',
  }))
}
