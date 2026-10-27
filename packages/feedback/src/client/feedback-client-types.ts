import type { FeedbackAppendEvidenceInput, FeedbackAttachmentInput, FeedbackBudget, FeedbackCompleteInput, FeedbackEvidenceInput, FeedbackReport, FeedbackSubmitInput, FeedbackUploadInput } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { FeedbackSaveResult } from './feedback-client-files.js'
import type { FeedbackImageAnnotation } from './feedback-client-image.js'

/**
 * 可直接传给反馈界面的草稿视图；对象 URL 的所有权属于采集会话。
 * @example
 * ```ts
 * import type { FeedbackDraftView } from '@h-ai/feedback/client'
 * function attachmentCount(view: FeedbackDraftView) { return view.attachments.length }
 * ```
 */
export interface FeedbackDraftView {
  attachments: Array<{ id: string, name: string, size: number, mimeType: string, url: string }>
  evidence: FeedbackEvidenceInput[]
  missing: string[]
  budget: FeedbackBudget
}

/**
 * 宿主将鉴权后的 HTTP 客户端注入一次，采集器不依赖 UI 或服务端 SDK。
 * @example
 * ```ts
 * import type { FeedbackClientActions } from '@h-ai/feedback/client'
 * function send(actions: FeedbackClientActions) { return actions.submit({ appId: 'orders', submissionId: 'stable-1' }) }
 * ```
 */
export interface FeedbackClientActions {
  policy?: () => Promise<HaiResult<FeedbackBudget>>
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
  /** 离线接入可提供策略；在线优先从 actions.policy 读取服务端有效预算。 */
  budget?: FeedbackBudget
  appId: string
  appVersion?: string
  buildId?: string
  commit?: string
  actions: FeedbackClientActions
  cookieAllowlist?: readonly string[]
  screenshot?: boolean
  /** 自定义截图可响应取消信号；忽略取消时仍等待实际任务退出后才释放单飞锁。 */
  captureScreenshot?: (options?: { signal: AbortSignal }) => Promise<Uint8Array>
  screenshotTimeoutMs?: number
  /** 自动关键截图显式开启；默认仅在用户准备反馈时截图。 */
  keyScreenshots?: boolean
  maxKeyScreenshots?: number
  keyScreenshotThrottleMs?: number
  replay?: boolean
  /** 默认 prepare 时启动 DOM 回放；init 模式用于宿主明确需要全程回溯的场景。 */
  replayStart?: 'init' | 'prepare'
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
  readonly budget: FeedbackBudget
  /** URL 按附件修订复用，删除、替换和会话关闭时释放。 */
  getView: () => FeedbackDraftView
  releasePreviews: () => void
  /** 关闭反馈界面时暂停 DOM 回放和截图；保留轻量日志、草稿及已受理上传。 */
  pause: () => void
  /** 导出并使用当前平台的保存/分享入口。 */
  saveDraft: (input?: FeedbackClientSubmitInput) => Promise<HaiResult<FeedbackSaveResult>>
  /** 并发初始化返回 INIT_IN_PROGRESS；重初始化先等待旧会话关闭。 */
  init: (config: FeedbackClientConfig) => Promise<HaiResult<void>>
  prepare: () => Promise<HaiResult<FeedbackDraft>>
  /** 补充当前可见页面截图；传附件 ID 则原位替换。冻结或异步冲突时保留原材料。 */
  captureScreenshot: (attachmentId?: string) => Promise<HaiResult<void>>
  submit: (input?: FeedbackClientSubmitInput) => Promise<HaiResult<FeedbackReport>>
  flush: () => Promise<HaiResult<void>>
  record: (event: { kind: FeedbackEvidenceInput['kind'], data: Record<string, unknown>, requestId?: string, errorId?: string }) => void
  getDraft: () => FeedbackDraft | undefined
  /** 异步标注完成时再核验草稿和附件；冻结、关闭或并发更新冲突时保留原附件并返回 CONFLICT。 */
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
  addFiles: (files: readonly File[], removedAttachmentIds?: readonly string[]) => Promise<HaiResult<void>>
  exportDraft: (input?: FeedbackClientSubmitInput) => Promise<HaiResult<Uint8Array>>
  /** 停止采集，等待有界截图及已提交材料续传后释放会话；并发关闭共用同一清理过程。 */
  close: (options?: { discard?: boolean }) => Promise<void>
}

export type { FeedbackImageAnnotation } from './feedback-client-image.js'
