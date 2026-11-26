import type { FeedbackAttachmentData, FeedbackAttachmentInput, FeedbackAttachmentKind, FeedbackCaptureInput, FeedbackStatus } from '@h-ai/api-contract/feedback'
import { uiM } from '../../../messages.js'

const statusLabels = {
  pending: 'feedback_pending',
  awaiting_user: 'feedback_awaiting_user',
  handled: 'feedback_handled',
} as const

export function statusLabel(status: FeedbackStatus) {
  return uiM(statusLabels[status])
}

export const captureFiles = {
  screenshot: 'screenshot',
  browserLogs: 'browser_logs',
  replay: 'replay',
  recording: 'recording',
} as const satisfies Partial<Record<keyof FeedbackCaptureInput, FeedbackAttachmentKind>>

export type CaptureFile = keyof typeof captureFiles
export type FeedbackCaptureDraft = Partial<Record<CaptureFile, File>> & { includeServerLogs?: boolean }

export const captureFileKeys = Object.keys(captureFiles) as CaptureFile[]

export function captureSize(capture?: FeedbackCaptureDraft) {
  return captureFileKeys.reduce((sum, key) => sum + (capture?.[key]?.size ?? 0), 0)
}

export async function encodeFeedbackCapture(capture: FeedbackCaptureDraft): Promise<FeedbackCaptureInput> {
  const encoded: FeedbackCaptureInput = { includeServerLogs: capture.includeServerLogs }
  await Promise.all(captureFileKeys.map(async (key) => {
    const file = capture[key]
    if (file)
      encoded[key] = await encodeFeedbackFile(file)
  }))
  return encoded
}

export const captureLabels = {
  screenshot: 'feedback_capture_screenshot',
  browser_logs: 'feedback_capture_browser_logs',
  server_logs: 'feedback_capture_server_logs_label',
  replay: 'feedback_replay',
  recording: 'feedback_capture_recording',
} as const satisfies Record<Exclude<FeedbackAttachmentKind, 'file'>, string>

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

export function decodeFeedbackFile(file: FeedbackAttachmentData, download = false) {
  const bytes = Uint8Array.from(atob(file.dataBase64), character => character.charCodeAt(0))
  return new File([bytes], file.name, {
    type: download ? 'application/octet-stream' : file.contentType,
  })
}
