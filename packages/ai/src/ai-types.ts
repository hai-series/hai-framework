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
 * - 技能相关类型
 * - 工具相关类型
 * - Provider 接口
 * - 服务接口
 *
 * @example
 * ```ts
 * import type { AIService, ChatMessage, LLMProvider } from '@hai/ai'
 *
 * // 使用聊天消息类型
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
  MCPServerCapabilities,
} from './ai-config.js'

// =============================================================================
// 重新导出配置类型（方便使用）
// =============================================================================

export type {
  AIConfig,
  AIConfigInput,
  AIErrorCodeType,
  AIProvider,
  LLMConfig,
  MCPClientConfig,
  MCPConfig,
  MCPServerCapabilities,
  MCPServerConfig,
} from './ai-config.js'

export {
  AIConfigSchema,
  AIErrorCode,
  AIProviderSchema,
  LLMConfigSchema,
  MCPClientConfigSchema,
  MCPConfigSchema,
  MCPServerCapabilitiesSchema,
  MCPServerConfigSchema,
} from './ai-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * AI 错误接口
 *
 * 所有 AI 操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = await ai.llm.chat({ messages: [...] })
 * if (!result.success) {
 *     const error: AIError = result.error
 *     // 处理错误：根据 error.code / error.message 做兜底
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
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * 文本内容
 */
export interface TextContent {
  type: 'text'
  text: string
}

/**
 * 图片内容
 */
export interface ImageContent {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

/**
 * 消息内容（可以是纯文本或混合内容）
 */
export type MessageContent = string | (TextContent | ImageContent)[]

/**
 * 系统消息
 */
export interface SystemMessage {
  role: 'system'
  content: string
}

/**
 * 用户消息
 */
export interface UserMessage {
  role: 'user'
  content: MessageContent
}

/**
 * 工具调用
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
 */
export interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

/**
 * 工具消息
 */
export interface ToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
}

/**
 * 聊天消息（联合类型）
 */
export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

// =============================================================================
// LLM 请求与响应类型
// =============================================================================

/**
 * 工具定义（OpenAI 格式）
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
 */
export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/**
 * 聊天完成选择
 */
export interface ChatCompletionChoice {
  index: number
  message: AssistantMessage
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
}

/**
 * 聊天完成响应
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
 */
export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * MCP 工具处理器
 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: MCPContext,
) => Promise<TOutput> | TOutput

/**
 * MCP 执行上下文
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
 */
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/**
 * MCP 资源内容
 */
export interface MCPResourceContent {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

/**
 * MCP 提示词
 */
export interface MCPPrompt {
  name: string
  description?: string
  arguments?: MCPPromptArgument[]
}

/**
 * MCP 提示词参数
 */
export interface MCPPromptArgument {
  name: string
  description?: string
  required?: boolean
}

/**
 * MCP 提示词消息
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant'
  content: MCPPromptContent
}

/**
 * MCP 提示词内容
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

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
  name: string
  version: string
  capabilities: MCPServerCapabilities
}

/**
 * MCP 客户端信息
 */
export interface MCPClientInfo {
  name: string
  version: string
}

// =============================================================================
// 技能相关类型
// =============================================================================

/**
 * 技能元数据
 */
export interface SkillMetadata {
  name: string
  description?: string
  version?: string
  tags?: string[]
  author?: string
}

/**
 * 技能上下文
 */
export interface SkillContext {
  requestId?: string
  userId?: string
  metadata?: Record<string, unknown>
}

/**
 * 技能执行结果
 */
export interface SkillResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 技能定义
 */
export interface Skill<TInput = unknown, TOutput = unknown> {
  metadata: SkillMetadata
  execute: (input: TInput, context: SkillContext) => Promise<SkillResult<TOutput>>
}

/**
 * 技能查询条件
 */
export interface SkillQuery {
  name?: string
  tags?: string[]
  author?: string
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * LLM Provider 接口
 *
 * 所有 LLM 提供者必须实现此接口。
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

/**
 * Skills Provider 接口
 *
 * 所有技能提供者必须实现此接口。
 */
export interface SkillsProvider {
  /** 注册技能 */
  register: <TInput, TOutput>(skill: Skill<TInput, TOutput>) => void
  /** 注销技能 */
  unregister: (name: string) => void
  /** 获取技能 */
  get: (name: string) => Skill | undefined
  /** 查询技能 */
  query: (query: SkillQuery) => Skill[]
  /** 执行技能 */
  execute: <TInput, TOutput>(
    name: string,
    input: TInput,
    context?: SkillContext,
  ) => Promise<Result<SkillResult<TOutput>, AIError>>
}

// =============================================================================
// 服务接口
// =============================================================================

/**
 * LLM 操作接口
 *
 * 提供对外的 LLM 操作方法。
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
 * 提供对外的 MCP 操作方法。
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
 * Skills 操作接口
 *
 * 提供对外的技能操作方法。
 */
export interface SkillsOperations {
  /** 注册技能 */
  register: <TInput, TOutput>(skill: Skill<TInput, TOutput>) => void
  /** 注销技能 */
  unregister: (name: string) => void
  /** 获取技能 */
  get: (name: string) => Skill | undefined
  /** 查询技能 */
  query: (query: SkillQuery) => Skill[]
  /** 执行技能 */
  execute: <TInput, TOutput>(
    name: string,
    input: TInput,
    context?: SkillContext,
  ) => Promise<Result<SkillResult<TOutput>, AIError>>
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
 * // 初始化
 * ai.init({ llm: { model: 'gpt-4o-mini' } })
 *
 * // LLM 调用
 * const result = await ai.llm.chat({ messages: [...] })
 *
 * // MCP 工具调用
 * await ai.mcp.callTool('search', { query: 'hello' })
 *
 * // 关闭
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
  /** Skills 操作接口 */
  readonly skills: SkillsOperations
  /** 获取当前配置 */
  readonly config: AIConfig | null
  /** 检查是否已初始化 */
  readonly isInitialized: boolean
  /** 关闭 AI 服务 */
  close: () => void
}
