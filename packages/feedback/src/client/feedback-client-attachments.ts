import type { HaiResult } from '@h-ai/core'
import type { FeedbackClientSession } from './feedback-client-session.js'
import type { FeedbackClientAttachment, FeedbackClientSubmitInput } from './feedback-client-types.js'
import { core } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'
import { saveFeedbackFile } from './feedback-client-files.js'
import { annotateFeedbackImage } from './feedback-client-image.js'
import { sanitizeFeedbackData, sanitizeFeedbackText } from './feedback-client-sanitize.js'

/** 系统文件关联可能不提供 MIME；只对空值和通用二进制类型按受支持扩展名补齐。 */
function feedbackFileContentType(file: File): string | undefined {
  const type = file.type.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  const extensions = new Map([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
    ['webm', 'video/webm'],
    ['mp4', 'video/mp4'],
    ['txt', 'text/plain'],
    ['log', 'text/plain'],
    ['json', 'application/json'],
    ['pdf', 'application/pdf'],
    ['zip', 'application/zip'],
    ['gz', 'application/gzip'],
    ['tgz', 'application/gzip'],
  ])
  if (!type || type === 'application/octet-stream')
    return extensions.get(file.name.split('.').at(-1)?.toLowerCase() ?? '')
  const aliases = new Map([
    ['image/x-png', 'image/png'],
    ['image/jpg', 'image/jpeg'],
    ['image/pjpeg', 'image/jpeg'],
    ['text/json', 'application/json'],
    ['text/x-log', 'text/plain'],
    ['application/x-pdf', 'application/pdf'],
    ['application/x-zip-compressed', 'application/zip'],
    ['application/x-gzip', 'application/gzip'],
  ])
  const normalized = aliases.get(type) ?? type
  return [
    ...extensions.values(),
  ].includes(normalized)
    ? normalized
    : undefined
}

function sanitizeFeedbackJsonAttachment(raw: string): Uint8Array | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    // 原生 JSON 解析异常可能含有原始附件正文。
    return undefined
  }
  return new TextEncoder().encode(JSON.stringify(sanitizeFeedbackData(parsed)))
}

/**
 * 为附件计算摘要，生成标识并脱敏显示名称。
 * @example 模块内部上下文
 * ```ts
 * const attachment = await createFeedbackAttachment('sample.txt', 'text/plain', new TextEncoder().encode('example'))
 * const size = attachment.size
 * ```
 */
export async function createFeedbackAttachment(name: string, contentType: string, bytes: Uint8Array): Promise<FeedbackClientAttachment> {
  const checksum = await digestHex(bytes)
  return {
    id: core.id.uuid(),
    name: String(sanitizeFeedbackData({ text: name }).text).slice(0, 255),
    contentType,
    size: bytes.byteLength,
    checksum,
    bytes,
  }
}

/**
 * 以十六进制返回字节的 SHA-256，供附件与提交输入比较。
 * @example 模块内部上下文
 * ```ts
 * const fingerprint = await digestHex(new Uint8Array([1, 2, 3]))
 * ```
 */
export async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return [
    ...new Uint8Array(digest),
  ].map(value => value.toString(16).padStart(2, '0')).join('')
}

/**
 * 为单个客户端创建附件管理、预览和离线保存操作。
 * @example 模块内部上下文
 * ```ts
 * function readAttachments(session: FeedbackClientSession, schedulePersist: () => void, signal: AbortSignal) {
 *   const attachments = createFeedbackAttachments(session, schedulePersist, () => signal)
 *   return attachments.getView().attachments
 * }
 * ```
 */
