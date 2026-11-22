/**
 * @h-ai/ai — LLM 子功能类型
 *
 * 定义 LLM 消息、请求、响应、流、工具等公共类型。
 * @module ai-llm-types
 */

import type { HaiResult } from '@h-ai/core'
import type { ToolRegistryOperations as NeutralToolRegistryOperations, ToolExecutionOptions } from '@h-ai/tools'
import type OpenAI from 'openai'
import type { ZodType } from 'zod'

import type { ApiType } from '../ai-config.js'
import type { InteractionScope, SessionInfo } from '../store/ai-store-types.js'

import type { createMcpTools } from '../tools/ai-tools-mcp.js'
import type { BuiltinToolBroker, BuiltinToolBrokerOptions, CreateBuiltinTools } from '../tools/ai-tools-types.js'

// ─── 消息类型 ───

/**
 * 消息角色枚举：`'system'` | `'developer'` | `'user'` | `'assistant'` | `'tool'`
 *
 * @example
 * ```ts
 * import type { MessageRole } from '@h-ai/ai'
 *
 * const value: MessageRole = 'developer'
 * ```
 */
export type MessageRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool'

/**
 * 文本内容块（多模态消息中的纯文本部分）
 *
 * @example
 * ```ts
 * import type { TextContent } from '@h-ai/ai'
 *
 * const value: TextContent = { type: 'text', text: '请说明这张图的主要内容。' }
 * ```
 */
export type TextContent = OpenAI.Chat.Completions.ChatCompletionContentPartText

/**
 * 图片内容块（多模态消息中的图片部分）
 *
 * @example
 * ```ts
 * import type { ImageContent } from '@h-ai/ai'
 *
 * const value: ImageContent = { type: 'image_url', image_url: { url: 'https://images.example.com/diagram.png', detail: 'low' } }
 * ```
 */
export type ImageContent = OpenAI.Chat.Completions.ChatCompletionContentPartImage

/**
 * 消息内容（纯文本字符串，或由内容块组成的多模态数组）
 *
 * @example
 * ```ts
 * import type { MessageContent } from '@h-ai/ai'
 *
 * const value: MessageContent = [{ type: 'text', text: '提取图中的标题' }, { type: 'image_url', image_url: { url: 'https://images.example.com/title.png' } }]
 * ```
 */
export type MessageContent = string | OpenAI.Chat.Completions.ChatCompletionContentPart[]

/**
 * 系统消息，用于设定对话的行为规则
 *
 * @example
 * ```ts
 * import type { SystemMessage } from '@h-ai/ai'
 *
 * const value: SystemMessage = { role: 'system', content: '仅依据提供的订单数据回答。' }
 * ```
 */
export type SystemMessage = OpenAI.Chat.Completions.ChatCompletionSystemMessageParam

/**
 * 开发者消息（高优先级运行时约束）
 *
 * @example
 * ```ts
 * import type { DeveloperMessage } from '@h-ai/ai'
 *
 * const value: DeveloperMessage = { role: 'developer', content: '调用工具前先验证订单访问权限。' }
 * ```
 */
export interface DeveloperMessage {
  role: 'developer'
  content: string | TextContent[]
  name?: string
}

/**
 * 用户消息
 *
 * @example
 * ```ts
 * import type { UserMessage } from '@h-ai/ai'
 *
 * const value: UserMessage = { role: 'user', content: '订单 o-1 的状态是什么？' }
 * ```
 */
export type UserMessage = OpenAI.Chat.Completions.ChatCompletionUserMessageParam

/**
 * 工具调用描述，由助手消息中的 `tool_calls` 字段携带
 *
 * @example
 * ```ts
 * import type { ToolCall } from '@h-ai/ai'
 *
 * const value: ToolCall = { id: 'call-order-1', type: 'function', function: { name: 'order_status', arguments: JSON.stringify({ orderId: 'o-1' }) } }
 * ```
 */
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall

/**
 * 助手消息（模型生成的回复，或传入对话上下文的助手轮次）
 *
 * @example
 * ```ts
 * import type { AssistantMessage } from '@h-ai/ai'
 *
 * const value: AssistantMessage = { role: 'assistant', content: null, tool_calls: [{ id: 'call-order-1', type: 'function', function: { name: 'order_status', arguments: JSON.stringify({ orderId: 'o-1' }) } }] }
 * ```
 */
export type AssistantMessage = OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
  /**
   * 推理模型额外返回的思维链内容。
   *
   * DeepSeek thinking mode 在 function calling 多轮续写时要求回传该字段。
   */
  reasoning_content?: string | null
}

