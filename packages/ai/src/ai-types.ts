/**
 * =============================================================================
 * @hai/ai - 类型定义
 * =============================================================================
 *
 * 本文件定义 AI 模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 ai-config.ts 导入。
 *
 * 包含：
 * - 错误类型（AIError）
 * - LLM 消息与响应类型
 * - MCP 相关类型
 * - 工具相关类型
 * - Provider 接口
 * - 服务接口
 *
 * @example
 * ```ts
 * import type { AIService, ChatMessage, LLMProvider } from '@hai/ai'
 *
 * const messages: ChatMessage[] = [
 *     { role: 'system', content: '你是一个助手' },
 *     { role: 'user', content: '你好' }
 * ]
 * ```
 *
 * @module ai-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AIConfig,
  AIConfigInput,
  AIErrorCodeType,
} from './ai-config.js'
import type { StreamOperations } from './llm/ai-llm-stream.js'
import type { ToolsOperations } from './llm/ai-llm-tool.js'

// =============================================================================
// 重新导出配置类型（方便使用）
// =============================================================================

export type {
  AIConfig,
  AIConfigInput,
  AIErrorCodeType,
  LLMConfig,
  MCPConfig,
  MCPServerCapabilities,
  MCPServerConfig,
} from './ai-config.js'

export {
  AIConfigSchema,
  AIErrorCode,
  LLMConfigSchema,
  MCPConfigSchema,
  MCPServerCapabilitiesSchema,
  MCPServerConfigSchema,
} from './ai-config.js'

// =============================================================================
// 子模块类型重新导出
// =============================================================================

export {
  collectStream,
  createSSEDecoder,
  createStreamProcessor,
  encodeSSE,
  type SSEDecoder,
  type SSEEvent,
  type StreamOperations,
  type StreamProcessor,
  type StreamResult,
} from './llm/ai-llm-stream.js'

export {
  createToolRegistry,
  defineTool,
  type DefineToolOptions,
  type Tool,
  type ToolError,
  type ToolErrorType,
  ToolRegistry,
  type ToolsOperations,
} from './llm/ai-llm-tool.js'

export {
  createMcpServer,
  McpServer,
  SSEServerTransport,
  StdioServerTransport,
  StreamableHTTPServerTransport,
} from './mcp/ai-mcp-server.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * AI 错误接口
 *
 * 所有 AI 操作返回的错误都遵循此接口。
 * 通过 `code` 字段区分错误类别，便于分支处理。
 *
 * @example
 * ```ts
 * const result = await ai.llm.chat({ messages: [...] })
 * if (!result.success) {
 *     switch (result.error.code) {
 *         case AIErrorCode.NOT_INITIALIZED:
 *             // 服务未初始化
 *             break
 *         case AIErrorCode.RATE_LIMITED:
 *             // 触发速率限制，可重试
 *             break
 *         default:
 *             console.error(result.error.message)
 *     }
 * }
 * ```
 */
export interface AIError {
  /** 错误码（数值，参见 AIErrorCode） */
  code: AIErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// LLM 消息类型
// =============================================================================

/**
 * 消息角色
 *
 * - `system` — 系统提示词（设定助手行为）
 * - `user` — 用户输入
 * - `assistant` — 助手回复
 * - `tool` — 工具执行结果
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * 文本内容块
 *
 * 用于多模态消息中的纯文本部分。
 */
export interface TextContent {
  type: 'text'
  text: string
}

/**
 * 图片内容块
 *
 * 用于多模态消息中的图片部分，支持 URL 引用和精度控制。
 */
export interface ImageContent {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

/**
 * 消息内容
 *
 * 可以是纯文本字符串，也可以是文本/图片混合数组（多模态）。
 */
export type MessageContent = string | (TextContent | ImageContent)[]

/**
 * 系统消息
 *
 * 设定助手的行为角色与约束，放在对话开头。
 * `content` 仅支持纯文本。
 */
export interface SystemMessage {
  role: 'system'
  content: string
}

/**
 * 用户消息
 *
 * 支持纯文本或多模态内容（图片 + 文本）。
 */
export interface UserMessage {
  role: 'user'
  content: MessageContent
}

/**
 * 工具调用
 *
 * LLM 返回的工具调用指令，包含调用 ID 和 JSON 编码的参数。
 * `arguments` 为 JSON 字符串，需解析后使用。
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 助手消息
 *
 * 包含 LLM 回复的文本内容或工具调用。
 * 当存在 `tool_calls` 时，`content` 通常为 `null`。
 */
export interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

/**
 * 工具消息
 *
 * 工具执行结果，通过 `tool_call_id` 与助手的工具调用关联。
 * `content` 为工具执行结果的字符串表示。
 */
export interface ToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
}

/**
 * 聊天消息联合类型
 *
 * 涵盖对话中所有可能的消息角色。
 * 在构建请求的 `messages` 数组时使用。
 */
export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

// =============================================================================
// LLM 请求与响应类型
// =============================================================================

/**
 * OpenAI 工具定义（function calling 格式）
 *
 * 传入 `ChatCompletionRequest.tools` 数组，
 * 通常通过 `ai.tools.define().toDefinition()` 或 `registry.getDefinitions()` 生成。
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * 聊天完成请求
 *
 * 对应 OpenAI Chat Completions API 的请求体。
 * 除 `messages` 必填外，其余字段均可选，未提供时使用配置默认值。
 *
 * @example
 * ```ts
 * const result = await ai.llm.chat({
 *     messages: [
 *         { role: 'system', content: '你是一个助手' },
 *         { role: 'user', content: '你好' },
 *     ],
 *     temperature: 0.5,
 *     tools: registry.getDefinitions(),
 * })
 * ```
 */
export interface ChatCompletionRequest {
  /** 模型名称 */
  model?: string
  /** 消息列表 */
  messages: ChatMessage[]
  /** 温度参数 */
  temperature?: number
  /** Top P 采样 */
  top_p?: number
  /** 最大 Token 数 */
  max_tokens?: number
  /** 是否流式响应 */
  stream?: boolean
  /** 工具列表 */
  tools?: ToolDefinition[]
  /** 工具选择策略 */
  tool_choice?: 'auto' | 'none' | { type: 'function', function: { name: string } }
}

/**
 * Token 使用统计
 *
 * 包含输入（prompt）、输出（completion）和总计 Token 数，
 * 用于成本统计和配额监控。
 */
export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/**
 * 聊天完成选择
 *
 * 一次请求可能返回多个选择（通常只有 1 个），
 * 每个选择包含助手消息和完成原因。
 */
export interface ChatCompletionChoice {
  index: number
  message: AssistantMessage
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
}

/**
 * 聊天完成响应
 *
 * 对应 OpenAI Chat Completions API 的响应体（非流式）。
 */
export interface ChatCompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: ChatCompletionChoice[]
  usage: TokenUsage
}

