import type { HaiResult } from '@h-ai/core'
import type { z } from 'zod'
import type { Tool, ToolDefinition } from './tools-types.js'

/**
 * 工具调用结果和进度消息支持的 JSON 值。
 * @example
 * ```ts
 * import type { ToolJson } from '@h-ai/tools/server'
 * const output: ToolJson = { phase: 'rendering', progress: 50 }
 * ```
 */
export type ToolJson = z.infer<ReturnType<typeof z.json>>

/**
 * 可信宿主绑定的工具调用身份、取消信号和可选执行能力。
 * @example
 * ```ts
 * import type { ToolServiceContext } from '@h-ai/tools/server'
 * const context: ToolServiceContext = { scope: { tenantId: 'team', userId: 'alice' }, sessionId: 'task-1' }
 * ```
 */
export interface ToolServiceContext {
  scope: { tenantId: string, userId: string }
  sessionId?: string
  signal?: AbortSignal
  /** 可信执行器提供稳定的执行编号及记录进度的方法。 */
  execution?: { id: string, emit: (data: ToolJson) => Promise<HaiResult<void>> }
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
 * 供工具代理查询目录和调用工具的接口。
 * @example
 * ```ts
 * import type { ToolInvoker, ToolServiceContext } from '@h-ai/tools/server'
 * async function toolNames(invoker: ToolInvoker, context: ToolServiceContext) {
 *   const catalog = await invoker.catalog(context)
 *   return catalog.success ? catalog.data.tools.map(tool => tool.name) : []
 * }
 * ```
 */
export interface ToolInvoker {
  /** 查询当前主体可用的工具目录。 */
  catalog: (context: ToolServiceContext) => Promise<HaiResult<ToolCatalog>>
  /** 使用可信主体调用指定工具并返回 JSON 结果。 */
  invoke: (request: ToolSubmitRequest, context: ToolServiceContext) => Promise<HaiResult<ToolJson>>
}
