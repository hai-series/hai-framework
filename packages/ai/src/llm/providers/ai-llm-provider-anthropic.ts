/**
 * @h-ai/ai — LLM Provider: Anthropic Messages API 实现
 *
 * 通过原生 `fetch` 直连 Anthropic Messages API（`/v1/messages`），无需引入 SDK，
 * 天然支持 `AbortSignal` 取消。将框架统一的 Chat Completions 请求/响应形状与
 * Anthropic 协议互相转换，使 `ai.llm.chat/chatStream` 的调用方无需感知底层协议差异。
 *
 * 文本对话与工具调用（tool_use / tool_result）支持；流式覆盖文本增量与用量统计。
 * @module ai-llm-provider-anthropic
 */

import type { HaiErrorDef, HaiResult } from '@h-ai/core'

import type { AILLMFunctionsDeps, ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse, ChatMessage, LLMProvider, TempModelConfig, ToolCall, ToolDefinition } from '../ai-llm-types.js'

import process from 'node:process'
import { err, ok } from '@h-ai/core'

import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { createSSEDecoder } from '../ai-llm-stream.js'

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_MAX_TOKENS = 4096

// ─── Anthropic REST 形状（无 SDK，最小类型定义） ───

interface AnthropicTextBlock { type: 'text', text: string }
interface AnthropicToolUseBlock { type: 'tool_use', id: string, name: string, input: unknown }
interface AnthropicToolResultBlock { type: 'tool_result', tool_use_id: string, content: string }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

interface AnthropicMessage { role: 'user' | 'assistant', content: string | AnthropicContentBlock[] }

interface AnthropicTool { name: string, description?: string, input_schema: Record<string, unknown> }

interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string
  temperature?: number
  top_p?: number
  tools?: AnthropicTool[]
  stream?: boolean
}

interface AnthropicUsage { input_tokens: number, output_tokens: number }

interface AnthropicResponse {
  id: string
  model: string
  content: AnthropicContentBlock[]
  stop_reason: string | null
  usage: AnthropicUsage
}

/** 已解析的 Anthropic 端点参数 */
interface ResolvedAnthropic {
  apiKey: string
  baseUrl: string
  model: string
  maxTokens: number
  temperature?: number
  timeout: number
}

// ─── 辅助转换 ───

/** 从消息内容提取纯文本（字符串直接返回，多模态数组拼接 text 片段，忽略 refusal 等非文本块） */
function contentToText(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content))
    return content.map(part => (isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? part.text : '')).filter(Boolean).join('')
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 将框架消息转换为 Anthropic messages + 顶层 system
 *
 * - system / developer 消息合并为顶层 `system` 字符串
 * - assistant 的 `tool_calls` 转 tool_use 块；tool 消息转 tool_result 块
 * - 连续同角色消息各自成条（Anthropic 允许交替，SDK 侧一般无强约束）
 */
function toAnthropicMessages(messages: ChatMessage[]): { messages: AnthropicMessage[], system?: string } {
  const systemParts: string[] = []
  const result: AnthropicMessage[] = []

  for (const message of messages) {
    if (message.role === 'system' || message.role === 'developer') {
      const text = contentToText(message.content)
      if (text)
        systemParts.push(text)
      continue
    }

    if (message.role === 'tool') {
      result.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: contentToText(message.content) }],
      })
      continue
    }

    if (message.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = []
      const text = contentToText(message.content)
      if (text)
        blocks.push({ type: 'text', text })
      if (message.tool_calls) {
        for (const call of message.tool_calls) {
          if (call.type === 'function') {
            let input: unknown = {}
            try {
              input = call.function.arguments ? JSON.parse(call.function.arguments) : {}
            }
            catch {
              input = {}
            }
            blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input })
          }
        }
      }
      result.push({ role: 'assistant', content: blocks.length > 0 ? blocks : (text || '') })
      continue
    }

    // user
    result.push({ role: 'user', content: contentToText(message.content) })
  }

  return { messages: result, system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined }
}

