/**
 * @h-ai/ai — MCP 子功能类型
 *
 * 定义 MCP 工具、资源、提示词的注册与调用接口。
 * @module ai-mcp-types
 */

import type { McpServer as ACPMcpServer } from '@agentclientprotocol/sdk'
import type { HaiResult } from '@h-ai/core'
import type { CallToolRequest, CallToolResult, PromptMessage } from '@modelcontextprotocol/sdk/types.js'

import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── MCP 业务类型 ───

/**
 * MCP 工具定义（注册工具时的元数据）
 *
 * @example
 * ```ts
 * import { ai, type MCPToolDefinition } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai；echo 为无外部副作用的示例工具。
 * const definition: MCPToolDefinition = { name: 'echo', description: '返回输入', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } }
 * const registered = ai.mcp.registerTool(definition, (input: { text: string }) => ({ text: input.text }))
 * if (!registered.success) throw new Error(registered.error.message)
 * ```
 */
export interface MCPToolDefinition {
  /** 工具名称（需唯一） */
  name: string
  /** 工具功能描述 */
  description: string
  /** 输入参数的 JSON Schema */
  inputSchema: Record<string, unknown>
}

/**
 * MCP 工具处理器，接收输入参数和执行上下文
 *
 * @example
 * ```ts
 * import type { MCPToolHandler } from '@h-ai/ai'
 * const echo: MCPToolHandler<{ text: string }, { text: string }> = (input, context) => ({ text: `${context.requestId ?? 'request'}: ${input.text}` })
 * const output = await echo({ text: '你好' }, { requestId: 'request-1' })
 * ```
 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: MCPContext,
) => Promise<TOutput> | TOutput

/**
 * MCP 执行上下文，携带请求元数据
 *
 * @example
 * ```ts
 * import type { MCPContext } from '@h-ai/ai'
 * const value: MCPContext = { requestId: 'request-1', clientInfo: { name: 'assistant', version: '1.0.0' } }
 * const correlationId = value.requestId
 * ```
 */
export interface MCPContext {
  /** 请求唯一标识（未传入时自动生成 UUID） */
  requestId?: string
  /** 客户端信息（可选） */
  clientInfo?: {
    name: string
    version: string
  }
  /** 自定义元数据（可选） */
  metadata?: Record<string, unknown>
}

/**
 * MCP 资源描述（注册资源时的元数据）
 *
 * @example
 * ```ts
 * import type { MCPResource } from '@h-ai/ai'
 * const value: MCPResource = { uri: 'config://public/features', name: '公开特性', mimeType: 'application/json' }
 * const resourceName = value.name
 * ```
 */
export interface MCPResource {
  /** 资源 URI（唯一标识） */
  uri: string
  /** 资源名称 */
  name: string
  /** 资源描述（可选） */
  description?: string
  /** MIME 类型（可选，如 `'application/json'`） */
  mimeType?: string
}

/**
 * MCP 资源内容（readResource 的返回值）
 *
 * @example
 * ```ts
 * import type { MCPResourceContent } from '@h-ai/ai'
 * const value: MCPResourceContent = { uri: 'config://public/features', mimeType: 'application/json', text: JSON.stringify({ enabled: true }) }
 * const text = value.text
 * ```
 */
export interface MCPResourceContent {
  /** 资源 URI */
  uri: string
  /** MIME 类型（可选） */
  mimeType?: string
  /** 文本内容（与 blob 二选一） */
  text?: string
  /** Base64 编码的二进制内容（与 text 二选一） */
  blob?: string
}

/**
 * MCP 提示词模板描述
 *
 * @example
 * ```ts
 * import type { MCPPrompt } from '@h-ai/ai'
 * const value: MCPPrompt = { name: 'explain', description: '解释主题', arguments: [{ name: 'topic', required: true }] }
 * const required = value.arguments?.filter(argument => argument.required)
 * ```
 */
export interface MCPPrompt {
  /** 提示词名称（唯一标识） */
  name: string
  /** 提示词描述（可选） */
  description?: string
  /** 参数定义列表（可选） */
  arguments?: MCPPromptArgument[]
}

/**
 * MCP 提示词参数定义
 *
 * @example
 * ```ts
 * import type { MCPPromptArgument } from '@h-ai/ai'
 * const value: MCPPromptArgument = { name: 'topic', description: '要解释的主题', required: true }
 * const field = value.name
 * ```
 */
export interface MCPPromptArgument {
  /** 参数名称 */
  name: string
  /** 参数描述（可选） */
  description?: string
  /** 是否必填（默认 `false`） */
  required?: boolean
}

/**
 * MCP 提示词消息，直接复用 SDK 的完整判别联合（含图片、音频与嵌入资源）
 *
 * @example
 * ```ts
 * import type { MCPPromptMessage } from '@h-ai/ai'
 * const value: MCPPromptMessage = { role: 'user', content: { type: 'text', text: '请解释共享状态' } }
 * const role = value.role
 * ```
 */
