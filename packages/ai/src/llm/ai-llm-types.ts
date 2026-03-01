/**
 * @h-ai/ai — LLM 子功能类型
 *
 * 定义 LLM 消息、请求、响应、流、工具等公共类型。
 * @module ai-llm-types
 */

import type { Result } from '@h-ai/core'

import type { AIConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'

// ─── 消息类型 ───

/** 消息角色枚举：`'system'` | `'user'` | `'assistant'` | `'tool'` */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** 文本内容块（多模态消息中的纯文本部分） */
export interface TextContent {
  /** 内容类型标识 */
  type: 'text'
  /** 文本内容 */
  text: string
}

/** 图片内容块（多模态消息中的图片部分） */
export interface ImageContent {
  /** 内容类型标识 */
  type: 'image_url'
  image_url: {
    /** 图片 URL */
    url: string
    /** 细节级别，影响 Token 消耗。默认 `'auto'` */
    detail?: 'auto' | 'low' | 'high'
  }
}

/** 消息内容（纯文本字符串，或由文本/图片内容块组成的多模态数组） */
export type MessageContent = string | (TextContent | ImageContent)[]

/** 系统消息，用于设定对话的行为规则 */
export interface SystemMessage {
  role: 'system'
  /** 系统指令文本 */
  content: string
}

/** 用户消息 */
export interface UserMessage {
  role: 'user'
  /** 用户输入内容（纯文本或多模态） */
  content: MessageContent
}

/** 工具调用描述，由助手消息中的 `tool_calls` 字段携带 */
export interface ToolCall {
  /** 调用唯一标识（API 生成，用于关联 ToolMessage） */
  id: string
  /** 固定为 `'function'` */
  type: 'function'
  function: {
    /** 工具名称 */
    name: string
    /** JSON 格式的参数字符串 */
    arguments: string
  }
}

/** 助手消息（模型生成的回复） */
export interface AssistantMessage {
  role: 'assistant'
  /** 文本回复内容；当有 `tool_calls` 时通常为 `null` */
  content: string | null
  /** 工具调用列表（可选，模型决定调用工具时填充） */
  tool_calls?: ToolCall[]
}

/** 工具消息（工具执行结果，用于回传给模型） */
export interface ToolMessage {
  role: 'tool'
  /** 工具执行结果（字符串格式，对象需 JSON.stringify） */
  content: string
  /** 对应的工具调用 ID（必须与 ToolCall.id 匹配） */
  tool_call_id: string
}

/** 聊天消息联合类型，涵盖对话中所有角色的消息 */
export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

// ─── 请求与响应 ───

/** OpenAI function calling 工具定义格式 */
export interface ToolDefinition {
  /** 固定为 `'function'` */
  type: 'function'
  function: {
    /** 工具名称（需唯一） */
    name: string
    /** 工具功能描述（供模型理解何时调用） */
    description: string
    /** JSON Schema 格式的参数定义 */
    parameters: Record<string, unknown>
  }
}

/** 聊天完成请求参数 */
export interface ChatCompletionRequest {
  /** 模型名称（可选，未指定时使用配置中的默认模型） */
  model?: string
  /** 消息列表 */
  messages: ChatMessage[]
  /** 采样温度，范围 `[0, 2]`（值越高回复越随机） */
  temperature?: number
  /** 核采样概率，范围 `[0, 1]`（与 temperature 二选一） */
  top_p?: number
  /** 单次回复最大 Token 数 */
  max_tokens?: number
  /** 是否启用流式响应 */
  stream?: boolean
  /** 可用工具列表（传入后模型可决定调用） */
  tools?: ToolDefinition[]
  /** 工具选择策略：`'auto'` 自动、`'none'` 禁用、或指定函数名强制调用 */
  tool_choice?: 'auto' | 'none' | { type: 'function', function: { name: string } }
}

/** Token 使用统计 */
export interface TokenUsage {
  /** 输入 Token 数（prompt） */
  prompt_tokens: number
  /** 输出 Token 数（completion） */
  completion_tokens: number
  /** 总 Token 数 */
  total_tokens: number
}

/** 聊天完成响应中的单个选择 */
export interface ChatCompletionChoice {
  /** 选择索引（从 0 开始） */
  index: number
  /** 助手回复消息 */
  message: AssistantMessage
  /** 完成原因：`'stop'` 正常结束 | `'length'` 达到 max_tokens | `'tool_calls'` 需要工具调用 | `'content_filter'` 内容过滤 */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
}

/** 聊天完成响应（非流式） */
export interface ChatCompletionResponse {
  /** 响应唯一标识 */
  id: string
  /** 固定为 `'chat.completion'` */
  object: 'chat.completion'
  /** 创建时间戳（Unix 秒） */
  created: number
  /** 实际使用的模型名称 */
  model: string
  /** 回复选择列表 */
  choices: ChatCompletionChoice[]
  /** Token 使用统计 */
  usage: TokenUsage
}

/** 流式增量内容（每个 chunk 中的变化部分） */
export interface ChatCompletionDelta {
  /** 消息角色（仅在首个 chunk 中出现） */
  role?: 'assistant'
  /** 追加的文本片段 */
  content?: string
  /** 追加的工具调用片段（按 index 逐步拼接参数） */
  tool_calls?: Array<{
    /** 工具调用在列表中的索引（用于多个并行调用的拼接） */
    index: number
    /** 调用 ID（仅在该工具调用的首个 chunk 出现） */
    id?: string
    /** 固定为 `'function'` */
    type?: 'function'
    function?: {
      /** 工具名称（仅首个 chunk 出现） */
      name?: string
      /** 参数 JSON 片段（逐步追加拼接） */
      arguments?: string
    }
  }>
}

/** 流式响应块（SSE 传输的单个数据帧） */
export interface ChatCompletionChunk {
  /** 响应唯一标识（同一流的所有 chunk 共享） */
  id: string
  /** 固定为 `'chat.completion.chunk'` */
  object: 'chat.completion.chunk'
  /** 创建时间戳（Unix 秒） */
  created: number
  /** 模型名称 */
  model: string
  choices: Array<{
    /** 选择索引 */
    index: number
    /** 增量内容 */
    delta: ChatCompletionDelta
    /** 完成原因（流未结束时为 `null`） */
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
  }>
}

// ─── 流处理 ───

/** 流处理结果（完整消费流后的累积数据） */
export interface StreamResult {
  /** 累积的完整文本内容 */
  content: string
  /** 累积的完整工具调用列表 */
  toolCalls: ToolCall[]
  /** 完成原因（流未结束时为 `null`） */
  finishReason: string | null
}

/**
 * 流处理器接口
 *
 * 逐 chunk 喂入，内部累积文本和工具调用，支持 reset 复用。
 */
export interface StreamProcessor {
  /** 处理单个 chunk，返回增量 delta；空 choices 时返回 `null` */
  process: (chunk: ChatCompletionChunk) => ChatCompletionDelta | null
  /** 获取当前累积结果（不重置状态） */
  getResult: () => StreamResult
  /** 将累积结果转换为 AssistantMessage（有 tool_calls 时 content 为 `null`） */
  toAssistantMessage: () => AssistantMessage
  /** 重置内部状态，可重新处理新一轮流 */
  reset: () => void
}

/** SSE（Server-Sent Events）事件结构 */
export interface SSEEvent {
  /** 事件类型（`event:` 字段） */
  event?: string
  /** 事件 ID（`id:` 字段） */
  id?: string
  /** 重连间隔（毫秒，`retry:` 字段） */
  retry?: number
  /** 数据载荷（`data:` 字段，多行数据以 `\n` 合并） */
  data?: string
}

/**
 * SSE 解码器接口
 *
 * 内部维护缓冲区，支持跨 chunk 的不完整数据拼接。
 */
export interface SSEDecoder {
  /** 追加文本并解码出完整事件；未完成的部分留在缓冲区 */
  decode: (text: string) => Iterable<SSEEvent>
  /** 清空缓冲区 */
  reset: () => void
}

/** 流处理操作接口（通过 `ai.stream` 访问，纯函数，无需初始化） */
export interface StreamOperations {
  /** 创建新的流处理器实例 */
  createProcessor: () => StreamProcessor
  /** 完整消费流并返回累积结果 */
  collect: (stream: AsyncIterable<ChatCompletionChunk>) => Promise<StreamResult>
  /** 创建新的 SSE 解码器实例 */
  createSSEDecoder: () => SSEDecoder
  /** 将 SSE 事件编码为符合规范的文本（以 `\n\n` 结尾） */
  encodeSSE: (event: SSEEvent) => string
}

// ─── 工具操作 ───

/** 工具错误类型枚举 */
export type ToolErrorType
  = | 'TOOL_NOT_FOUND'
    | 'VALIDATION_FAILED'
    | 'EXECUTION_FAILED'
    | 'TIMEOUT'

/** 工具执行错误 */
export interface ToolError {
  /** 错误分类 */
  type: ToolErrorType
  /** 错误描述 */
  message: string
  /** 关联的工具名称（可选） */
  toolName?: string
}

/**
 * 工具定义选项（传给 `ai.tools.define()`）
 *
 * @typeParam TInput - 参数类型（由 Zod schema 推断）
 * @typeParam TOutput - 返回值类型
 */
export interface DefineToolOptions<TInput, TOutput> {
  /** 工具名称（需唯一，用于 function calling name 字段） */
  name: string
  /** 工具功能描述（供模型理解何时调用） */
  description: string
  /** Zod schema，用于参数校验和 JSON Schema 转换 */
  parameters: import('zod').ZodType<TInput>
  /** 执行函数，接收校验后的参数，支持同步/异步 */
  handler: (input: TInput) => Promise<TOutput> | TOutput
}

/**
 * 工具实例（由 `ai.tools.define()` 创建）
 *
 * @typeParam TInput - 参数类型
 * @typeParam TOutput - 返回值类型
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** 工具名称 */
  name: string
  /** 工具功能描述 */
  description: string
  /** Zod 参数 schema */
  parameters: import('zod').ZodType<TInput>
  /** 执行工具（自动校验参数），失败返回 ToolError */
  execute: (input: TInput) => Promise<Result<TOutput, ToolError>>
  /** 转换为 OpenAI function calling 定义格式（$schema 字段已移除） */
  toDefinition: () => ToolDefinition
}

