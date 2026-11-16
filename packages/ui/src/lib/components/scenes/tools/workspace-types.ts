import type { DataAttributes } from '../../../types.js'

/**
 * 产物的展示类型；授权、存储和版本由宿主维护。
 * @example
 * ```ts
 * import type { ArtifactKind } from '@h-ai/ui'
 * const kind: ArtifactKind = 'markdown'
 * ```
 */
export type ArtifactKind = 'markdown' | 'html' | 'table' | 'chart' | 'image' | 'audio' | 'video' | 'file'

/**
 * 可供浏览和选择的产物版本摘要；version 与 Git revision 无关。
 * @example
 * ```ts
 * import type { ArtifactSummary } from '@h-ai/ui'
 * const item: ArtifactSummary = { id: 'report', title: '报告', kind: 'markdown', version: 1 }
 * ```
 */
export interface ArtifactSummary {
  id: string
  title: string
  kind: ArtifactKind
  version: number
  mediaType?: string
  updatedAt?: number
  editable?: boolean
  downloadUrl?: string
}

/**
 * 读取完成的产物；表格和图表的 content 是结构化 JSON，媒体通过授权 URL 加载。
 * @example
 * ```ts
 * import type { ArtifactDocument } from '@h-ai/ui'
 * const item: ArtifactDocument = { id: 'report', title: '报告', kind: 'markdown', version: 1, content: '# 简介' }
 * ```
 */
export interface ArtifactDocument extends ArtifactSummary {
  content?: string
  mediaUrl?: string
}

/**
 * 基于已读取版本保存，不能将冲突静默当作保存成功。
 * @example
 * ```ts
 * import type { ArtifactSaveRequest } from '@h-ai/ui'
 * const request: ArtifactSaveRequest = { id: 'report', baseVersion: 1, content: '# 更新' }
 * ```
 */
export interface ArtifactSaveRequest {
  id: string
  baseVersion: number
  content: string
}

/**
 * 新建可编辑产物；内容模板由组件提供，持久化和授权由宿主实现。
 * @example
 * ```ts
 * import type { ArtifactCreateRequest } from '@h-ai/ui'
 * const request: ArtifactCreateRequest = { title: '报告', kind: 'markdown', content: '# 报告' }
 * ```
 */
export interface ArtifactCreateRequest {
  title: string
  kind: 'markdown' | 'html' | 'table' | 'chart'
  content: string
}

/**
 * 保存成功返回新版本；冲突时保留本地草稿并显示当前版本。
 * @example
 * ```ts
 * import type { ArtifactSaveResponse } from '@h-ai/ui'
 * const response: ArtifactSaveResponse = { status: 'conflict', currentVersion: 2 }
 * ```
 */
export type ArtifactSaveResponse = { status: 'saved', document: ArtifactDocument } | { status: 'conflict', currentVersion: number }

/**
 * 选区改写请求，宿主返回待人工应用的全文提议。
 * @example
 * ```ts
 * import type { ArtifactRewriteRequest } from '@h-ai/ui'
 * const request: ArtifactRewriteRequest = { id: 'report', baseVersion: 1, content: '原文', selectedText: '原文', instruction: '精简' }
 * ```
 */
export interface ArtifactRewriteRequest extends ArtifactSaveRequest {
  selectedText: string
  instruction: string
}

/**
 * 宿主切换页面或退出前调用的异步离开确认。
 * @example
 * ```ts
 * import type { WorkspaceLeaveGuard } from '@h-ai/ui'
 * const canLeave: WorkspaceLeaveGuard = async () => true
 * ```
 */
export type WorkspaceLeaveGuard = () => Promise<boolean>

/**
 * 通用产物工作台；回调只承接宿主能力，组件不发网络请求或保存业务状态。
 * @example
 * ```ts
 * import type { ArtifactWorkspaceProps } from '@h-ai/ui'
 * const props: ArtifactWorkspaceProps = { artifacts: [], onread: async id => ({ id, title: '报告', kind: 'markdown', version: 1, content: '# 简介' }) }
 * ```
 */
