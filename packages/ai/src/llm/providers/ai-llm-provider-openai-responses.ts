/**
 * @h-ai/ai — OpenAI Responses API 适配器
 *
 * 将框架统一的 Chat Completions 请求/响应形状与 OpenAI Responses API
 * （`/v1/responses`）互相转换，使 `ai.llm.chat/chatStream` 的调用方无需感知底层协议差异。
 *
 * 纯函数、无副作用，便于单测。文本对话与非流式工具调用完整支持；
 * 流式仅覆盖文本增量（流式工具调用建议使用 `protocol: 'chat'`）。
 * @module ai-llm-provider-openai-responses
 */

import type OpenAI from 'openai'

import type {
  AssistantMessage,
  ChatCompletionChunk,
  ChatCompletionResponse,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from '../ai-llm-types.js'

/**
 * OpenAI SDK 的 Responses 输入项数组；由统一消息适配后发送。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const input: ResponseInput = toResponsesInput([{ role: 'user', content: '你好' }])
 * const count = input.length
 * ```
 */
type ResponseInput = OpenAI.Responses.ResponseInput
/**
 * OpenAI Responses 单项输入，包括消息、工具调用与工具结果。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const item: ResponseInputItem = { type: 'function_call_output', call_id: 'call-1', output: '晴' }
 * const input: ResponseInput = [item]
 * ```
 */
type ResponseInputItem = OpenAI.Responses.ResponseInputItem
/**
 * OpenAI SDK 的完整 Responses 响应，由适配器转换为统一完成结果。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function convert(response: ResponsesResponse) {
 *   const completion = responsesToChatResponse(response, response.model)
 *   return { text: completion.choices[0]?.message.content, usage: completion.usage }
 * }
 * ```
 */
type ResponsesResponse = OpenAI.Responses.Response
/**
 * OpenAI SDK 的 Responses 流事件；仅已实现事件映射为统一文本或用量增量。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function convert(event: ResponseStreamEvent) {
 *   return responsesEventToChunk(event, 'gpt-4.1')
 * }
 * ```
 */
type ResponseStreamEvent = OpenAI.Responses.ResponseStreamEvent
/**
 * OpenAI Responses 工具形状；统一 function 定义转换后传给 SDK。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const tools: ResponsesTool[] | undefined = toResponsesTools([{ type: 'function', function: { name: 'weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }])
 * const count = tools?.length ?? 0
 * ```
 */
type ResponsesTool = OpenAI.Responses.Tool

/** 从消息内容中提取纯文本（字符串直接返回，多模态数组拼接其 text 片段，忽略 refusal 等非文本块） */
function contentToText(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .map(part => (isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('')
  }
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 将框架消息列表转换为 Responses API 的 input 项
 *
 * - system / developer / user：映射为 EasyInputMessage
 * - assistant：文本映射为 assistant 消息；`tool_calls` 映射为 function_call 项
 * - tool：映射为 function_call_output 项（按 tool_call_id 关联）
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const input = toResponsesInput([{ role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'weather', arguments: '{"city":"北京"}' } }] }, { role: 'tool', tool_call_id: 'call-1', content: '晴' }])
 * const count = input.length
 * ```
 */
export function toResponsesInput(messages: ChatMessage[]): ResponseInput {
  const items: ResponseInputItem[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      items.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: contentToText(message.content),
      })
      continue
    }

    if (message.role === 'assistant') {
      const assistant = message as AssistantMessage
      const text = contentToText(assistant.content)
      if (text)
        items.push({ role: 'assistant', content: text })
      if (assistant.tool_calls) {
        for (const call of assistant.tool_calls) {
          if (call.type === 'function') {
            items.push({
              type: 'function_call',
              call_id: call.id,
              name: call.function.name,
              arguments: call.function.arguments,
            })
          }
        }
      }
      continue
    }

    // system / developer / user——仅映射 EasyInputMessage 支持的角色（跳过遗留 function 角色）
    if (message.role === 'user' || message.role === 'system' || message.role === 'developer')
      items.push({ role: message.role, content: contentToText(message.content) })
  }
  return items
}

/**
 * 将 Chat Completions 工具定义转换为 Responses API 工具定义
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const tools = toResponsesTools([{ type: 'function', function: { name: 'weather', description: '查询天气', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }])
 * const count = tools?.length ?? 0
 * ```
 */
export function toResponsesTools(tools?: ToolDefinition[]): ResponsesTool[] | undefined {
  if (!tools || tools.length === 0)
    return undefined
  const mapped: ResponsesTool[] = []
  for (const tool of tools) {
    if (tool.type !== 'function')
      continue
    mapped.push({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description ?? null,
      parameters: (tool.function.parameters ?? {}) as Record<string, unknown>,
      strict: tool.function.strict ?? false,
    })
  }
  return mapped.length > 0 ? mapped : undefined
}

/** 从 Responses 响应的 output 数组提取 function_call → Chat Completions tool_calls */
function extractToolCalls(response: ResponsesResponse): ToolCall[] {
  const toolCalls: ToolCall[] = []
  for (const item of response.output) {
    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments },
      })
    }
  }
  return toolCalls
}

/** 将 Responses usage 映射为 Chat Completions usage */
function mapUsage(usage: ResponsesResponse['usage']): ChatCompletionResponse['usage'] | undefined {
  if (!usage)
    return undefined
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
  }
}

/**
 * 将 Responses API 的完整响应转换为 Chat Completions 响应形状
 *
 * @param response - Responses API 响应
 * @param model - 请求使用的模型名（响应缺省时回退）
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function convert(response: ResponsesResponse) {
 *   const completion = responsesToChatResponse(response, 'gpt-4.1')
 *   return { text: completion.choices[0]?.message.content, tools: completion.choices[0]?.message.tool_calls }
 * }
 * ```
 */
export function responsesToChatResponse(response: ResponsesResponse, model: string): ChatCompletionResponse {
  const toolCalls = extractToolCalls(response)
  const text = response.output_text ?? ''

  const message: ChatCompletionResponse['choices'][number]['message'] = {
    role: 'assistant',
    content: toolCalls.length > 0 && text.length === 0 ? null : text,
    refusal: null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }

  const usage = mapUsage(response.usage)

  return {
    id: response.id,
    object: 'chat.completion',
    created: response.created_at,
    model: response.model ?? model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      logprobs: null,
    }],
    ...(usage ? { usage } : {}),
  }
}

/**
 * 将单个 Responses 流事件转换为 Chat Completions 流块
 *
 * 仅处理文本增量与完成事件；其余事件（工具调用、推理等）返回 null 由上层忽略。
 *
 * @param event - Responses 流事件
 * @param model - 请求使用的模型名
 * @returns 对应的 ChatCompletionChunk，或 null（无需转发的事件）
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function convert(event: ResponseStreamEvent) {
 *   const chunk = responsesEventToChunk(event, 'gpt-4.1')
 *   return chunk?.choices[0]?.delta.content ?? ''
 * }
 * ```
 */
export function responsesEventToChunk(event: ResponseStreamEvent, model: string): ChatCompletionChunk | null {
  if (event.type === 'response.output_text.delta') {
    return {
      id: event.item_id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { content: event.delta }, finish_reason: null, logprobs: null }],
    }
  }

  if (event.type === 'response.completed') {
    const usage = mapUsage(event.response.usage)
    return {
      id: event.response.id,
      object: 'chat.completion.chunk',
      created: event.response.created_at,
      model: event.response.model ?? model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
      ...(usage ? { usage } : {}),
    }
  }

  return null
}