/** 将 Chat Completions 工具定义转换为 Anthropic 工具定义 */
function toAnthropicTools(tools?: ToolDefinition[]): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0)
    return undefined
  const mapped: AnthropicTool[] = []
  for (const tool of tools) {
    if (tool.type !== 'function')
      continue
    mapped.push({
      name: tool.function.name,
      description: tool.function.description ?? undefined,
      input_schema: (tool.function.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    })
  }
  return mapped.length > 0 ? mapped : undefined
}

/** 将 Anthropic stop_reason 映射为 Chat Completions finish_reason */
function mapStopReason(stopReason: string | null, hasToolUse: boolean): string {
  if (hasToolUse || stopReason === 'tool_use')
    return 'tool_calls'
  if (stopReason === 'max_tokens')
    return 'length'
  return 'stop'
}

/** 将 Anthropic 响应转换为 Chat Completions 响应形状 */
function toChatResponse(response: AnthropicResponse, model: string): ChatCompletionResponse {
  const textParts: string[] = []
  const toolCalls: ToolCall[] = []
  for (const block of response.content) {
    if (block.type === 'text')
      textParts.push(block.text)
    else if (block.type === 'tool_use')
      toolCalls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } })
  }
  const text = textParts.join('')

  return {
    id: response.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model ?? model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: toolCalls.length > 0 && text.length === 0 ? null : text,
        refusal: null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: mapStopReason(response.stop_reason, toolCalls.length > 0) as ChatCompletionResponse['choices'][number]['finish_reason'],
      logprobs: null,
    }],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  }
}

/** 构造纯文本增量的流块 */
function textChunk(id: string, model: string, delta: string): ChatCompletionChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null, logprobs: null }],
  }
}

// ─── 工厂 ───

/**
 * 创建 Anthropic LLM Provider
 *
 * @param deps - LLM 子功能依赖（含校验后配置）
 * @returns LLMProvider 实例
 */
