/**
 * =============================================================================
 * @hai/ai - Provider: LLM
 * =============================================================================
 *
 * LLM Provider 实现（基于 OpenAI 兼容 API）。
 * 通过 OpenAI SDK 支持所有 OpenAI 兼容的 API 端点。
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
import { aiM } from '../ai-i18n.js'

/**
 * HAI LLM Provider 实现
 *
 * 基于 OpenAI SDK，支持所有 OpenAI 兼容的 API 端点。
 * 通过 `createHaiLLMProvider()` 工厂函数创建，不直接对外暴露。
 */
class HaiLLMProvider implements LLMProvider {
  /** OpenAI SDK 客户端实例 */
  private client: OpenAI
  /** 保存初始化配置，用于请求时读取默认值 */
  private _config: AIConfig

  /**
   * @param config - 经过 Zod 校验的 AI 配置。
   *   apiKey 回退顺序：config.llm.apiKey → env.OPENAI_API_KEY → 空字符串
   *   baseURL 回退顺序：config.llm.baseUrl → env.OPENAI_BASE_URL → OpenAI 官方地址
   */

  constructor(config: AIConfig) {
    this._config = config

    this.client = new OpenAI({
      apiKey: config.llm?.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: config.llm?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout: config.llm?.timeout || 60000,
    })
  }

  /**
   * 非流式聊天完成
   *
   * @param request - 聊天请求，`model` 未提供时使用配置默认值
   * @returns 成功返回完整响应，SDK 异常转换为对应的 AIError
   */
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

  /**
   * 流式聊天完成
   *
   * @param request - 聊天请求，强制 `stream: true`
   * @yields 逐块产出映射后的 ChatCompletionChunk
   */
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

  /**
   * 获取可用模型列表
   *
   * @returns 成功返回模型 ID 数组，SDK 异常转换为 AIError
   */
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

  /**
   * 将 OpenAI SDK 响应映射为内部响应类型
   *
   * 处理 SDK 类型与内部类型的差异（如 `content` 的 null/空字符串、
   * `tool_calls` 的结构差异、`usage` 的可选性等）。
   */
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

  /**
   * 将 OpenAI SDK 流式块映射为内部类型
   *
   * 处理 `delta` 字段的 role 、content、tool_calls 和 finish_reason 的类型转换。
   */
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

  /**
   * 将 OpenAI SDK 异常映射为 AIError
   *
   * 映射规则：
   * - HTTP 429 → `RATE_LIMITED`
   * - HTTP 404 → `MODEL_NOT_FOUND`
   * - HTTP 400 → `INVALID_REQUEST`
   * - 其他 APIError → `API_ERROR`
   * - AbortError → `TIMEOUT`
   * - 未知异常 → `INTERNAL_ERROR`
   */
  private mapError(error: unknown): AIError {
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

      return {
        code,
        message: error.message,
        cause: error,
      }
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
      message: aiM('ai_internalError', { params: { error: error instanceof Error ? error.message : 'Unknown error' } }),
      cause: error,
    }
  }
}

/**
 * 创建 HAI LLM Provider
 *
 * 工厂函数，内部使用，由 `ai.init()` 调用。
 *
 * @param config - 经过 Zod 校验的 AI 配置
 * @returns 实现了 `LLMProvider` 接口的实例
 */
export function createHaiLLMProvider(config: AIConfig): LLMProvider {
  return new HaiLLMProvider(config)
}