/**
 * 工具消息（工具执行结果，用于回传给模型）
 *
 * @example
 * ```ts
 * import type { ToolMessage } from '@h-ai/ai'
 *
 * const value: ToolMessage = { role: 'tool', tool_call_id: 'call-order-1', content: JSON.stringify({ status: 'shipped' }) }
 * ```
 */
export type ToolMessage = OpenAI.Chat.Completions.ChatCompletionToolMessageParam

/**
 * 聊天消息联合类型，涵盖对话中所有角色的消息
 *
 * @example
 * ```ts
 * import type { ChatMessage } from '@h-ai/ai'
 *
 * const value: ChatMessage = { role: 'user', content: '请总结本周进展。' }
 * ```
 */
export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam | DeveloperMessage

// ─── 请求与响应 ───

/**
 * OpenAI function calling 工具定义格式
 *
 * @example
 * ```ts
 * import type { ToolDefinition } from '@h-ai/ai'
 *
 * const value: ToolDefinition = { type: 'function', function: { name: 'sum', description: '计算两个数之和', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } } }
 * ```
 */
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
 *
 * @example
 * ```ts
 * import type { TempModelConfig } from '@h-ai/ai'
 *
 * const value: TempModelConfig = { model: 'gpt-4o-mini', protocol: 'chat', timeout: 15_000 }
 * ```
 */