/**
 * 工具注册表接口（由 `ai.tools.createRegistry()` 创建）
 *
 * 管理一组工具的注册、查询与批量执行，支持链式调用。
 */
export interface ToolRegistryOperations {
  /** 注册工具（同名覆盖），返回 registry 自身以支持链式调用 */
  register: <TInput, TOutput>(tool: Tool<TInput, TOutput>) => ToolRegistryOperations
  /** 批量注册工具，返回 registry 自身 */
  registerMany: (tools: Tool<unknown, unknown>[]) => ToolRegistryOperations
  /** 注销指定名称的工具，成功返回 `true`，不存在返回 `false` */
  unregister: (name: string) => boolean
  /** 按名称获取工具实例，不存在返回 `undefined` */
  get: (name: string) => Tool | undefined
  /** 判断指定名称的工具是否已注册 */
  has: (name: string) => boolean
  /** 获取所有已注册的工具名称列表 */
  getNames: () => string[]
  /** 获取所有工具的 OpenAI function calling 定义（用于传入 ChatCompletionRequest.tools） */
  getDefinitions: () => ToolDefinition[]
  /** 执行单个工具调用，自动解析 JSON 参数并校验；失败返回 ToolError */
  execute: (toolCall: ToolCall) => Promise<Result<ToolMessage, ToolError>>
  /** 批量执行工具调用（默认并行），任一失败立即返回错误 */
  executeAll: (toolCalls: ToolCall[], options?: { parallel?: boolean }) => Promise<Result<ToolMessage[], ToolError>>
  /** 清空所有已注册的工具 */
  clear: () => void
  /** 当前已注册的工具数量 */
  readonly size: number
}

