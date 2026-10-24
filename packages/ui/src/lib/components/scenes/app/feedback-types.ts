/**
 * 反馈界面使用的可展示数据；由宿主负责鉴权、采集与传输。
 * @module feedback-types
 */
import type { PaginatedResult } from '@h-ai/core'

/**
 * 反馈的人工处理状态。
 * @example
 * ```ts
 * import type { FeedbackStatus } from '@h-ai/ui'
 * const status: FeedbackStatus = 'pending'
 * ```
 */
export type FeedbackStatus = 'pending' | 'handled'

/**
 * 反馈列表/详情的展示模型。
 * @example
 * ```ts
 * import type { FeedbackReportView } from '@h-ai/ui'
 * const row: Pick<FeedbackReportView, 'id' | 'status'> = { id: 'f1', status: 'pending' }
 * ```
 */
export interface FeedbackReportView {
  id: string
  number: string
  appId: string
  userId?: string
  description: string
  /** 用户未填写说明时可展示的服务端事实摘要。 */
  summary?: string
  appVersion: string
  buildId?: string
  commit?: string
  status: FeedbackStatus
  collectionStatus: 'collecting' | 'complete' | 'partial' | 'failed'
  notificationStatus: 'pending' | 'sending' | 'sent' | 'deferred' | 'failed'
  createdAt: number
  updatedAt: number
  version: number
  evidenceRevision: number
}

/**
 * 使用框架统一分页结果中的页面字段。
 * @example
 * ```ts
 * import type { FeedbackPage } from '@h-ai/ui'
 * const page: FeedbackPage<string> = { items: [], total: 0, page: 1, pageSize: 20 }
 * ```
 */
export type FeedbackPage<T> = Pick<PaginatedResult<T>, 'items' | 'total' | 'page' | 'pageSize'>

/**
 * 服务端分页与筛选条件。
 * @example
 * ```ts
 * import type { FeedbackListQuery } from '@h-ai/ui'
 * const query: FeedbackListQuery = { page: 1, pageSize: 20, status: 'pending' }
 * ```
 */
export interface FeedbackListQuery {
  page: number
  pageSize: number
  search?: string
  status?: FeedbackStatus
  collectionStatus?: FeedbackReportView['collectionStatus']
  appId?: string
  appVersion?: string
  from?: number
  to?: number
  sortDirection?: 'asc' | 'desc'
}

/**
 * 按宿主权限控制操作；服务端仍须重新鉴权。
 * @example
 * ```ts
 * import type { FeedbackPermissions } from '@h-ai/ui'
 * const permissions: FeedbackPermissions = { read: true, process: true }
 * ```
 */
export interface FeedbackPermissions {
  read?: boolean
  process?: boolean
  reopen?: boolean
  export?: boolean
  retry?: boolean
}

/**
 * 处理/撤销操作传递的乐观版本。
 * @example
 * ```ts
 * import type { FeedbackStatusChange } from '@h-ai/ui'
 * const change: FeedbackStatusChange = { id: 'f1', status: 'handled', expectedVersion: 1 }
 * ```
 */
export interface FeedbackStatusChange {
  id: string
  status: FeedbackStatus
  expectedVersion: number
  note?: string
}

/**
 * 采集证据的展示模型。
 * @example
 * ```ts
 * import type { FeedbackEvidenceView } from '@h-ai/ui'
 * const event: FeedbackEvidenceView = { id: 'e1', source: 'browser', sequence: 1, kind: 'log', timestamp: 0, data: {} }
 * ```
 */
export interface FeedbackEvidenceView {
  id: string
  source: string
  sequence: number
  kind: string
  timestamp: number
  requestId?: string
  errorId?: string
  data: Record<string, unknown>
  missingReason?: string
}

/**
 * 详情证据的分页过滤。
 * @example
 * ```ts
 * import type { FeedbackEvidenceQuery } from '@h-ai/ui'
 * const query: FeedbackEvidenceQuery = { page: 1, pageSize: 20, kind: 'log' }
 * ```
 */
export interface FeedbackEvidenceQuery {
  page: number
  pageSize: number
  kind?: string
  requestId?: string
  errorId?: string
}

/**
 * 附件预览由宿主经授权取得，url 推荐为短期本地 Blob URL。
 * @example
 * ```ts
 * import type { FeedbackAttachmentView } from '@h-ai/ui'
 * const item: FeedbackAttachmentView = { id: 'a1', name: 'screen.png', mimeType: 'image/png' }
 * ```
 */
export interface FeedbackAttachmentView {
  id: string
  name: string
  mimeType?: string
  size?: number
  url?: string
  missingReason?: string
}

/**
 * 已脱敏采集材料的可折叠摘要。
 * @example
 * ```ts
 * import type { FeedbackEvidenceSummary } from '@h-ai/ui'
 * const item: FeedbackEvidenceSummary = { label: 'Logs', count: 12, status: 'complete' }
 * ```
 */
export interface FeedbackEvidenceSummary {
  label: string
  count?: number
  status?: 'complete' | 'missing' | 'partial' | 'not-applicable'
  detail?: string
}

/**
 * 截图标注采用相对于原图的 0–1 坐标，图像修改由宿主采集服务完成。
 * @example
 * ```ts
 * import type { FeedbackAnnotation } from '@h-ai/ui'
 * const mark: FeedbackAnnotation = { id: 'a1', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, mode: 'mask' }
 * ```
 */
export interface FeedbackAnnotation {
  id: string
  rect: { x: number, y: number, width: number, height: number }
  mode: 'mask' | 'outline'
}

/**
 * 反馈收集表单值；所有文字项可留空。
 * @example
 * ```ts
 * import type { FeedbackFormData } from '@h-ai/ui'
 * const input: FeedbackFormData = { description: '', files: [], removedAttachmentIds: [] }
 * ```
 */
export interface FeedbackFormData {
  type?: 'bug' | 'feature' | 'question' | 'other'
  description: string
  contact?: string
  files: File[]
  removedAttachmentIds: string[]
}

/**
 * 服务端可靠受理后的回执；材料仍可能异步汇集。
 * @example
 * ```ts
 * import type { FeedbackReceipt } from '@h-ai/ui'
 * const receipt: FeedbackReceipt = { number: 'FB-123', collectionStatus: 'collecting' }
 * ```
 */
export interface FeedbackReceipt {
  number: string
  collectionStatus: FeedbackReportView['collectionStatus']
}

/**
 * 人工处理历史展示。
 * @example
 * ```ts
 * import type { FeedbackHistoryView } from '@h-ai/ui'
 * const change: FeedbackHistoryView = { id: 'h1', actorId: 'u1', fromStatus: 'pending', toStatus: 'handled', createdAt: 0 }
 * ```
 */
export interface FeedbackHistoryView {
  id: string
  actorId: string
  fromStatus: FeedbackStatus
  toStatus: FeedbackStatus
  createdAt: number
  note?: string
}
