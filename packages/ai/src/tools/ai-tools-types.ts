import type { HaiResult } from '@h-ai/core'
import type { ToolArtifact, ToolArtifactAccess, ToolArtifactReference, ToolInvoker, ToolServiceContext, ToolSet } from '@h-ai/tools/server'
import type { MCPServiceBinding, MCPServiceBindingRequest, MCPServiceBroker } from '../mcp/ai-mcp-types.js'

/**
 * 由资源服务核验归属之后返回的文件或产物。
 * @example
 * ```ts
 * import type { BuiltinArtifact } from '@h-ai/ai'
 * function size(file: BuiltinArtifact) { return file.data.byteLength }
 * ```
 */
export type BuiltinArtifact = ToolArtifact

/**
 * 业务资源引用，文件字节不会进入模型消息或工具结果。
 * @example
 * ```ts
 * import type { BuiltinArtifactReference } from '@h-ai/ai'
 * function id(reference: BuiltinArtifactReference) { return reference.id }
 * ```
 */
export type BuiltinArtifactReference = ToolArtifactReference

/**
 * 宿主资源访问接口；读取和提交均需复核身份、任务及资源权限。
 * @example
 * ```ts
 * import type { BuiltinArtifactAccess } from '@h-ai/ai'
 * function reader(access: BuiltinArtifactAccess) { return access.read }
 * ```
 */
export type BuiltinArtifactAccess = ToolArtifactAccess

/**
 * 内置工具的可信执行绑定。
 * @example
 * ```ts
 * import type { BuiltinToolOptions } from '@h-ai/ai'
 * function owner(options: BuiltinToolOptions) { return options.context.scope.userId }
 * ```
 */
export interface BuiltinToolOptions {
  context: ToolServiceContext
  files: BuiltinArtifactAccess
  /** 调用同一工具服务的固定容器作业；省略时不登记网址视频工作流。 */
  executeJob?: ToolInvoker['invoke']
}

/**
 * 工具目录和调用接口与现有短期 MCP Broker 的装配。
 * @example
 * ```ts
 * import type { BuiltinToolBrokerOptions } from '@h-ai/ai'
 * function endpoint(options: BuiltinToolBrokerOptions) { return options.url }
 * ```
 */
export interface BuiltinToolBrokerOptions {
  service: ToolInvoker
  url: string
}

/**
 * 本地服务绑定只指定允许的工具名，Schema 来自服务当前目录。
 * @example
 * ```ts
 * import type { BuiltinToolBinding } from '@h-ai/ai'
 * const binding: BuiltinToolBinding = { scope: { tenantId: 'team', userId: 'alice' }, sessionId: 'task-1', tools: ['image_generate'] }
 * ```
 */
export interface BuiltinToolBinding {
  scope: ToolServiceContext['scope']
  sessionId: string
  tools: readonly string[]
  /** 绑定有效期毫秒；省略为 900000，范围 1..86400000，较短父信号及撤销仍优先。 */
  ttlMs?: MCPServiceBindingRequest['ttlMs']
  signal?: AbortSignal
}

/**
 * 与现有 MCP HTTP 入口相同的挂载方式，不关闭借入的工具服务。
 * @example
 * ```ts
 * import type { BuiltinToolBroker } from '@h-ai/ai'
 * function stop(broker: BuiltinToolBroker) { broker.close() }
 * ```
 */
export interface BuiltinToolBroker {
  bind: (input: BuiltinToolBinding) => Promise<HaiResult<MCPServiceBinding>>
  handleRequest: MCPServiceBroker['handleRequest']
  close: () => void
}

/**
 * 内置工具构造函数的公开签名。
 * @example
 * ```ts
 * import type { CreateBuiltinTools } from '@h-ai/ai'
 * function build(factory: CreateBuiltinTools, options: Parameters<CreateBuiltinTools>[0]) { return factory(options) }
 * ```
 */
export type CreateBuiltinTools = (options: BuiltinToolOptions) => ToolSet