export function createAnthropicProvider(deps: AILLMFunctionsDeps): LLMProvider {
  const { config } = deps

  /**
   * 解析 Anthropic 端点参数
   *
   * apiKey / baseUrl 采用 Anthropic 专属环境变量兜底（ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL），
   * 避免误用面向 OpenAI 的全局默认 baseUrl。
   */
  function resolveAnthropic(requestModel?: string, tempModel?: TempModelConfig): HaiResult<ResolvedAnthropic> {
    const entry = requestModel ? config.llm.models?.find(m => m.id === requestModel || m.model === requestModel) : undefined
    const model = tempModel?.model ?? entry?.model ?? requestModel ?? config.llm.model ?? 'claude-3-5-sonnet-latest'
    const apiKey = tempModel?.apiKey ?? entry?.apiKey ?? config.llm.apiKey ?? process.env.HAI_AI_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey)
      return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_configError', { params: { error: 'API Key is required for Anthropic' } }))
    const baseUrl = (tempModel?.baseUrl ?? entry?.baseUrl ?? process.env.HAI_AI_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL).replace(/\/+$/, '')
    return ok({
      apiKey,
      baseUrl,
      model,
      maxTokens: tempModel?.maxTokens ?? entry?.maxTokens ?? config.llm.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: tempModel?.temperature ?? entry?.temperature ?? config.llm.temperature,
      timeout: tempModel?.timeout ?? entry?.timeout ?? config.llm.timeout ?? 60000,
    })
  }

  /** 构造 Anthropic 请求体 */
  function buildRequest(request: ChatCompletionRequest, resolved: ResolvedAnthropic, stream: boolean): AnthropicRequest {
    const { messages, system } = toAnthropicMessages(request.messages)
    const temperature = request.temperature ?? resolved.temperature
    return {
      model: resolved.model,
      max_tokens: request.max_tokens ?? resolved.maxTokens,
      messages,
      ...(system ? { system } : {}),
      ...(temperature != null ? { temperature } : {}),
      ...(request.top_p != null ? { top_p: request.top_p } : {}),
      ...(toAnthropicTools(request.tools) ? { tools: toAnthropicTools(request.tools) } : {}),
      stream,
    }
  }

  /** 发送 fetch 请求并统一超时/取消/错误处理 */
  async function post(resolved: ResolvedAnthropic, body: AnthropicRequest, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), resolved.timeout)
    // 合并外部取消信号与超时信号
    if (signal) {
      if (signal.aborted)
        controller.abort()
      else
        signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    try {
      return await fetch(`${resolved.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': resolved.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    }
    finally {
      clearTimeout(timer)
    }
  }

  /** 将 HTTP 错误状态映射为标准错误定义 */
  function httpError(status: number, detail: string): { def: HaiErrorDef, message: string } {
    if (status === 429)
      return { def: HaiAIError.RATE_LIMITED, message: detail }
    if (status === 404)
      return { def: HaiAIError.MODEL_NOT_FOUND, message: detail }
    if (status === 400)
      return { def: HaiAIError.INVALID_REQUEST, message: detail }
    return { def: HaiAIError.API_ERROR, message: detail }
  }

  return {
    async chat(request): Promise<HaiResult<ChatCompletionResponse>> {
      const resolvedResult = resolveAnthropic(request.model, request.tempModel)
      if (!resolvedResult.success)
        return resolvedResult
      const resolved = resolvedResult.data
      try {
        const res = await post(resolved, buildRequest(request, resolved, false), request.signal)
        if (!res.ok) {
          const detail = await res.text().catch(() => res.statusText)
          const mapped = httpError(res.status, detail.slice(0, 500))
          return err(mapped.def, mapped.message, { status: res.status })
        }
        const data = await res.json() as AnthropicResponse
        return ok(toChatResponse(data, resolved.model))
      }
      catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          return err(HaiAIError.TIMEOUT, aiM('ai_requestTimeout'), { message: error.message })
        return err(HaiAIError.INTERNAL_ERROR, aiM('ai_internalError', { params: { error: error instanceof Error ? error.message : 'Unknown error' } }), error)
      }
    },

    async* chatStream(request): AsyncIterable<ChatCompletionChunk> {
      const resolvedResult = resolveAnthropic(request.model, request.tempModel)
      if (!resolvedResult.success)
        throw new Error(resolvedResult.error.message)
      const resolved = resolvedResult.data

      const res = await post(resolved, buildRequest(request, resolved, true), request.signal)
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => res.statusText)
        throw new Error(`Anthropic stream failed (${res.status}): ${detail.slice(0, 300)}`)
      }

      const decoder = createSSEDecoder()
      const reader = res.body.getReader()
      const textDecoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        for (const event of decoder.decode(textDecoder.decode(value, { stream: true }))) {
          if (!event.data || event.data === '[DONE]')
            continue
          let payload: { type?: string, delta?: { type?: string, text?: string }, usage?: AnthropicUsage, message?: { usage?: AnthropicUsage } }
          try {
            payload = JSON.parse(event.data)
          }
          catch {
            continue
          }
          // 文本增量
          if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) {
            yield textChunk(resolved.model, resolved.model, payload.delta.text)
          }
          // 完成事件：携带输出用量
          else if (payload.type === 'message_delta' && payload.usage) {
            yield {
              id: resolved.model,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: resolved.model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
              usage: {
                prompt_tokens: payload.message?.usage?.input_tokens ?? 0,
                completion_tokens: payload.usage.output_tokens,
                total_tokens: (payload.message?.usage?.input_tokens ?? 0) + payload.usage.output_tokens,
              },
            }
          }
        }
      }
    },

    async listModels(): Promise<HaiResult<string[]>> {
      // Anthropic 未提供公开的模型列表端点；返回配置中声明的模型名
      const models = new Set<string>()
      if (config.llm.model)
        models.add(config.llm.model)
      for (const entry of config.llm.models ?? []) {
        if ((entry.api ?? config.llm.api) === 'anthropic')
          models.add(entry.model)
      }
      return ok([...models])
    },
  }
}
