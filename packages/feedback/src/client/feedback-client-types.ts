import type { FeedbackAppendEvidenceInput, FeedbackAttachmentInput, FeedbackCompleteInput, FeedbackEvidenceInput, FeedbackReport, FeedbackSubmitInput, FeedbackUploadInput } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { FeedbackImageAnnotation } from './feedback-client-image.js'

/**
 * 宿主将鉴权后的 HTTP 客户端注入一次，采集器不依赖 UI 或服务端 SDK。
 * @example
 * ```ts
 * import type { FeedbackClientActions } from '@h-ai/feedback/client'
 * function send(actions: FeedbackClientActions) { return actions.submit({ appId: 'orders', submissionId: 'stable-1' }) }
 * ```
 */
export interface FeedbackClientActions {
  submit: (input: FeedbackSubmitInput) => Promise<HaiResult<FeedbackReport>>
  appendEvidence: (input: FeedbackAppendEvidenceInput) => Promise<HaiResult<{ acknowledged: string[], evidenceRevision: number }>>
  completeCollection: (input: FeedbackCompleteInput) => Promise<HaiResult<unknown>>
  upload: (input: FeedbackUploadInput) => Promise<HaiResult<unknown>>
}

/**
 * 浏览器仅保存已脱敏的有界材料；持久化必须由产品显式授权。
 * @example
 * ```ts
 * import type { FeedbackClientConfig } from '@h-ai/feedback/client'
 * import { createFeedbackClient } from '@h-ai/feedback/client'
 * function enable(config: FeedbackClientConfig) { return createFeedbackClient().init(config) }
 * ```
 */
export interface FeedbackClientConfig {
  appId: string
  appVersion?: string
  buildId?: string
  commit?: string
  actions: FeedbackClientActions
  cookieAllowlist?: readonly string[]
  screenshot?: boolean
  captureScreenshot?: () => Promise<Uint8Array>
  screenshotTimeoutMs?: number
  keyScreenshots?: boolean
  maxKeyScreenshots?: number
  keyScreenshotThrottleMs?: number
  replay?: boolean
  /** 原生 console 采集显式启用；不改变输出级别或默认采集全部 debug。 */
  captureConsole?: boolean
  persistDraft?: boolean
  /** 启用本机持久化时由宿主提供用户/租户隔离标识，不得使用令牌或其他凭据。 */
  persistenceKey?: string
  maxEvents?: number
  maxBytes?: number
  maxAgeMs?: number
  beforeCount?: number
  afterCount?: number
  afterTimeoutMs?: number
}

/**
 * 本机待传附件；bytes 不暴露给普通列表组件。
 * @example
 * ```ts
 * import type { FeedbackClientAttachment } from '@h-ai/feedback/client'
 * function byteLength(file: FeedbackClientAttachment) { return file.bytes.byteLength }
 * ```
 */
export interface FeedbackClientAttachment extends FeedbackAttachmentInput {
  bytes: Uint8Array
}

/**
 * 打开弹窗前固定的现场。
 * @example
 * ```ts
 * import type { FeedbackDraft } from '@h-ai/feedback/client'
 * function missingMaterials(draft: FeedbackDraft) { return draft.missing }
 * ```
 */
export interface FeedbackDraft {
  submissionId: string
  anchorTime: number
  anchorKind: 'error' | 'feedback'
  errorId?: string
  evidence: FeedbackEvidenceInput[]
  attachments: FeedbackClientAttachment[]
  missing: string[]
  expiresAt: number
  report?: FeedbackReport
  /** 首次发送的不可变包络，网络 ACK 丢失时按同一标识逐字重试。 */
  submission?: FeedbackSubmitInput
  /** 仅保存输入摘要，识别重试时的表单变更，不另存原始自由文本。 */
  userInputFingerprint?: string
}

/**
 * 可留空的用户补充信息。
 * @example
 * ```ts
 * import type { FeedbackClientSubmitInput } from '@h-ai/feedback/client'
 * const input: FeedbackClientSubmitInput = { description: '' }
 * ```
 */
export interface FeedbackClientSubmitInput {
  description?: string
  category?: string
  contact?: string
  files?: readonly File[]
  removedAttachmentIds?: readonly string[]
}

/**
 * 采集会话实例；关闭会释放监听器、观察点和定时任务。
 * @example
 * ```ts
 * import type { FeedbackBrowserClient } from '@h-ai/feedback/client'
 * async function finish(client: FeedbackBrowserClient) { const result = await client.flush(); await client.close(); return result }
 * ```
 */
export interface FeedbackBrowserClient {
  init: (config: FeedbackClientConfig) => Promise<HaiResult<void>>
  prepare: () => Promise<HaiResult<FeedbackDraft>>
  submit: (input?: FeedbackClientSubmitInput) => Promise<HaiResult<FeedbackReport>>
  flush: () => Promise<HaiResult<void>>
  record: (event: { kind: FeedbackEvidenceInput['kind'], data: Record<string, unknown>, requestId?: string, errorId?: string }) => void
  getDraft: () => FeedbackDraft | undefined
  annotate: (id: string, annotation: FeedbackImageAnnotation) => Promise<HaiResult<void>>
  /**
   * 原子添加一批附件，全部校验成功后合并到最新草稿；失败保留原附件和缺失标记，不保存半批文件。
   * 原文件及脱敏结果各最多 5 MiB，合并后最多 20 项；读取期间草稿切换或提交冻结返回 CONFLICT。
   * @example
   * ```ts
   * import type { FeedbackBrowserClient } from '@h-ai/feedback/client'
   * // 上下文：宿主已初始化 client 并成功调用 prepare。
   * async function addSelectedFiles(client: FeedbackBrowserClient, files: readonly File[]) {
   *   const result = await client.addFiles(files)
   *   if (!result.success) return result
   *   return client.getDraft()
   * }
   * void addSelectedFiles
   * ```
   */
  addFiles: (files: readonly File[]) => Promise<HaiResult<void>>
  exportDraft: (input?: FeedbackClientSubmitInput) => Promise<HaiResult<Uint8Array>>
  close: () => Promise<void>
}

export type { FeedbackImageAnnotation } from './feedback-client-image.js'