export type MCPPromptMessage = PromptMessage

/**
 * MCP 提示词内容；按 type 缩窄后访问对应字段
 *
 * @example
 * ```ts
 * import type { MCPPromptContent } from '@h-ai/ai'
 * function textContent(content: MCPPromptContent): string | undefined {
 *   return content.type === 'text' ? content.text : undefined
 * }
 * ```
 */
export type MCPPromptContent = PromptMessage['content']

// ─── MCP Server 类型 ───

/**
 * MCP 服务器创建选项
 *
 * @example
 * ```ts
 * import { createMcpServer, type McpServerOptions } from '@h-ai/ai'
 * const options: McpServerOptions = { name: 'public-tools', version: '1.0.0' }
 * const server = createMcpServer(options)
 * // 应用停止接入请求后关闭 SDK server。
 * await server.close()
 * ```
 */
export interface McpServerOptions {
  /** 服务器名称 */
  name: string
  /** 服务器版本（默认 `'1.0.0'`） */
  version?: string
}

// ─── MCP 操作接口 ───

/**
 * MCP 操作接口（通过 `ai.mcp` 访问）
 *
 * 需要先调用 `ai.init()` 初始化，否则所有方法返回 `NOT_INITIALIZED` 错误。
 *
 * @example
 * ```ts
 * import { ai, type MCPOperations } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai。
 * const mcp: MCPOperations = ai.mcp
 * const registered = mcp.registerTool({ name: 'echo', description: '返回输入', inputSchema: { type: 'string' } }, (input: string) => input)
 * if (!registered.success) throw new Error(registered.error.message)
 * const called = await mcp.callTool('echo', '你好', { requestId: 'request-1' })
 * if (!called.success) throw new Error(called.error.message)
 * ```
 */
export interface MCPOperations {
  /** 注册工具并编译 JSON Schema；非法 Schema 返回 MCP_TOOL_ERROR，同名注册覆盖 */
  registerTool: <TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ) => HaiResult<void>
  /** 注册资源加载器；读取时校验 text/blob 输出 */
  registerResource: (
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ) => HaiResult<void>
  /** 注册提示词；调用时校验必填参数和 SDK 消息格式 */
  registerPrompt: (
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ) => HaiResult<void>
  /** 校验输入后执行工具；自动补齐缺失的 requestId */
  callTool: (name: string, args: unknown, context?: MCPContext) => Promise<HaiResult<unknown>>
  /** 读取资源，输出必须恰好含一个有效 text 或 blob */
  readResource: (uri: string) => Promise<HaiResult<MCPResourceContent>>
  /** 渲染提示词；必填参数必须是自身属性，且提供的已声明参数必须是字符串 */
  getPrompt: (name: string, args: Record<string, string>) => Promise<HaiResult<MCPPromptMessage[]>>
}

/**
 * 按目录 ID 调用工具，连接设置始终由服务端清单提供。
 * @example
 * ```ts
 * import type { MCPServiceRequest } from '@h-ai/ai'
 * const request: MCPServiceRequest = { serviceId: 'docs', tool: 'search', arguments: { query: 'manual' } }
 * ```
 */
export interface MCPServiceRequest {
  serviceId: string
  tool: string
  arguments?: CallToolRequest['params']['arguments']
}

/**
 * 由可信应用从认证态和业务授权构造的调用上下文。
 * @example
 * ```ts
 * import type { MCPServiceAuthorization } from '@h-ai/ai'
 * const authorization: MCPServiceAuthorization = {
 *   principal: { tenantId: 'team', userId: 'ada' },
 *   authorize: ({ principal, serviceId, tool }) => principal.tenantId === 'team' && serviceId === 'docs' && tool === 'search',
 * }
 * ```
 */
export interface MCPServiceAuthorization {
  /** 从 IAM 会话或可信服务身份取得的主体，不能从模型或工具参数构造。 */
  principal: { tenantId: string, userId: string }
  /** 可信调用方绑定的业务任务 ID；通过 Broker 调用时由绑定提供。 */
  taskId?: string
  /** 根据主体、工具和实际参数检查资料访问权限及操作权限。 */
  authorize: (input: MCPServiceRequest & { principal: MCPServiceAuthorization['principal'], signal: AbortSignal }) => boolean | Promise<boolean>
  /** 在请求开始前或执行中取消；远端已完成的操作由业务核对。 */
  signal?: AbortSignal
}

/**
 * 作业执行者在读取授权对象或提交暂存产物时使用的可信业务绑定。
 * @example
 * ```ts
 * import type { MCPJobFileContext } from '@h-ai/ai'
 * function owner(context: MCPJobFileContext) { return context.principal.tenantId }
 * ```
 */
