/**
 * @h-ai/ai — LLM 子功能类型
 *
 * 定义 LLM 消息、请求、响应、流、工具等公共类型。
 * @module ai-llm-types
 */

import type { HaiResult } from '@h-ai/core'
import type OpenAI from 'openai'
import type { ZodType } from 'zod'

import type { AIConfig, ApiType } from '../ai-config.js'

import type { InteractionScope, SessionInfo } from '../store/ai-store-types.js'

// ─── 消息类型 ───

/** 消息角色枚举：`'system'` | `'developer'` | `'user'` | `'assistant'` | `'tool'` */
export type MessageRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool'

/** 文本内容块（多模态消息中的纯文本部分） */
export type TextContent = OpenAI.Chat.Completions.ChatCompletionContentPartText

/** 图片内容块（多模态消息中的图片部分） */
export type ImageContent = OpenAI.Chat.Completions.ChatCompletionContentPartImage

/** 消息内容（纯文本字符串，或由内容块组成的多模态数组） */
export type MessageContent = string | OpenAI.Chat.Completions.ChatCompletionContentPart[]

/** 系统消息，用于设定对话的行为规则 */
export type SystemMessage = OpenAI.Chat.Completions.ChatCompletionSystemMessageParam

/** 开发者消息（高优先级运行时约束） */
export interface DeveloperMessage {
  role: 'developer'
  content: string | TextContent[]
  name?: string
}

/** 用户消息 */
export type UserMessage = OpenAI.Chat.Completions.ChatCompletionUserMessageParam

/** 工具调用描述，由助手消息中的 `tool_calls` 字段携带 */
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall

/** 助手消息（模型生成的回复，或传入对话上下文的助手轮次） */
export type AssistantMessage = OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
  /**
   * 推理模型额外返回的思维链内容。
   *
   * DeepSeek thinking mode 在 function calling 多轮续写时要求回传该字段。
   */
  reasoning_content?: string | null
}

/** 工具消息（工具执行结果，用于回传给模型） */
export type ToolMessage = OpenAI.Chat.Completions.ChatCompletionToolMessageParam

/** 聊天消息联合类型，涵盖对话中所有角色的消息 */
export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam | DeveloperMessage

// ─── 请求与响应 ───

/** OpenAI function calling 工具定义格式 */
export type ToolDefinition = OpenAI.Chat.Completions.ChatCompletionTool

/**
 * 临时模型配置
 *
 * 单次请求级别的临时模型端点，绕过配置中注册的模型与场景映射，
 * 直接指定 API Key / Base URL / 模型名等参数。适用于运行时动态切换模型、
 * 多租户各自携带凭据等场景。其客户端实例按 TTL 缓存（见 `LLMConfig.tempModelCacheTtl`），
 * 与常驻模型客户端缓存隔离。
 *
 * 未指定的字段回退到全局 LLM 配置：`apiKey` / `baseUrl` 回退全局值或环境变量，
 * `maxTokens` / `temperature` / `timeout` 回退全局默认值。
 */
export interface TempModelConfig {
  /** 模型名称（传给 API 的实际模型名） */
  model: string
  /** API 协议（未指定时回退全局 `api`，再回退 `chat`；决定走 Chat Completions / Responses / Anthropic） */
  api?: ApiType
  /** API Key（未指定时回退全局配置 / 环境变量） */
  apiKey?: string
  /** API 基础 URL（未指定时回退全局配置 / 环境变量 / 默认 OpenAI） */
  baseUrl?: string
  /** 最大 Token 数（未指定时回退全局配置；请求显式指定 `max_tokens` 时以请求为准） */
  maxTokens?: number
  /** 采样温度（未指定时回退全局配置；请求显式指定 `temperature` 时以请求为准） */
  temperature?: number
  /** 请求超时时间（毫秒，未指定时回退全局配置） */
  timeout?: number
}

/**
 * 聊天完成请求参数
 *
 * 继承 OpenAI SDK 全部标准请求字段，并扩展框架专属字段（`objectId`、`sessionId`）。
 * `model` 改为可选（未指定时使用配置中的默认模型）。
 * `stream` 字段由框架内部控制，不对外暴露。
 */
export type ChatCompletionRequest
  = Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, 'model' | 'stream' | 'messages'> & {
    /** 对话消息列表 */
    messages: ChatMessage[]
    /** 模型名称（可选，未指定时使用配置中的默认模型） */
    model?: string
    /** 交互主体 ID（传入后 LLM 会自动关联到该主体） */
    objectId?: string
    /** 会话 ID（传入后 LLM 会自动关联到该会话） */
    sessionId?: string
    /** 是否持久化对话记录（默认 true；传入 false 时跳过记录，适用于内部调用如实体提取） */
    enablePersist?: boolean
    /** 临时模型配置（传入后绕过配置注册的模型，使用临时端点；优先级高于 `model`） */
    tempModel?: TempModelConfig
    /**
     * 请求取消信号
     *
     * 传入后透传给底层 SDK（OpenAI / Anthropic）的请求取消参数。主持人打断、
     * 用户切换等场景可 `abortController.abort()` 立即停止上游生成与计费。
     */
    signal?: AbortSignal
  }

