import type { HaiResult } from '@h-ai/core'
import type { RunnerContext, RunnerEvent, RunnerExecution, RunnerFunctions, RunnerJson, RunnerScope } from '@h-ai/runner'
import type { Tool, ToolDefinition, ToolsFunctions } from '../tools-types.js'
import type { createArtifactTools } from './tools-artifact-functions.js'
import type { createJobTools } from './tools-job-functions.js'

/**
 * 由可信宿主绑定的工具服务身份。执行节点补入真实 RunnerContext。
 * @example
 * ```ts
 * import type { ToolServiceContext } from '@h-ai/tools/server'
 * const context: ToolServiceContext = { scope: { tenantId: 'team', userId: 'alice' }, sessionId: 'task-1' }
 * ```
 */
export interface ToolServiceContext {
  scope: RunnerScope
  sessionId?: string
  signal?: AbortSignal
  execution?: RunnerContext
}

/**
 * 工具组只保存元数据，不创建额外执行器。
 * @example
 * ```ts
 * import type { ToolGroup } from '@h-ai/tools/server'
 * const group: ToolGroup = { id: 'image', title: 'Images', tools: ['image_generate'] }
 * ```
 */
export interface ToolGroup {
  id: string
  title: string
  tools: readonly string[]
}

/**
 * 工具构造函数返回同一内核的定义与可选分组。
 * @example
 * ```ts
 * import type { ToolSet } from '@h-ai/tools/server'
 * const set: ToolSet = { tools: [], groups: [] }
 * ```
 */
export interface ToolSet {
  tools: Tool[]
  groups?: readonly ToolGroup[]
  environments?: Readonly<Record<string, string>>
}

/**
 * 工具组和独立工具取并集，再排除显式停用的名称；省略表示全部停用。
 * @example
 * ```ts
 * import type { ToolSelection } from '@h-ai/tools/server'
 * const selection: ToolSelection = { groups: ['image'], exclude: ['image_remove_background'] }
 * ```
 */
export interface ToolSelection {
  groups?: readonly string[]
  tools?: readonly string[]
  exclude?: readonly string[]
}

/**
 * 持久幂等键与真实执行编号共同校验工具服务归属。
 * @example
 * ```ts
 * import type { ToolReceipt } from '@h-ai/tools/server'
 * function executionId(receipt: ToolReceipt) { return receipt.id }
 * ```
 */
export interface ToolReceipt {
  id: string
  key: string
}

/**
 * Runner 状态与工具结果，不复制任务或租约。
 * @example
 * ```ts
 * import type { ToolRun } from '@h-ai/tools/server'
 * function waiting(run: ToolRun) { return ['queued', 'running', 'cancelling'].includes(run.status) }
 * ```
 */
export interface ToolRun {
  receipt: ToolReceipt
  status: RunnerExecution['status']
  output?: RunnerJson
  failure?: RunnerExecution['failure']
  events: RunnerEvent[]
  next: number
}

/**
 * 提交工具名称与 JSON 业务输入；主体不放入请求参数。
 * @example
 * ```ts
 * import type { ToolSubmitRequest } from '@h-ai/tools/server'
 * const request: ToolSubmitRequest = { name: 'image_generate', input: { prompt: 'A mountain' }, idempotencyKey: 'action-1' }
 * ```
 */
export interface ToolSubmitRequest {
  name: string
  input: unknown
  idempotencyKey?: string
}

/**
 * 提交和执行阶段均检查当前业务授权。
 * @example
 * ```ts
 * import type { ToolServiceAuthorization } from '@h-ai/tools/server'
 * function principal(request: ToolServiceAuthorization) { return request.context.scope.userId }
 * ```
 */
export interface ToolServiceAuthorization {
  context: ToolServiceContext
  name: string
  input: unknown
  phase: 'submit' | 'execute'
}

/**
 * 注入 Runner 和工具构造函数，不启动或关闭借入模块。
 * @example
 * ```ts
 * import type { ToolServiceOptions } from '@h-ai/tools/server'
 * function serviceName(options: ToolServiceOptions) { return options.id }
 * ```
 */
export interface ToolServiceOptions {
  id: string
  runner: RunnerFunctions
  createTools: (context: ToolServiceContext) => ToolSet | Promise<ToolSet>
  enabled: ToolSelection | ((context: ToolServiceContext) => ToolSelection | Promise<ToolSelection>)
  authorize: (request: ToolServiceAuthorization) => boolean | Promise<boolean>
  runTimeoutMs?: number
  queueTimeoutMs?: number
}

/**
 * 只交付已启用的工具描述，模型和界面共享该结果。
 * @example
 * ```ts
 * import type { ToolCatalog } from '@h-ai/tools/server'
 * function names(catalog: ToolCatalog) { return catalog.tools.map(tool => tool.name) }
 * ```
 */
export interface ToolCatalog {
  tools: ToolDefinition[]
  groups: ToolGroup[]
}

/**
 * 工具服务实例。关闭仅移除本服务处理器，活跃任务仍由 Runner 管理。
 * @example
 * ```ts
 * import type { ToolService } from '@h-ai/tools/server'
 * function stop(service: ToolService) { service.close() }
 * ```
 */
export interface ToolService {
  /** 按当前主体和服务的幂等键找回已提交任务；未知键不创建新任务。 */
  find: (idempotencyKey: string, context: ToolServiceContext) => Promise<HaiResult<ToolRun | undefined>>
  catalog: (context: ToolServiceContext) => Promise<HaiResult<ToolCatalog>>
  submit: (request: ToolSubmitRequest, context: ToolServiceContext) => Promise<HaiResult<ToolRun>>
  inspect: (receipt: ToolReceipt, context: ToolServiceContext, options?: { after?: number }) => Promise<HaiResult<ToolRun>>
  cancel: (receipt: ToolReceipt, context: ToolServiceContext) => Promise<HaiResult<ToolRun>>
  invoke: (request: ToolSubmitRequest, context: ToolServiceContext) => Promise<HaiResult<RunnerJson>>
  close: () => void
}

/**
 * 服务端工具入口，保留所有轻量工具能力。
 * @example
 * ```ts
 * import { tools } from '@h-ai/tools/server'
 * const registry = tools.createRegistry()
 * ```
 */
export interface ToolsServerFunctions extends ToolsFunctions {
  createService: (options: ToolServiceOptions) => HaiResult<ToolService>
  createArtifactTools: typeof createArtifactTools
  createJobTools: typeof createJobTools
}