export interface TempModelConfig {
  /** 模型名称（传给 API 的实际模型名） */
  model: string
  /** API 协议（未指定时回退全局 `protocol`，再回退 `chat`；决定走 Chat Completions / Responses / Anthropic） */
  protocol?: ApiType
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
 *
 * @example
 * ```ts
 * import type { ChatCompletionRequest } from '@h-ai/ai'
 *
 * const value: ChatCompletionRequest = { messages: [{ role: 'user', content: '给出三个待办事项。' }], objectId: 'user-42', sessionId: 'weekly', temperature: 0.2, signal: new AbortController().signal }
 * ```
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

/**
 * Token 使用统计
 *
 * @example
 * ```ts
 * import type { TokenUsage } from '@h-ai/ai'
 *
 * const value: TokenUsage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
 * ```
 */
export type TokenUsage = OpenAI.CompletionUsage

/**
 * 聊天完成响应中的单个选择
 *
 * @example
 * ```ts
 * import type { ChatCompletionChoice } from '@h-ai/ai'
 *
 * function responseText(choice: ChatCompletionChoice): string {
 *   return choice.message.content ?? ''
 * }
 * ```
 */
export type ChatCompletionChoice = OpenAI.Chat.ChatCompletion.Choice

/**
 * 聊天完成响应（非流式）
 *
 * @example
 * ```ts
 * import type { ChatCompletionResponse } from '@h-ai/ai'
 *
 * function responseText(response: ChatCompletionResponse): string {
 *   return response.choices[0]?.message.content ?? ''
 * }
 * ```
 */
export type ChatCompletionResponse = OpenAI.Chat.ChatCompletion

/**
 * 流式增量内容（每个 chunk 中的变化部分）
 *
 * @example
 * ```ts
 * import type { ChatCompletionDelta } from '@h-ai/ai'
 *
 * const value: ChatCompletionDelta = { content: '已发货' }
 * ```
 */
export type ChatCompletionDelta = OpenAI.Chat.ChatCompletionChunk.Choice.Delta

/**
 * 流式响应块（SSE 传输的单个数据帧）
 *
 * @example
 * ```ts
 * import type { ChatCompletionChunk } from '@h-ai/ai'
 *
 * const value: ChatCompletionChunk = { id: 'chatcmpl-example', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o-mini', choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }] }
 * ```
 */
export type ChatCompletionChunk = OpenAI.Chat.ChatCompletionChunk

// ─── 流处理 ───

/**
 * 流处理结果（完整消费流后的累积数据）
 *
 * @example
 * ```ts
 * import type { StreamResult } from '@h-ai/ai'
 *
 * function completedMessage(result: StreamResult): string {
 *   return result.finishReason === 'stop' ? result.content : '输出尚未完整结束'
 * }
 * ```
 */
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
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * const processor = ai.stream.createProcessor()
 * processor.process({ id: 'chatcmpl-example', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o-mini', choices: [{ index: 0, delta: { content: '你好' }, finish_reason: 'stop' }] })
 * const message = processor.toAssistantMessage()
 * ```
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

/**
 * SSE（Server-Sent Events）事件结构
 *
 * @example
 * ```ts
 * import type { SSEEvent } from '@h-ai/ai'
 *
 * const value: SSEEvent = { id: 'event-1', event: 'delta', data: JSON.stringify({ text: '你好' }), retry: 1000 }
 * ```
 */
export interface SSEEvent {
  /** 事件类型（`event:` 字段） */
  event?: string
  /** 事件 ID（`id:` 字段）；解码继承最近有效值，空字符串显式清空，NUL 字段忽略。 */
  id?: string
  /** 重连间隔（毫秒，非负安全整数）；解码保留最近有效值，但不会自动执行重连。 */
  retry?: number
  /** 数据载荷（`data:` 字段，多行数据以 `\n` 合并） */
  data?: string
}

/**
 * SSE 解码器接口
 *
 * 内部维护行与事件缓冲区，支持跨 chunk 的 LF/CRLF/CR 和多行 data。
 * 仅移除冒号后的一个 ASCII 空格；只派发有 data 字段且已收到空行的事件。
 * EOF 不补空行；新连接或放弃未完成输入时调用 reset，清除旧 id/retry 与剩余数据。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * const decoder = ai.stream.createSSEDecoder()
 * const first = [...decoder.decode('data: hel')]
 * const second = [...decoder.decode('lo\n\n')]
 * // first 为空，second 的首个事件 data 为 hello。
 * ```
 */
export interface SSEDecoder {
  /** 追加 UTF-8 解码后的文本并解码完整事件；未完成的部分留在缓冲区。 */
  decode: (text: string) => Iterable<SSEEvent>
  /** 清空所有缓冲区及连接级元数据；不会派发残余的不完整事件。 */
  reset: () => void
}

/**
 * 流式 JSON 文本预览的字符上限，均以 UTF-16 单元计。
 * @example
 * ```ts
 * import type { JsonFieldPreviewOptions } from '@h-ai/ai'
 * const options: JsonFieldPreviewOptions = { maxLength: 1000, maxInputLength: 20000 }
 * ```
 */
export interface JsonFieldPreviewOptions {
  /** 预览字段的上限，默认 12000。 */
  maxLength?: number
  /** 累计输入的上限，默认 1000000。 */
  maxInputLength?: number
}

/**
 * 针对一次模型回复的预览器。只预览指定的顶层字符串字段，最终结果仍需校验完整 JSON。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * const preview = ai.stream.createJsonFieldPreview('text')
 * const prefix = preview.push('{"text":"已记录')
 * ```
 */
export interface JsonFieldPreview {
  /** 输入下一段 JSON。返回累计前缀，未变时返回 undefined。累计输入超限时抛出 RangeError。 */
  push: (fragment: string) => string | undefined
}

/**
 * 流处理操作接口（通过 `ai.stream` 访问，纯函数，无需初始化）
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 纯协议处理无需初始化 ai。
 * const wire = ai.stream.encodeSSE({ event: 'delta', data: '你好' })
 * const events = [...ai.stream.createSSEDecoder().decode(wire)]
 * ```
 */
export interface StreamOperations {
  /** 创建顶层字符串字段的增量预览器。字段名或上限无效时抛出 RangeError。 */
  createJsonFieldPreview: (field: string, options?: JsonFieldPreviewOptions) => JsonFieldPreview
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

/**
 * 模型工具协议适配器，只负责编解码并委托中立注册表执行。
 *
 * 定义、注册、授权、超时和取消由 `@h-ai/tools` 负责；执行失败保留原始 Tools 错误。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { tools } from '@h-ai/tools'
 * import { z } from 'zod'
 * const registry = tools.createRegistry()
 * const registered = registry.register(tools.define({ name: 'echo', description: '返回文本', parameters: z.object({ text: z.string() }), handler: input => input.text }))
 * if (!registered.success) throw new Error(registered.error.message)
 * const modelTools = ai.tools.adapt(registry)
 * const result = await modelTools.execute({ id: 'call-1', type: 'function', function: { name: 'echo', arguments: '{"text":"你好"}' } })
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export interface ToolRegistryOperations {
  /** 读取当前中立注册表，转换为模型 function calling 定义。 */
  getDefinitions: () => ToolDefinition[]
  /** 解码 JSON 入参并执行；Tools 业务错误直接透传，协议错误属于 AI。 */
  execute: (toolCall: ToolCall, options?: ToolExecutionOptions) => Promise<HaiResult<ToolMessage>>
  /** 先检查所有调用格式，再由中立注册表串行或显式并行执行，按输入顺序编码消息。 */
  executeAll: (toolCalls: ToolCall[], options?: ToolExecutionOptions & { parallel?: boolean }) => Promise<HaiResult<ToolMessage[]>>
}

/**
 * AI 的工具协议接入，纯适配，无需初始化。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { tools } from '@h-ai/tools'
 * const registry = tools.createRegistry()
 * const modelTools = ai.tools.adapt(registry)
 * const definitions = modelTools.getDefinitions()
 * ```
 */
export interface ToolsOperations {
  /** 将已登记 MCP 服务接入同一工具目录及执行管道。 */
  createMcpTools: (options: Parameters<typeof createMcpTools>[0]) => ReturnType<typeof createMcpTools>
  /** 组合现有模型能力为带资源授权的工具定义，不执行模型请求。 */
  createBuiltinTools: CreateBuiltinTools
  /** 通过现有短期 MCP Broker 向原生 Agent 开放本地工具服务。 */
  createBroker: (options: BuiltinToolBrokerOptions) => HaiResult<BuiltinToolBroker>
  /** 使用同一份工具注册表；不复制工具或授权状态。 */
  adapt: (registry: NeutralToolRegistryOperations) => ToolRegistryOperations
}

// ─── 对话记录 ───

/**
 * 对话记录查询选项
 *
 * @example
 * ```ts
 * import type { ChatHistoryOptions } from '@h-ai/ai'
 *
 * const value: ChatHistoryOptions = { limit: 20, order: 'desc' }
 * ```
 */
export interface ChatHistoryOptions {
  /** 返回数量限制 */
  limit?: number
  /** 排序方向（默认 `'desc'` 最新在前） */
  order?: 'asc' | 'desc'
}

/**
 * ask/askStream 便捷方法选项
 *
 * @example
 * ```ts
 * import type { AskOptions } from '@h-ai/ai'
 *
 * const value: AskOptions = { systemPrompt: '回答保持简洁。', objectId: 'user-42', sessionId: 'weekly', temperature: 0.2 }
 * ```
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
 *
 * @example
 * ```ts
 * import type { ChatRecord } from '@h-ai/ai'
 *
 * function elapsedLabel(record: ChatRecord): string {
 *   return `${record.sessionId}: ${record.duration}ms, ${record.response.usage.total_tokens} tokens`
 * }
 * ```
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

// ─── LLM 操作接口 ───

/**
 * 结构化输出请求
 *
 * 给定 Zod schema，要求模型返回 JSON，并在应用本地验证结构。
 * 解析失败时自动带错误修复重试，避免调用方手写 `JSON.parse` 的不稳定性。
 *
 * @example
 * ```ts
 * import type { GenerateObjectRequest } from '@h-ai/ai'
 * import { z } from 'zod'
 *
 * const request: GenerateObjectRequest<{ title: string }> = {
 *   schema: z.object({ title: z.string() }),
 *   messages: [{ role: 'user', content: '为本次会议生成标题。' }],
 *   maxRepairs: 1,
 * }
 * ```
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
  /** 上游响应格式，默认 `json_schema`。只支持 JSON 模式的 Chat 网关可使用 `json_object`，本地仍会校验 schema。 */
  responseFormat?: 'json_schema' | 'json_object'
  /** 解析失败时的修复重试次数（默认 1） */
  maxRepairs?: number
  /** 单次生成的最大输出 token 数。 */
  maxTokens?: number
  /** 选用流式调用，预览只包含指定顶层字段。失败尝试的内容经空串清除。 */
  preview?: JsonFieldPreviewOptions & {
    field: string
    onPrefix: (text: string) => void | Promise<void>
  }
  /** 取消信号 */
  signal?: AbortSignal
}

/**
 * LLM 操作接口（通过 `ai.llm` 访问）
 *
 * 需要先调用 `ai.init()` 初始化，否则返回 `NOT_INITIALIZED` 错误。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 应用启动已成功初始化 ai；scope 由可信会话绑定。
 * async function summarizeWeek() {
 *   const result = await ai.llm.chat({ messages: [{ role: 'user', content: '总结本周待办。' }], objectId: 'user-42', sessionId: 'weekly' })
 *   if (!result.success)
 *     return result
 *   return result.data.choices[0]?.message.content ?? ''
 * }
 * ```
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
   * 默认使用 `json_schema` 约束输出。使用 `json_object` 时由提示提供 Schema，两种模式均本地校验并按配置修复重试。
   *
   * @param request - 包含 schema、messages 及可选模型/修复次数等
   * @returns 符合 schema 的对象；多次重试仍无法解析时返回 `INVALID_REQUEST`
   */
  generateObject: <T>(request: GenerateObjectRequest<T>) => Promise<HaiResult<T>>
}
