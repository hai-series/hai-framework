import type { PaginatedResult } from '@h-ai/core'

/**
 * 离线证据项；业务字段放在 data 中，读取器不理解业务表结构。
 * @example
 * ```ts
 * import type { FeedbackBundleEvidence } from '@h-ai/feedback/bundle'
 * const event: FeedbackBundleEvidence = { source: 'browser', kind: 'log', timestamp: 1, data: { message: 'ready' } }
 * ```
 */
export interface FeedbackBundleEvidence {
  id?: string
  source: string
  kind: string
  timestamp: number
  sequence?: number
  requestId?: string
  errorId?: string
  missingReason?: string
  data?: unknown
}

/**
 * 随包传输的二进制附件，名称只作显示，不用于构造文件路径。
 * @example
 * ```ts
 * import type { FeedbackBundleAttachment } from '@h-ai/feedback/bundle'
 * const file: FeedbackBundleAttachment = { id: 'file-1', name: 'notes.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('diagnostic notes') }
 * ```
 */
export interface FeedbackBundleAttachment {
  id: string
  name: string
  contentType: string
  bytes: Uint8Array
  checksum?: string
}

/**
 * 离线包的输入；泛型允许直接传入框架报告类型，不要求调用方添加索引签名。
 * @example
 * ```ts
 * import type { FeedbackBundleInput } from '@h-ai/feedback/bundle'
 * const input: FeedbackBundleInput = { report: { id: 'report-1' }, evidence: [], missing: ['screenshot-unavailable'] }
 * ```
 */
export interface FeedbackBundleInput<TReport extends { id: string } = { id: string }> {
  report: TReport
  evidence: readonly FeedbackBundleEvidence[]
  history?: readonly object[]
  attachments?: readonly FeedbackBundleAttachment[]
  missing?: readonly string[]
}

/**
 * manifest 中单个文件的完整性与展示信息。
 * @example
 * ```ts
 * import type { FeedbackBundleFile } from '@h-ai/feedback/bundle'
 * const metadata: FeedbackBundleFile = { path: 'report.json', size: 2, sha256: '0'.repeat(64), kind: 'report' }
 * ```
 */
export interface FeedbackBundleFile {
  path: string
  size: number
  sha256: string
  kind: 'report' | 'evidence' | 'history' | 'attachment' | 'summary' | 'viewer'
  attachmentId?: string
  name?: string
  contentType?: string
}

/**
 * 版本化的离线包清单；manifest 本身不声称具备来源签名。
 * @example
 * ```ts
 * import type { FeedbackBundleManifest } from '@h-ai/feedback/bundle'
 * const manifest: FeedbackBundleManifest = { format: 'hai-feedback', version: 1, reportId: 'report-1', evidenceRevision: 1, createdAt: 1, missing: [], files: [] }
 * ```
 */
export interface FeedbackBundleManifest {
  format: 'hai-feedback'
  version: 1
  reportId: string
  evidenceRevision: number
  createdAt: number
  missing: string[]
  files: FeedbackBundleFile[]
}

/**
 * 校验后的离线包；files 中的内容仍是待显示的非可信输入。
 * @example
 * ```ts
 * import type { FeedbackBundle } from '@h-ai/feedback/bundle'
 * import { readFeedbackBundle } from '@h-ai/feedback/bundle'
 * async function parse(bytes: Uint8Array): Promise<FeedbackBundle | undefined> {
 *   const result = await readFeedbackBundle(bytes)
 *   return result.success ? result.data : undefined
 * }
 * ```
 */
export interface FeedbackBundle {
  manifest: FeedbackBundleManifest
  report: Record<string, unknown> & { id: string }
  evidence: FeedbackBundleEvidence[]
  history: Record<string, unknown>[]
  files: Readonly<Record<string, Uint8Array>>
}

/**
 * ZIP 解压与读取上限，在解压前及解压后均核对。
 * @example
 * ```ts
 * import type { FeedbackBundleReadOptions } from '@h-ai/feedback/bundle'
 * const limits: FeedbackBundleReadOptions = { maxFiles: 100, maxBytes: 8 * 1024 * 1024, maxFileBytes: 2 * 1024 * 1024 }
 * ```
 */
export interface FeedbackBundleReadOptions {
  maxFiles?: number
  maxBytes?: number
  maxFileBytes?: number
}

/**
 * 按索引分页读取证据，不要求把所有日志送入 AI 上下文。
 * @example
 * ```ts
 * import type { FeedbackBundleQuery } from '@h-ai/feedback/bundle'
 * const query: FeedbackBundleQuery = { errorId: 'error-1', page: 1, pageSize: 20 }
 * ```
 */
export interface FeedbackBundleQuery {
  page?: number
  pageSize?: number
  kind?: string
  requestId?: string
  errorId?: string
  from?: number
  to?: number
}

/**
 * 离线证据分页结果。
 * @example
 * ```ts
 * import type { FeedbackBundleEvidencePage } from '@h-ai/feedback/bundle'
 * const page: FeedbackBundleEvidencePage = { items: [], total: 0, page: 1, pageSize: 20 }
 * ```
 */
export type FeedbackBundleEvidencePage = PaginatedResult<FeedbackBundleEvidence>
