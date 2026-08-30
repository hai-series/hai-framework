/**
 * @h-ai/ai — MCP 子功能类型
 *
 * 定义 MCP 工具、资源、提示词的注册与调用接口。
 * @module ai-mcp-types
 */

import type { HaiResult } from '@h-ai/core'

import type { PromptMessage } from '@modelcontextprotocol/sdk/types.js'

// ─── MCP 业务类型 ───

/** MCP 工具定义（注册工具时的元数据） */
export interface MCPToolDefinition {
  /** 工具名称（需唯一） */
  name: string
  /** 工具功能描述 */
  description: string
  /** 输入参数的 JSON Schema */
  inputSchema: Record<string, unknown>
}

/** MCP 工具处理器，接收输入参数和执行上下文 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: MCPContext,
) => Promise<TOutput> | TOutput

/** MCP 执行上下文，携带请求元数据 */
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

/** MCP 资源描述（注册资源时的元数据） */
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

/** MCP 资源内容（readResource 的返回值） */
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

/** MCP 提示词模板描述 */
export interface MCPPrompt {
  /** 提示词名称（唯一标识） */
  name: string
  /** 提示词描述（可选） */
  description?: string
  /** 参数定义列表（可选） */
  arguments?: MCPPromptArgument[]
}

/** MCP 提示词参数定义 */
export interface MCPPromptArgument {
  /** 参数名称 */
  name: string
  /** 参数描述（可选） */
  description?: string
  /** 是否必填（默认 `false`） */
  required?: boolean
}

/** MCP 提示词消息，直接复用 SDK 的完整判别联合（含图片、音频与嵌入资源） */
export type MCPPromptMessage = PromptMessage

/** MCP 提示词内容；按 type 缩窄后访问对应字段 */
export type MCPPromptContent = PromptMessage['content']

// ─── MCP Server 类型 ───

/** MCP 服务器创建选项 */
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
