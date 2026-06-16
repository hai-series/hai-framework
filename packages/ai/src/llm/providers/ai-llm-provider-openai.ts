/**
 * @h-ai/ai — LLM Provider: OpenAI 兼容实现
 *
 * 工厂函数创建，基于 OpenAI SDK 支持所有 OpenAI 兼容的 API 端点。
 * @module ai-llm-provider-openai
 */

import type { HaiErrorDef, HaiResult } from '@h-ai/core'

import type {
  AILLMFunctionsDeps,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  LLMProvider,
  TempModelConfig,
} from '../ai-llm-types.js'

import process from 'node:process'
import { err, ok } from '@h-ai/core'
import OpenAI from 'openai'

import { resolveModelEntry } from '../../ai-config.js'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'

// ─── 辅助函数 ───

/**
 * 清理错误对象中可能包含的敏感信息
 *
 * OpenAI SDK 的 APIError 可能在 headers 中携带 Authorization Bearer Token，
 * 直接作为 cause 传递会泄漏 API Key。此函数仅保留安全字段。
 *
 * @param error - 原始错误对象
 * @returns 去除敏感信息的错误摘要
 */
function sanitizeErrorCause(error: unknown): { message: string, status?: number, code?: string } {
  if (error instanceof OpenAI.APIError) {
    return { message: error.message, status: error.status, code: error.code ?? undefined }
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: String(error) }
}

/**
 * 将 OpenAI SDK 异常映射为标准错误定义 + 消息
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
 * @returns 统一错误映射（cause 已脱敏，不含 API Key）
 */
function toAIError(error: unknown): { def: HaiErrorDef, message: string, cause: unknown } {
  if (error instanceof OpenAI.APIError) {
    let def = HaiAIError.API_ERROR
    if (error.status === 429) {
      def = HaiAIError.RATE_LIMITED
    }
    else if (error.status === 404) {
      def = HaiAIError.MODEL_NOT_FOUND
    }
    else if (error.status === 400) {
      def = HaiAIError.INVALID_REQUEST
    }
    return { def, message: error.message, cause: sanitizeErrorCause(error) }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      def: HaiAIError.TIMEOUT,
      message: aiM('ai_requestTimeout'),
      cause: sanitizeErrorCause(error),
    }
  }

  return {
    def: HaiAIError.INTERNAL_ERROR,
    message: aiM('ai_internalError', {
      params: { error: error instanceof Error ? error.message : 'Unknown error' },
    }),
    cause: sanitizeErrorCause(error),
  }
}

function toOpenAIMessage(message: ChatMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === 'developer') {
    const developerMessage: OpenAI.Chat.Completions.ChatCompletionDeveloperMessageParam = {
      role: 'developer',
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    }
    return developerMessage
  }

  return message
}

// ─── 工厂函数 ───

/** 已解析的客户端及其参数回填默认值（maxTokens/temperature 仅临时模型路径有值） */
interface ResolvedClient {
  client: OpenAI
  model: string
  maxTokens?: number
  temperature?: number
}

/**
 * 创建 OpenAI 兼容 LLM Provider
 *
 * 支持所有 OpenAI 兼容 API 端点（如 Azure OpenAI、本地 Ollama 等）。
 * 通过 `resolveModelEntry()` 统一解析模型配置（apiKey / baseUrl / timeout 等），
 * 支持多模型条目各自配置不同的 API 端点。
 *
 * @param deps - LLM 子功能依赖（含校验后配置）
 * @returns LLMProvider 实例
 */
