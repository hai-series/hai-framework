/**
 * =============================================================================
 * @hai/ai - HAI Provider: LLM
 * =============================================================================
 * HAI 默认 LLM 提供者实现（基于 OpenAI 兼容 API）
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
} from '../../ai-types.js'
import { err, ok } from '@hai/core'
import OpenAI from 'openai'

/**
 * HAI LLM 提供者实现
 */
class HaiLLMProvider implements LLMProvider {
  private client: OpenAI
  private _config: AIConfig

  constructor(config: AIConfig) {
    this._config = config

    this.client = new OpenAI({
      apiKey: config.llm?.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: config.llm?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout: 60000,
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
          content: choice.delta?.content || '',
        },
        finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | 'content_filter' | null,
      })),
    }
  }

  private mapError(error: unknown): AIError {
    if (error instanceof OpenAI.APIError) {
      return {
        type: 'API_ERROR',
        message: error.message,
        code: error.status?.toString(),
      }
    }
    return {
      type: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export function createHaiLLMProvider(config: AIConfig): LLMProvider {
  return new HaiLLMProvider(config)
}