/** Token 使用统计 */
export type TokenUsage = OpenAI.CompletionUsage

/** 聊天完成响应中的单个选择 */
export type ChatCompletionChoice = OpenAI.Chat.ChatCompletion.Choice

/** 聊天完成响应（非流式） */
export type ChatCompletionResponse = OpenAI.Chat.ChatCompletion

/** 流式增量内容（每个 chunk 中的变化部分） */
export type ChatCompletionDelta = OpenAI.Chat.ChatCompletionChunk.Choice.Delta

/** 流式响应块（SSE 传输的单个数据帧） */
export type ChatCompletionChunk = OpenAI.Chat.ChatCompletionChunk

// ─── 流处理 ───

/** 流处理结果（完整消费流后的累积数据） */
export interface StreamResult {
  /** 累积的完整文本内容 */
  content: string
  /** 累积的完整 reasoning 内容 */
  reasoningContent: string
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

/**
 * 工具执行上下文（传给 handler）
 *
 * 由框架在 `execute` / `executeAll` 时构造并透传给工具 handler，使工具能够：
 * - 响应取消（主持人打断、上层 AbortSignal）提前中止耗时操作（DB 查询 / HTTP 请求）；
 * - 感知超时截止时间；
 * - 获知当前交互主体 / 会话，做数据隔离或审计。
 *
 * `signal` 始终存在：即便调用方未传入信号，框架也会依据默认超时构造一个。
 */
export interface ToolExecutionContext {
  /** 取消信号（始终存在；结合调用方信号与超时截止） */
  signal: AbortSignal
  /** 交互主体 ID（透传自 Context / Reasoning 作用域） */
  objectId?: string
  /** 会话 ID（透传自 Context / Reasoning 作用域） */
  sessionId?: string
  /** 截止时间（Unix 毫秒；到期自动取消） */
  deadline?: number
}

/**
 * 工具执行入参（调用方传给 `execute` / `executeAll`）
 *
 * 所有字段可选。框架据此解析出传给 handler 的 {@link ToolExecutionContext}：
 * 组合调用方 `signal` 与超时信号，超时优先级 `deadline` > `timeoutMs` > 工具默认 > 全局默认。
 */
export interface ToolExecutionOptions {
  /** 调用方取消信号（与超时信号组合） */
  signal?: AbortSignal
  /** 交互主体 ID */
  objectId?: string
  /** 会话 ID */
  sessionId?: string
  /** 截止时间（Unix 毫秒；优先级高于 timeoutMs） */
  deadline?: number
  /** 本次执行超时（毫秒；覆盖工具默认超时） */
  timeoutMs?: number
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
  parameters: ZodType<TInput>
  /**
   * 执行函数，接收校验后的参数与执行上下文，支持同步/异步
   *
   * `context.signal` 用于响应取消：长耗时操作应把它透传给 DB / HTTP 客户端，
   * 以便打断或超时时提前中止。
   */
  handler: (input: TInput, context: ToolExecutionContext) => Promise<TOutput> | TOutput
  /** 本工具默认执行超时（毫秒；execute 未指定 deadline/timeoutMs 时生效） */
  timeoutMs?: number
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
  parameters: ZodType<TInput>
  /** 执行工具（自动校验参数），失败返回 ToolError；超时 / 取消返回 TOOL_TIMEOUT */
  execute: (input: TInput, options?: ToolExecutionOptions) => Promise<HaiResult<TOutput>>
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
  /** 执行单个工具调用，自动解析 JSON 参数并校验；失败返回 ToolError，超时 / 取消返回 TOOL_TIMEOUT */
  execute: (toolCall: ToolCall, options?: ToolExecutionOptions) => Promise<HaiResult<ToolMessage>>
  /** 批量执行工具调用（默认并行），任一失败立即返回错误；执行上下文透传给每个工具 */
  executeAll: (toolCalls: ToolCall[], options?: ToolExecutionOptions & { parallel?: boolean }) => Promise<HaiResult<ToolMessage[]>>
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

// ─── 对话记录 ───

/** 对话记录查询选项 */
export interface ChatHistoryOptions {
  /** 返回数量限制 */
  limit?: number
  /** 排序方向（默认 `'desc'` 最新在前） */
  order?: 'asc' | 'desc'
}

/**
 * ask/askStream 便捷方法选项
 */
export interface AskOptions {
  /** 系统提示词 */
  systemPrompt?: string
  /** 使用的模型 */
  model?: string
  /** 交互主体 ID */
  objectId?: string
  /** 会话 ID */
  sessionId?: string
  /** 温度（0~2） */
  temperature?: number
  /** 是否持久化对话记录（默认 true；传入 false 时跳过记录） */
  enablePersist?: boolean
  /** 临时模型配置（传入后绕过配置注册的模型，使用临时端点；优先级高于 `model`） */
  tempModel?: TempModelConfig
  /** 请求取消信号（透传给底层 SDK，支持主动打断上游生成） */
  signal?: AbortSignal
}

/**
 * 对话记录
 *
 * 每次 `llm.chat()` 调用在传入 `objectId` 时自动保存的请求+响应快照。
 */
export interface ChatRecord {
  /** 记录唯一 ID */
  id: string
  /** 交互主体 ID */
  objectId: string
  /** 会话 ID */
  sessionId: string
  /** 请求摘要 */
  request: {
    model: string
    messages: ChatMessage[]
  }
  /** 响应摘要 */
  response: {
    content: string
    toolCalls?: ToolCall[]
    finishReason: string
    usage: TokenUsage
  }
  /** 创建时间（Unix 毫秒） */
  createdAt: number
  /** 耗时（毫秒） */
  duration: number
}

// ─── LLM Provider 接口 ───

/**
 * LLM Provider 接口
 *
 * 底层 API 适配层，当前内置 OpenAI 兼容实现。
 */
export interface LLMProvider {
  /** 发送聊天请求并获取完整响应 */
  chat: (request: ChatCompletionRequest) => Promise<HaiResult<ChatCompletionResponse>>
  /** 发送聊天请求并获取流式响应（逐 chunk 产出） */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取可用模型列表 */
  listModels: () => Promise<HaiResult<string[]>>
}

// ─── LLM 操作接口 ───

/**
 * 结构化输出请求
 *
 * 给定 Zod schema，让模型返回严格符合结构的 JSON（内部使用 `json_schema` response_format），
 * 解析失败时自动带错误修复重试，避免调用方手写 `JSON.parse` 的不稳定性。
 */
export interface GenerateObjectRequest<T> {
  /** 输出结构的 Zod schema */
  schema: ZodType<T>
  /** 对话消息 */
  messages: ChatMessage[]
  /** 模型名（可选，不传时使用默认模型） */
  model?: string
  /** 系统提示词（可选，追加为首条 system 消息） */
  systemPrompt?: string
  /** 温度覆盖 */
  temperature?: number
  /** 临时模型配置 */
  tempModel?: TempModelConfig
  /** schema 名称（用于 json_schema response_format，默认 `result`） */
  schemaName?: string
  /** 解析失败时的修复重试次数（默认 1） */
  maxRepairs?: number
  /** 取消信号 */
  signal?: AbortSignal
}

/**
 * LLM 操作接口（通过 `ai.llm` 访问）
 *
 * 需要先调用 `ai.init()` 初始化，否则返回 `NOT_INITIALIZED` 错误。
 */
export interface LLMOperations {
  /** 发送聊天请求，返回 `HaiResult<ChatCompletionResponse>` */
  chat: (request: ChatCompletionRequest) => Promise<HaiResult<ChatCompletionResponse>>
  /** 发送流式聊天请求，逐 chunk 产出 `ChatCompletionChunk` */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取可用模型名称列表 */
  listModels: () => Promise<HaiResult<string[]>>
  /** 查询对话历史记录（需传入 objectId；可选 sessionId 以按会话过滤） */
  getHistory: (scope: InteractionScope, options?: ChatHistoryOptions) => Promise<HaiResult<ChatRecord[]>>
  /** 列出指定 objectId 下的所有会话 */
  listSessions: (objectId: string) => Promise<HaiResult<SessionInfo[]>>

