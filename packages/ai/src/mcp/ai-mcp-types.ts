/**
 * @h-ai/ai — MCP 子功能类型
 *
 * 定义 MCP 工具、资源、提示词的注册与调用接口。
 * @module ai-mcp-types
 */

import type { HaiResult } from '@h-ai/core'

import type { PromptMessage } from '@modelcontextprotocol/sdk/types.js'

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