/**
 * 流式增量内容
 *
 * 每个流式块中的增量数据。
 * `content` 为本次新增的文本片段，`tool_calls` 为本次新增/续传的工具调用。
 * 需通过 `ai.stream.createProcessor()` 或手动累积获取完整结果。
 */
export interface ChatCompletionDelta {
  role?: 'assistant'
  content?: string
  tool_calls?: Array<{
    index: number
    id?: string
    type?: 'function'
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

/**
 * 流式响应块
 *
 * 对应 OpenAI Chat Completions API 的流式响应体。
 * 通过 `ai.llm.chatStream()` 获取的 AsyncIterable 逐块产出。
 */
export interface ChatCompletionChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: ChatCompletionDelta
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
  }>
}

// =============================================================================
// MCP 相关类型
// =============================================================================

/**
 * MCP 工具定义
 *
 * 描述一个 MCP 工具的元信息，用于注册和客户端发现。
 * `inputSchema` 采用 JSON Schema 格式描述参数结构。
 */
export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * MCP 工具处理器
 *
 * 接收解析后的输入参数和执行上下文，返回执行结果。
 * 支持同步和异步处理函数。
 *
 * @typeParam TInput - 输入参数类型
 * @typeParam TOutput - 输出结果类型
 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: MCPContext,
) => Promise<TOutput> | TOutput

/**
 * MCP 执行上下文
 *
 * 包含请求跟踪信息、客户端信息和自定义元数据。
 * 未显式传入时，系统会自动生成包含随机 `requestId` 的上下文。
 */
export interface MCPContext {
  requestId?: string
  clientInfo?: {
    name: string
    version: string
  }
  metadata?: Record<string, unknown>
}

/**
 * MCP 资源
 *
 * 描述一个可访问的资源，通过 `uri` 唯一标识。
 * 资源可以是文件、配置、数据库记录等任意内容。
 */
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/**
 * MCP 资源内容
 *
 * 资源读取结果，支持文本（`text`）或二进制（`blob`，Base64）格式。
 */
