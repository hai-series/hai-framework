/**
 * @h-ai/ai — LLM Provider: OpenAI 兼容实现
 *
 * 工厂函数创建，基于 OpenAI SDK 支持所有 OpenAI 兼容的 API 端点。
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../../ai-config.js'
import type {
  AILLMFunctionsDeps,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  LLMProvider,
} from '../ai-llm-types.js'

import process from 'node:process'
import { err, ok } from '@h-ai/core'
import OpenAI from 'openai'

import { AIErrorCode } from '../../ai-config.js'
import { aiM } from '../../ai-i18n.js'

// ─── 辅助函数 ───

/**
 * 将 OpenAI SDK 异常映射为 AIError
 *
 * 映射规则：
 * - HTTP 429 → `RATE_LIMITED`
 * - HTTP 404 → `MODEL_NOT_FOUND`
 * - HTTP 400 → `INVALID_REQUEST`
 * - 其他 `APIError` → `API_ERROR`
 * - `AbortError` → `TIMEOUT`
 * - 其他 → `INTERNAL_ERROR`
 *
 * @param error - 捕获的异常
 * @returns 统一的 AIError
 */
function toAIError(error: unknown): AIError {
  if (error instanceof OpenAI.APIError) {
    let code: AIError['code'] = AIErrorCode.API_ERROR
    if (error.status === 429) {
      code = AIErrorCode.RATE_LIMITED
    }
    else if (error.status === 404) {
      code = AIErrorCode.MODEL_NOT_FOUND
    }
    else if (error.status === 400) {
      code = AIErrorCode.INVALID_REQUEST
    }
    return { code, message: error.message, cause: error }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      code: AIErrorCode.TIMEOUT,
      message: aiM('ai_requestTimeout'),
      cause: error,
    }
  }

  return {
    code: AIErrorCode.INTERNAL_ERROR,
    message: aiM('ai_internalError', {
      params: { error: error instanceof Error ? error.message : 'Unknown error' },
    }),
    cause: error,
  }
}

/**
 * 将 OpenAI SDK 响应映射为内部 ChatCompletionResponse
 *
 * 处理 `tool_calls` 字段可选性，确保 `usage` 字段默认值为 0。
 *
 * @param response - OpenAI SDK 原始响应
 * @returns 内部统一类型
 */
function mapResponse(response: OpenAI.Chat.ChatCompletion): ChatCompletionResponse {
  return {
    id: response.id,
    object: 'chat.completion',
    created: response.created,
    model: response.model,
    choices: response.choices.map(choice => ({
      index: choice.index,
      message: {
        role: 'assistant' as const,
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: 'function' in tc ? tc.function.name : '',
            arguments: 'function' in tc ? tc.function.arguments : '',
          },
        })),
      },
      finish_reason: (choice.finish_reason || 'stop') as ChatCompletionResponse['choices'][0]['finish_reason'],
    })),
    usage: {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    },
  }
}

/**
 * 将 OpenAI SDK 流式块映射为内部 ChatCompletionChunk
 *
 * 处理 `delta.role` 和 `delta.tool_calls` 的可选性，
 * 确保 `role` 仅在 `'assistant'` 时保留。
 *
 * @param chunk - OpenAI SDK 流式块
 * @returns 内部统一类型
 */
function mapChunk(chunk: OpenAI.Chat.ChatCompletionChunk): ChatCompletionChunk {
  return {
    id: chunk.id,
    object: 'chat.completion.chunk',
    created: chunk.created,
    model: chunk.model,
    choices: chunk.choices.map(choice => ({
      index: choice.index,
      delta: {
        role: choice.delta?.role === 'assistant' ? 'assistant' as const : undefined,
        content: choice.delta?.content || undefined,
        tool_calls: choice.delta?.tool_calls?.map(tc => ({
          index: tc.index,
          id: tc.id,
          type: tc.type as 'function' | undefined,
          function: tc.function
            ? { name: tc.function.name, arguments: tc.function.arguments }
            : undefined,
        })),
      },
      finish_reason: choice.finish_reason as ChatCompletionChunk['choices'][0]['finish_reason'],
    })),
  }
}

// ─── 工厂函数 ───

/**
 * 创建 OpenAI 兼容 LLM Provider
 *
 * 支持所有 OpenAI 兼容 API 端点（如 Azure OpenAI、本地 Ollama 等）。
 * 使用配置中的 `apiKey`、`baseUrl`、`timeout`、`model` 或环境变量回退。
 *
 * @param deps - LLM 子功能依赖（含校验后配置）
 * @returns LLMProvider 实例
 */
export function createOpenAIProvider(deps: AILLMFunctionsDeps): LLMProvider {
  const { config } = deps

  const client = new OpenAI({
    apiKey: config.llm?.apiKey || process.env.HAI_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    baseURL: config.llm?.baseUrl || process.env.HAI_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    timeout: config.llm?.timeout || 60000,
  })

  const defaultModel = config.llm?.model || 'gpt-4o-mini'

  return {
    async chat(request: ChatCompletionRequest): Promise<Result<ChatCompletionResponse, AIError>> {
      const model = request.model || defaultModel
      try {
        const response = await client.chat.completions.create({
          ...request,
          model,
          stream: false,
        }) as OpenAI.Chat.ChatCompletion
        return ok(mapResponse(response))
      }
      catch (error) {
        return err(toAIError(error))
      }
    },

    async* chatStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
      const model = request.model || defaultModel
      const stream = await client.chat.completions.create({
        ...request,
        model,
        stream: true,
      })
      for await (const chunk of stream) {
        yield mapChunk(chunk)
      }
    },

    async listModels(): Promise<Result<string[], AIError>> {
      try {
        const response = await client.models.list()
        const models = response.data.map(m => m.id)
        return ok(models)
      }
      catch (error) {
        return err(toAIError(error))
      }
    },
  }
}
