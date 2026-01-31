/**
 * =============================================================================
 * @hai/ai - Provider: LLM
 * =============================================================================
 *
 * LLM Provider 实现（基于 OpenAI 兼容 API）
 *
 * @module ai-provider-llm
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AIConfig,
  AIError,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  LLMProvider,
} from '../ai-types.js'
import process from 'node:process'
import { err, ok } from '@hai/core'
import OpenAI from 'openai'

import { AIErrorCode } from '../ai-config.js'
import { getAiMessage } from '../index.js'

/**
 * HAI LLM Provider 实现
 *
 * 基于 OpenAI SDK，支持所有 OpenAI 兼容的 API。
 */
class HaiLLMProvider implements LLMProvider {
  private client: OpenAI
  private _config: AIConfig

  constructor(config: AIConfig) {
    this._config = config

    this.client = new OpenAI({
      apiKey: config.llm?.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: config.llm?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout: config.llm?.timeout || 60000,
    })
  }

  async chat(request: ChatCompletionRequest): Promise<Result<ChatCompletionResponse, AIError>> {
    const model = request.model || this._config.llm?.model || 'gpt-4o-mini'

    try {
      const response = await this.client.chat.completions.create({
        ...request,
        model,
        stream: false,
      }) as OpenAI.Chat.ChatCompletion

      return ok(this.mapResponse(response))
    }
    catch (error) {
      return err(this.mapError(error))
    }
  }

  async* chatStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    const model = request.model || this._config.llm?.model || 'gpt-4o-mini'

    const stream = await this.client.chat.completions.create({
      ...request,
      model,
      stream: true,
    })

    for await (const chunk of stream) {
      yield this.mapChunk(chunk)
    }
  }

  async listModels(): Promise<Result<string[], AIError>> {
    try {
      const response = await this.client.models.list()
      const models = response.data.map(m => m.id)
      return ok(models)
    }
    catch (error) {
      return err(this.mapError(error))
    }
  }

  private mapResponse(response: OpenAI.Chat.ChatCompletion): ChatCompletionResponse {
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
        finish_reason: (choice.finish_reason || 'stop') as 'stop' | 'length' | 'tool_calls' | 'content_filter',
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    }
  }

  private mapChunk(chunk: OpenAI.Chat.ChatCompletionChunk): ChatCompletionChunk {
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
              ? {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                }
              : undefined,
          })),
        },
        finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | 'content_filter' | null,
      })),
    }
  }

  private mapError(error: unknown): AIError {
    if (error instanceof OpenAI.APIError) {
      // 根据状态码映射错误类型
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

      return {
        code,
        message: error.message,
        cause: error,
      }
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        code: AIErrorCode.TIMEOUT,
        message: getAiMessage('ai_requestTimeout'),
        cause: error,
      }
    }

    return {
      code: AIErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
      cause: error,
    }
  }
}

/**
 * 创建 HAI LLM Provider
 *
 * @param config - AI 配置
 * @returns LLM Provider 实例
 */
export function createHaiLLMProvider(config: AIConfig): LLMProvider {
  return new HaiLLMProvider(config)
}