export interface MCPResourceContent {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

/**
 * MCP 提示词模板
 *
 * 描述一个可复用的提示词模板，支持参数化。
 * 通过 `ai.mcp.getPrompt()` 传入参数后获取渲染结果。
 */
export interface MCPPrompt {
  name: string
  description?: string
  arguments?: MCPPromptArgument[]
}

/**
 * MCP 提示词参数定义
 *
 * 描述提示词模板的一个参数，包含名称、描述和是否必填。
 * `required` 为 `true` 时，调用 `getPrompt` 未传入此参数将返回 `MCP_PROTOCOL_ERROR`。
 */
export interface MCPPromptArgument {
  name: string
  description?: string
  required?: boolean
}

/**
 * MCP 提示词消息
 *
 * 提示词渲染结果中的单条消息，角色仅限 `user` 或 `assistant`。
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant'
  content: MCPPromptContent
}

/**
 * MCP 提示词内容
 *
 * 支持纯文本（`type: 'text'`）或资源引用（`type: 'resource'`）。
 */
export interface MCPPromptContent {
  type: 'text' | 'resource'
  text?: string
  resource?: {
    uri: string
    text?: string
    blob?: string
    mimeType?: string
  }
}

// =============================================================================
// MCP Server 类型
// =============================================================================

/**
 * MCP 服务器创建选项
 *
 * 传入 `createMcpServer()` 以创建 MCP 服务器实例。
 */
export interface McpServerOptions {
  /** 服务器名称 */
  name: string
  /** 服务器版本（默认 '1.0.0'） */
  version?: string
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * LLM Provider 接口
 *
 * 所有 LLM 提供者必须实现此接口。
 * 当前内置实现基于 OpenAI SDK，支持所有 OpenAI 兼容端点。
 *
 * 所有异步方法返回 `Result<T, AIError>`，不会抛出异常。
 * `chatStream` 为例外：异常通过 `AsyncIterable` 传播。
 */
export interface LLMProvider {
  /** 聊天完成 */
  chat: (request: ChatCompletionRequest) => Promise<Result<ChatCompletionResponse, AIError>>
  /** 流式聊天完成 */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取模型列表 */
  listModels: () => Promise<Result<string[], AIError>>
}

/**
 * MCP Provider 接口
 *
 * 所有 MCP 提供者必须实现此接口。
 * 提供工具、资源、提示词的注册与调用能力。
 *
 * 注册操作（`register*`）为同步，未初始化时抛出异常。
 * 调用操作（`callTool`、`readResource`、`getPrompt`）为异步，
 * 返回 `Result<T, AIError>`，不会抛出异常。
 */
export interface MCPProvider {
  /** 注册工具 */
  registerTool: <TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ) => void
  /** 注册资源 */
  registerResource: (
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ) => void
  /** 注册提示词 */
  registerPrompt: (
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ) => void
  /** 调用工具 */
  callTool: (name: string, args: unknown, context?: MCPContext) => Promise<Result<unknown, AIError>>
  /** 读取资源 */
  readResource: (uri: string) => Promise<Result<MCPResourceContent, AIError>>
  /** 获取提示词 */
  getPrompt: (name: string, args: Record<string, string>) => Promise<Result<MCPPromptMessage[], AIError>>
}

// =============================================================================
// 服务接口
// =============================================================================

/**
 * LLM 操作接口
 *
 * 通过 `ai.llm` 访问。提供大模型对话、流式响应和模型列表功能。
 * 未初始化时，`chat`/`listModels` 返回 `NOT_INITIALIZED` 错误，
 * `chatStream` 抛出 `NOT_INITIALIZED` 异常。
 */
export interface LLMOperations {
  /** 聊天完成 */
  chat: (request: ChatCompletionRequest) => Promise<Result<ChatCompletionResponse, AIError>>
  /** 流式聊天完成 */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取模型列表 */
  listModels: () => Promise<Result<string[], AIError>>
}

/**
 * MCP 操作接口
 *
 * 通过 `ai.mcp` 访问。提供 MCP 工具/资源/提示词的注册与调用。
 * 未初始化时，`register*` 抛出异常，
 * `callTool`/`readResource`/`getPrompt` 返回 `NOT_INITIALIZED` 错误。
 */
export interface MCPOperations {
  /** 注册工具 */
  registerTool: <TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ) => void
  /** 注册资源 */
  registerResource: (
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ) => void
  /** 注册提示词 */
  registerPrompt: (
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ) => void
  /** 调用工具 */
  callTool: (name: string, args: unknown, context?: MCPContext) => Promise<Result<unknown, AIError>>
  /** 读取资源 */
  readResource: (uri: string) => Promise<Result<MCPResourceContent, AIError>>
  /** 获取提示词 */
  getPrompt: (name: string, args: Record<string, string>) => Promise<Result<MCPPromptMessage[], AIError>>
}

/**
 * AI 服务接口
 *
 * 统一的 AI 服务访问入口。
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 *
 * ai.init({ llm: { model: 'gpt-4o-mini' } })
 *
 * const result = await ai.llm.chat({ messages: [...] })
 *
 * await ai.mcp.callTool('search', { query: 'hello' })
 *
 * ai.close()
 * ```
 */
export interface AIService {
  /** 初始化 AI 服务 */
  init: (config?: AIConfigInput) => Result<void, AIError>
  /** LLM 操作接口 */
  readonly llm: LLMOperations
  /** MCP 操作接口 */
  readonly mcp: MCPOperations
  /** 工具操作接口 */
  readonly tools: ToolsOperations
  /** 流处理操作接口 */
  readonly stream: StreamOperations
  /** 获取当前配置 */
  readonly config: AIConfig | null
  /** 检查是否已初始化 */
  readonly isInitialized: boolean
  /** 关闭 AI 服务 */
  close: () => void
}