  /**
   * 便捷方法：发送纯文本问题，返回回复文本
   *
   * 内部构建 ChatCompletionRequest 并调用 `chat()`，只返回第一个 choice 的文本。
   *
   * @param question - 用户问题文本
   * @param options - 可选的模型、systemPrompt、objectId、sessionId 等
   * @returns 回复文本
   */
  ask: (question: string, options?: AskOptions) => Promise<HaiResult<string>>

  /**
   * 便捷方法：流式发送纯文本问题，返回文本片段异步迭代器
   *
   * @param question - 用户问题文本
   * @param options - 可选配置
   * @returns 文本片段的异步迭代器
   */
  askStream: (question: string, options?: AskOptions) => AsyncIterable<string>

  /**
   * 结构化输出：按 Zod schema 约束模型输出并解析为对象
   *
   * 内部使用 `json_schema` response_format 约束输出，解析/校验失败时自动带错误提示重试。
   *
   * @param request - 包含 schema、messages 及可选模型/修复次数等
   * @returns 符合 schema 的对象；多次重试仍无法解析时返回 `INVALID_REQUEST`
   */
  generateObject: <T>(request: GenerateObjectRequest<T>) => Promise<HaiResult<T>>
}

// ─── LLM 工厂依赖 ───

/** LLM 子功能工厂依赖（内部使用） */
export interface AILLMFunctionsDeps {
  /** 校验后的 AI 配置 */
  config: AIConfig
}