export function createFeedbackAttachments(
  session: FeedbackClientSession,
  schedulePersist: () => void,
  getSaveSignal: () => AbortSignal,
) {
  const previews = new Map<string, { checksum: string, url: string }>()

  function releasePreviews() {
    for (const preview of previews.values()) URL.revokeObjectURL(preview.url)
    previews.clear()
  }

  function getView() {
    const files = session.draft?.attachments ?? []
    for (const [id, preview] of previews) {
      if (!files.some(file => file.id === id && file.checksum === preview.checksum)) {
        URL.revokeObjectURL(preview.url)
        previews.delete(id)
      }
    }
    return {
      attachments: files.map((file) => {
        let preview = previews.get(file.id)
        if (!preview) {
          preview = {
            checksum: file.checksum,
            url: URL.createObjectURL(new Blob([new Uint8Array(file.bytes).buffer], { type: file.contentType })),
          }
          previews.set(file.id, preview)
        }
        return {
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.contentType,
          url: preview.url,
        }
      }),
      evidence: session.draft?.evidence ?? [],
      missing: session.draft?.missing ?? [],
      budget: { ...session.budget },
    }
  }

  async function annotate(id: string, mark: Parameters<typeof annotateFeedbackImage>[1]): Promise<HaiResult<void>> {
    if (!session.draft || session.closing)
      return session.failure('NOT_INITIALIZED')
    const current = session.draft
    const item = current.attachments.find(value => value.id === id)
    if (!item || current.submission)
      return session.failure('INVALID_INPUT')
    const originalBytes = item.bytes
    try {
      const bytes = await annotateFeedbackImage(originalBytes, mark)
      const name = /\.[^.]+$/.test(item.name)
        ? item.name.replace(/\.[^.]+$/, '.png')
        : `${item.name}.png`
      const updated = await createFeedbackAttachment(name, 'image/png', bytes)
      if (updated.size > session.budget.maxAttachmentBytes || current.attachments.reduce((sum, file) => sum + (file === item
        ? 0
        : file.size), updated.size) > session.budget.maxAttachmentsBytes) {
        return session.failure('LIMIT_EXCEEDED')
      }
      // 渲染/摘要结束后再原子替换；提交、关闭、删除或另一标注不能被旧异步结果覆盖。
      if (session.closing || session.draft !== current || current.submission || !current.attachments.includes(item) || item.bytes !== originalBytes)
        return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
      Object.assign(item, updated, { id })
      schedulePersist()
      return core.ok(undefined)
    }
    catch (cause) {
      return session.failure('OPERATION_FAILED', cause)
    }
  }

  async function addFiles(files: readonly File[], removedAttachmentIds: readonly string[] = []): Promise<HaiResult<void>> {
    if (!session.draft)
      return session.failure('NOT_INITIALIZED')
    if (session.draft.submission && (files.length || removedAttachmentIds.length))
      return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
    const current = session.draft
    const items: FeedbackClientAttachment[] = []
    const newMissing: string[] = []
    try {
      for (const file of files) {
        if (items.length >= session.budget.maxAttachmentCount || file.size > session.budget.maxAttachmentBytes)
          return session.failure('LIMIT_EXCEEDED')
        const contentType = feedbackFileContentType(file)
        if (!contentType)
          return session.failure('INVALID_INPUT', undefined, feedbackM('feedback_unsupportedAttachmentType'))
        let bytes: Uint8Array | undefined
        if (contentType.startsWith('text/') || contentType === 'application/json') {
          const raw = await file.text()
          if (contentType === 'application/json' && raw.length > 8192)
            newMissing.push(`attachment-text-truncated:${String(sanitizeFeedbackData({ text: file.name }).text).slice(0, 100)}`)
          bytes = contentType === 'application/json'
            ? sanitizeFeedbackJsonAttachment(raw)
            : new TextEncoder().encode(sanitizeFeedbackText(raw))
        }
        else {
          bytes = new Uint8Array(await file.arrayBuffer())
        }
        if (!bytes)
          return session.failure('INVALID_INPUT')
        if (bytes.byteLength > session.budget.maxAttachmentBytes)
          return session.failure('LIMIT_EXCEEDED')
        const item = await createFeedbackAttachment(file.name, contentType, bytes)
        if (!items.some(existing => existing.name === item.name && existing.checksum === item.checksum))
          items.push(item)
      }
      // 读取/摘要计算期间草稿可能切换或冻结；失败批次不能留下附件或缺失标记。
      if (session.draft !== current || session.closing)
        return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
      if (current.submission && (files.length || removedAttachmentIds.length))
        return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_retryInputChanged'))
      // 在最新附件上合并，保留读取期间另一成功批次的新增项；最终校验与提交之间没有 await。
      const merged = current.attachments.filter(file => !removedAttachmentIds.includes(file.id))
      for (const item of items) {
        if (!merged.some(existing => existing.name === item.name && existing.checksum === item.checksum))
          merged.push(item)
      }
      if (merged.length > session.budget.maxAttachmentCount || merged.reduce((total, item) => total + item.size, 0) > session.budget.maxAttachmentsBytes)
        return session.failure('LIMIT_EXCEEDED')
      current.attachments = merged
      current.missing.push(...newMissing)
      schedulePersist()
      return core.ok(undefined)
    }
    catch (cause) {
      return session.failure('INVALID_INPUT', cause)
    }
  }

  async function exportDraft(input: FeedbackClientSubmitInput = {}): Promise<HaiResult<Uint8Array>> {
    const current = session.draft
    const activeConfig = session.config
    if (!current || !activeConfig || session.closing)
      return session.failure('NOT_INITIALIZED')
    try {
      const { feedback: bundleFeedback } = await import('../bundle/index.js')
      if (session.closing || session.draft !== current || session.config !== activeConfig)
        return session.failure('NOT_INITIALIZED')
      let attachments = current.attachments.filter(item => !input.removedAttachmentIds?.includes(item.id))
      if (!current.submission) {
        const added = await addFiles(input.files ?? [])
        if (!added.success)
          return added
        attachments = current.attachments.filter(item => !input.removedAttachmentIds?.includes(item.id))
      }
      else {
        // 离线兜底保留失败后新增的本地文件，但不改变已发送包络或后续上传队列。
        for (const file of input.files ?? []) {
          if (attachments.length >= session.budget.maxAttachmentCount || file.size > session.budget.maxAttachmentBytes)
            return session.failure('LIMIT_EXCEEDED')
          const contentType = feedbackFileContentType(file)
          if (!contentType)
            return session.failure('INVALID_INPUT', undefined, feedbackM('feedback_unsupportedAttachmentType'))
          const bytes = contentType === 'application/json'
            ? sanitizeFeedbackJsonAttachment(await file.text())
            : contentType.startsWith('text/')
              ? new TextEncoder().encode(sanitizeFeedbackText(await file.text()))
              : new Uint8Array(await file.arrayBuffer())
          if (!bytes)
            return session.failure('INVALID_INPUT')
          if (bytes.byteLength > session.budget.maxAttachmentBytes)
            return session.failure('LIMIT_EXCEEDED')
          const item = await createFeedbackAttachment(file.name, contentType, bytes)
          if (!attachments.some(existing => existing.name === item.name && existing.checksum === item.checksum))
            attachments.push(item)
        }
      }
      if (session.closing || session.draft !== current || session.config !== activeConfig)
        return session.failure('NOT_INITIALIZED')
      if (attachments.reduce((total, item) => total + item.size, 0) > session.budget.maxAttachmentsBytes)
        return session.failure('LIMIT_EXCEEDED')
      const { submission, report } = current
      const description = input.description ?? report?.description ?? submission?.description ?? ''
      const category = input.category ?? report?.category ?? submission?.category
      const contact = input.contact ?? report?.contact ?? submission?.contact
      return bundleFeedback.createBundle({
        maxBytes: session.budget.maxTotalBytes,
        report: {
          ...(report ?? {
            id: current.submissionId,
            appId: submission ? submission.appId : activeConfig.appId,
            appVersion: submission ? submission.appVersion : activeConfig.appVersion,
            buildId: submission ? submission.buildId : activeConfig.buildId,
            commit: submission ? submission.commit : activeConfig.commit,
            url: submission?.url ?? current.evidence.filter(item => item.kind === 'environment').at(-1)?.data.url,
            anchor: submission?.anchor ?? { kind: current.anchorKind, timestamp: current.anchorTime, errorId: current.errorId },
            evidenceRevision: 1,
          }),
          ...sanitizeFeedbackData({
            description,
            ...(category === undefined
              ? {}
              : { category }),
            ...(contact === undefined
              ? {}
              : { contact }),
          }),
        },
        evidence: current.evidence,
        attachments,
        missing: [
          ...new Set([
            ...current.missing,
            ...session.missing,
            'server-evidence-not-obtained',
            ...(!report
              ? ['feedback-not-yet-accepted']
              : []),
          ]),
        ],
      })
    }
    catch (cause) {
      return session.failure('OPERATION_FAILED', cause)
    }
  }

  async function saveDraft(input?: FeedbackClientSubmitInput) {
    const config = session.config
    const current = session.draft
    const exported = await exportDraft(input)
    if (!exported.success)
      return exported
    if (session.closing || !config || config !== session.config || current !== session.draft)
      return session.failure('NOT_INITIALIZED')
    return saveFeedbackFile(exported.data, `feedback-${current?.submissionId ?? 'local'}.zip`, 'application/zip', getSaveSignal())
  }

  return {
    getView,
    releasePreviews,
    annotate,
    addFiles,
    exportDraft,
    saveDraft,
  }
}