export interface ArtifactWorkspaceProps extends DataAttributes {
  artifacts: readonly ArtifactSummary[]
  selectedId?: string
  onread: (id: string, version: number | undefined, signal: AbortSignal) => Promise<ArtifactDocument>
  oncreate?: (request: ArtifactCreateRequest, signal: AbortSignal) => Promise<ArtifactDocument>
  onsave?: (request: ArtifactSaveRequest, signal: AbortSignal) => Promise<ArtifactSaveResponse>
  onhistory?: (id: string, signal: AbortSignal) => Promise<readonly ArtifactSummary[]>
  onrewrite?: (request: ArtifactRewriteRequest, signal: AbortSignal) => Promise<{ content: string }>
  onselect?: (id: string) => void
  onerror?: (error: unknown) => void
  onleaveguard?: (guard: WorkspaceLeaveGuard | undefined) => void
  class?: string
}

/**
 * 工具参数预设；label 由宿主按自身业务语言提供。
 * @example
 * ```ts
 * import type { ToolExample } from '@h-ai/ui'
 * const example: ToolExample = { label: '相加示例', input: { a: 2, b: 3 } }
 * ```
 */
export interface ToolExample {
  label: string
  input: Record<string, unknown>
}

/**
 * 当前主体可使用的工具投影；服务端仍需再次校验授权和参数。
 * @example
 * ```ts
 * import type { ToolCatalogItem } from '@h-ai/ui'
 * const tool: ToolCatalogItem = { name: 'sum', description: '计算合计', inputSchema: { type: 'object' } }
 * ```
 */
export interface ToolCatalogItem {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  examples?: readonly ToolExample[]
}

/**
 * 单次工具执行的业务展示状态，id 由宿主产生并支持跨节点查询。
 * @example
 * ```ts
 * import type { ToolRun } from '@h-ai/ui'
 * const run: ToolRun = { id: 'job-1', status: 'running', progress: 0.5 }
 * ```
 */
export interface ToolRun {
  id: string
  /** 仅未知提交恢复时提供，已取得真实回执后省略。 */
  idempotencyKey?: string
  status: 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
  /** 已完成比例，0..1；不提供时显示不定进度。 */
  progress?: number
  /** 已经由宿主脱敏且可展示的业务说明。 */
  message?: string
  result?: unknown
  artifacts?: readonly ArtifactSummary[]
}

/**
 * 工具运行请求；可信身份必须由宿主从已认证上下文取得。
 * @example
 * ```ts
 * import type { ToolRunRequest } from '@h-ai/ui'
 * const request: ToolRunRequest = { name: 'sum', input: { a: 2, b: 3 }, idempotencyKey: 'user-action-1' }
 * ```
 */
export interface ToolRunRequest {
  name: string
  input: Record<string, unknown>
  idempotencyKey: string
}

/**
 * 当前主体可选的文件和产物摘要；仅用于表单，服务端仍须复核资源权限。
 * @example
 * ```ts
 * import type { ToolResource } from '@h-ai/ui'
 * const resource: ToolResource = { id: 'image-1', title: '产品图片', mediaType: 'image/png' }
 * ```
 */
export interface ToolResource {
  id: string
  title: string
  kind?: string
  mediaType?: string
}

/**
 * 通用工具工作台，优先简单表单和预设，复杂参数置于高级入口。
 * @example
 * ```ts
 * import type { ToolWorkspaceProps } from '@h-ai/ui'
 * const props: ToolWorkspaceProps = { tools: [], onrun: async () => ({ id: 'job-1', status: 'succeeded' }) }
 * ```
 */
export interface ToolWorkspaceProps extends DataAttributes {
  tools: readonly ToolCatalogItem[]
  resources?: readonly ToolResource[]
  onrun: (request: ToolRunRequest, signal: AbortSignal) => Promise<ToolRun>
  initialRun?: ToolRun
  onrunchange?: (run: ToolRun | undefined) => void
  onstatus?: (id: string, signal: AbortSignal) => Promise<ToolRun | null>
  oncancel?: (id: string, signal: AbortSignal) => Promise<ToolRun>
  onartifact?: (artifact: ArtifactSummary) => void
  onerror?: (error: unknown) => void
  /** 查询间隔，默认 1000 毫秒，实际值最低 250 毫秒。 */
  pollIntervalMs?: number
  class?: string
}