/** 工具操作接口（通过 `ai.tools` 访问，纯函数，无需初始化） */
export interface ToolsOperations {
  /** 定义工具（Zod schema 类型推断 + 自动参数校验） */
  define: <TInput, TOutput>(options: DefineToolOptions<TInput, TOutput>) => Tool<TInput, TOutput>
  /** 创建新的工具注册表实例 */
  createRegistry: () => ToolRegistryOperations
}

// ─── LLM Provider 接口 ───

/**
 * LLM Provider 接口
 *
 * 底层 API 适配层，当前内置 OpenAI 兼容实现。
 */
export interface LLMProvider {
  /** 发送聊天请求并获取完整响应 */
  chat: (request: ChatCompletionRequest) => Promise<Result<ChatCompletionResponse, AIError>>
  /** 发送聊天请求并获取流式响应（逐 chunk 产出） */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取可用模型列表 */
  listModels: () => Promise<Result<string[], AIError>>
}

// ─── LLM 操作接口 ───

/**
 * LLM 操作接口（通过 `ai.llm` 访问）
 *
 * 需要先调用 `ai.init()` 初始化，否则返回 `NOT_INITIALIZED` 错误。
 */
export interface LLMOperations {
  /** 发送聊天请求，返回 `Result<ChatCompletionResponse, AIError>` */
  chat: (request: ChatCompletionRequest) => Promise<Result<ChatCompletionResponse, AIError>>
  /** 发送流式聊天请求，逐 chunk 产出 `ChatCompletionChunk` */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取可用模型名称列表 */
  listModels: () => Promise<Result<string[], AIError>>
}

// ─── LLM 工厂依赖 ───

/** LLM 子功能工厂依赖（内部使用） */
export interface AILLMFunctionsDeps {
  /** 校验后的 AI 配置 */
  config: AIConfig
}