export function createOpenAIProvider(deps: AILLMFunctionsDeps): LLMProvider {
  const { config } = deps

  // 缓存客户端实例，按 apiKey+baseURL+timeout 复用，支持多端点并发调用
  const clientCache = new Map<string, OpenAI>()

  // 临时模型客户端缓存：与常驻 clientCache 隔离，带 TTL 过期（默认 10 分钟，见 LLMConfig.tempModelCacheTtl）
  const tempClientCache = new Map<string, { client: OpenAI, expiresAt: number }>()
  const tempCacheTtl = config.llm.tempModelCacheTtl ?? 600000

  function getClient(apiKey: string, baseURL: string, timeout: number): OpenAI {
    const key = `${apiKey}::${baseURL}::${timeout}`
    let client = clientCache.get(key)
    if (!client) {
      client = new OpenAI({ apiKey, baseURL, timeout })
      clientCache.set(key, client)
    }
    return client
  }

  /**
   * 获取临时模型客户端（带 TTL 过期）
   *
   * 每次调用惰性清理过期实例（无需定时器，避免 close 清理负担）。
   * 命中未过期缓存直接复用；否则创建新实例并记录过期时间（自创建起 `tempCacheTtl` 毫秒）。
   */
  function getTempClient(apiKey: string, baseURL: string, timeout: number): OpenAI {
    const now = Date.now()
    // 惰性清理过期实例，避免缓存无限增长
    for (const [k, v] of tempClientCache) {
      if (v.expiresAt <= now)
        tempClientCache.delete(k)
    }
    const key = `${apiKey}::${baseURL}::${timeout}`
    const cached = tempClientCache.get(key)
    if (cached)
      return cached.client
    const client = new OpenAI({ apiKey, baseURL, timeout })
    tempClientCache.set(key, { client, expiresAt: now + tempCacheTtl })
    return client
  }

  function resolveClient(requestModel?: string, tempModel?: TempModelConfig): HaiResult<ResolvedClient> {
    if (tempModel)
      return resolveTempClient(tempModel)
    const resolvedResult = resolveModelEntry(config.llm, 'chat', requestModel, {
      missingApiKeyMessage: aiM('ai_configError', { params: { error: 'API Key is required for chat' } }),
    })
    if (!resolvedResult.success)
      return resolvedResult
    const { apiKey, baseUrl, timeout, model } = resolvedResult.data
    return ok({ client: getClient(apiKey ?? '', baseUrl ?? 'https://api.openai.com/v1', timeout), model })
  }

  /**
   * 解析临时模型客户端
   *
   * 临时模型字段优先，未指定时回退到全局 LLM 配置 / 环境变量；
   * `maxTokens` / `temperature` 作为请求未显式指定时的回填默认值返回。
   */
  function resolveTempClient(tempModel: TempModelConfig): HaiResult<ResolvedClient> {
    const apiKey = tempModel.apiKey ?? config.llm.apiKey ?? process.env.HAI_AI_LLM_API_KEY ?? process.env.OPENAI_API_KEY
    if (!apiKey)
      return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_configError', { params: { error: 'API Key is required for temp model' } }))
    const baseUrl = tempModel.baseUrl ?? config.llm.baseUrl ?? process.env.HAI_AI_LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
    const timeout = tempModel.timeout ?? config.llm.timeout ?? 60000
    return ok({
      client: getTempClient(apiKey, baseUrl, timeout),
      model: tempModel.model,
      maxTokens: tempModel.maxTokens ?? config.llm.maxTokens,
      temperature: tempModel.temperature ?? config.llm.temperature,
    })
  }

  return {
    async chat(request: ChatCompletionRequest): Promise<HaiResult<ChatCompletionResponse>> {
      const clientResult = resolveClient(request.model, request.tempModel)
      if (!clientResult.success)
        return clientResult
      const { client, model, maxTokens, temperature } = clientResult.data
      const { objectId: _objectId, sessionId: _sessionId, tempModel: _tempModel, ...openaiRequest } = request
      const openaiMessages = request.messages.map(toOpenAIMessage)
      try {
        const response = await client.chat.completions.create({
          ...openaiRequest,
          messages: openaiMessages,
          model,
          ...(maxTokens !== undefined && openaiRequest.max_tokens == null ? { max_tokens: maxTokens } : {}),
          ...(temperature !== undefined && openaiRequest.temperature == null ? { temperature } : {}),
          stream: false,
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming)
        return ok(response)
      }
      catch (error) {
        const mapped = toAIError(error)
        return err(mapped.def, mapped.message, mapped.cause)
      }
    },

    async* chatStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
      const clientResult = resolveClient(request.model, request.tempModel)
      if (!clientResult.success)
        throw new Error(clientResult.error.message)
      const { client, model, maxTokens, temperature } = clientResult.data
      const { objectId: _objectId, sessionId: _sessionId, tempModel: _tempModel, ...openaiRequest } = request
      const openaiMessages = request.messages.map(toOpenAIMessage)
      const stream = await client.chat.completions.create({
        ...openaiRequest,
        messages: openaiMessages,
        model,
        ...(maxTokens !== undefined && openaiRequest.max_tokens == null ? { max_tokens: maxTokens } : {}),
        ...(temperature !== undefined && openaiRequest.temperature == null ? { temperature } : {}),
        stream: true,
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming)
      for await (const chunk of stream) {
        yield chunk
      }
    },

    async listModels(): Promise<HaiResult<string[]>> {
      const clientResult = resolveClient()
      if (!clientResult.success)
        return clientResult
      const { client } = clientResult.data
      try {
        const response = await client.models.list()
        const models = response.data.map((m: { id: string }) => m.id)
        return ok(models)
      }
      catch (error) {
        const mapped = toAIError(error)
        return err(mapped.def, mapped.message, mapped.cause)
      }
    },
  }
}