export interface MCPJobFileContext {
  principal: MCPServiceAuthorization['principal']
  taskId?: string
  jobId: string
  signal: AbortSignal
}

/**
 * 应用提供对象 ACL 与存储接入。文件内容只在作业节点暂存，队列仅保存对象 ID。
 * @example
 * ```ts
 * import { err, type HaiResult } from '@h-ai/core'
 * import { HaiAIError, type MCPJobFiles } from '@h-ai/ai'
 * function denied<T>(): HaiResult<T> { return err(HaiAIError.MCP_TOOL_FORBIDDEN, 'File is not authorized') }
 * const files: MCPJobFiles = { read: async () => denied(), publish: async () => denied() }
 * ```
 */
export interface MCPJobFiles {
  /** 在读取前验证主体、任务状态、对象归属和读取授权。 */
  read: (input: MCPJobFileContext & { fileId: string }) => Promise<HaiResult<{ name: string, base64: string }>>
  /** 重新验证主体与任务，提交带归属、可按 jobId 回收的暂存对象。 */
  publish: (input: MCPJobFileContext & { name: string, base64: string }) => Promise<HaiResult<{ fileId: string }>>
}

/**
 * 通过现有合并目录调用受控的第三方 Streamable HTTP 工具。
 * @example
 * ```ts
 * import { ai, type MCPServiceAuthorization } from '@h-ai/ai'
 * async function search(context: MCPServiceAuthorization) {
 *   const result = await ai.mcp.services.invoke({ serviceId: 'docs', tool: 'search', arguments: { query: 'manual' } }, context)
 *   if (!result.success) return result
 *   return result.data.content
 * }
 * ```
 */
export interface MCPServiceOperations {
  /** 解析当前清单和授权后连接远端，返回标准 MCP 工具内容或本地化失败。 */
  invoke: (request: MCPServiceRequest, authorization: MCPServiceAuthorization) => Promise<HaiResult<CallToolResult>>
  /** 在执行节点创建受信 HTTP 工具入口。 */
  createBroker: (options: MCPServiceBrokerOptions) => HaiResult<MCPServiceBroker>
}

/**
 * 工具入口固定地址及每次调用的实时业务授权。
 * @example
 * ```ts
 * import type { MCPServiceBrokerOptions } from '@h-ai/ai'
 * const broker: MCPServiceBrokerOptions = {
 *   url: 'https://executor.example.com/mcp',
 *   authorize: ({ principal, serviceId, taskId }) => principal.tenantId === 'team' && serviceId === 'docs' && taskId === 'run-1',
 * }
 * ```
 */
export interface MCPServiceBrokerOptions {
  /** Agent 容器可访问的固定工具端点。 */
  url: string
  /** 可信应用每次核验任务仍运行、主体和实际参数仍允许。 */
  authorize: (input: Parameters<MCPServiceAuthorization['authorize']>[0] & { taskId: string }) => boolean | Promise<boolean>
}

/**
 * 任务授权、模型可见工具名及应用提供的输入契约。
 * @example
 * ```ts
 * import type { MCPServiceBindingRequest } from '@h-ai/ai'
 * const binding: MCPServiceBindingRequest = {
 *   principal: { tenantId: 'team', userId: 'ada' },
 *   taskId: 'run-1',
 *   tools: [{ id: 'docs_search', serviceId: 'docs', tool: 'search', description: 'Search manuals', inputSchema: { type: 'object' } }],
 * }
 * ```
 */
export interface MCPServiceBindingRequest {
  principal: MCPServiceAuthorization['principal']
  taskId: string
  tools: Array<{ id: string, serviceId: string, tool: string, description: string, inputSchema: Record<string, unknown> }>
  /** 有效期，缺省 15 分钟，最多 24 小时。 */
  ttlMs?: number
  /** 执行结束或失租时撤销此绑定。 */
  signal?: AbortSignal
}

/**
 * 只向当前执行代次提供的 MCP 连接和撤销句柄。
 * @example
 * ```ts
 * import type { MCPServiceBinding } from '@h-ai/ai'
 * function stop(binding: MCPServiceBinding) { binding.revoke() }
 * ```
 */
export interface MCPServiceBinding {
  /** 仅传给当前 Agent，含短期 Bearer。 */
  servers: Array<Extract<ACPMcpServer, { type: 'http' }>>
  revoke: () => void
}

/**
 * 执行节点挂载的任务工具入口。
 * @example
 * ```ts
 * import { createServer } from 'node:http'
 * import type { MCPServiceBroker } from '@h-ai/ai'
 * function mount(broker: MCPServiceBroker) { return createServer((req, res) => void broker.handleRequest(req, res)) }
 * ```
 */
export interface MCPServiceBroker {
  bind: (request: MCPServiceBindingRequest) => Promise<HaiResult<MCPServiceBinding>>
  handleRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>
  close: () => void
}
