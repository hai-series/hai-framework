/**
 * @h-ai/ai — Embedding 子功能实现
 *
 * 基于 OpenAI Embeddings API 的向量嵌入实现。
 * @module ai-embedding-functions
 */

import type { Result } from '@h-ai/core'
import type { AIConfig, EmbeddingConfig, ResolvedModelConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type {
  EmbeddingOperations,
  EmbeddingRequest,
  EmbeddingResponse,
} from './ai-embedding-types.js'

import { core, err, ok } from '@h-ai/core'
import OpenAI from 'openai'

import { AIErrorCode, resolveModelEntry } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'embedding' })

/**
 * 创建 Embedding 操作接口
 *
 * 提供文本向量嵌入能力，支持单条、批量和原始请求三种模式。
 * 内部复用同一个 OpenAI 客户端实例，批量请求按 batchSize 自动拆分。
 *
 * @param config - 校验后的 AI 配置（apiKey / baseUrl 来自 llm 配置，dimensions / batchSize 来自 embedding 配置）
 * @returns EmbeddingOperations 实例（`embed` / `embedText` / `embedBatch`）
 */
export function createEmbeddingOperations(config: AIConfig): EmbeddingOperations {
  const embeddingConfig: EmbeddingConfig = config.embedding ?? { batchSize: 100 }

  /**
   * 缓存的 OpenAI 客户端实例（按 model 缓存，避免不同模型共用同一个客户端）
   */
  let cachedClient: OpenAI | null = null
  let cachedResolvedKey: string | undefined

  /**
   * 获取或创建 OpenAI 客户端（首次调用时初始化，后续复用同一实例）
   */
  function getOrCreateClient(resolved: ResolvedModelConfig) {
    const apiKey = resolved.apiKey
    const baseURL = resolved.baseUrl

    // 如果 apiKey 变了（不同模型条目），需要重建客户端
    if (cachedClient && cachedResolvedKey === apiKey)
      return cachedClient

    cachedClient = new OpenAI({ apiKey, baseURL })
    cachedResolvedKey = apiKey
    return cachedClient
  }

  /**
   * 调用 OpenAI Embeddings API（单次请求）
   */
  async function callEmbeddingAPI(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>> {
    const resolvedResult = resolveModelEntry(config.llm, 'embedding', request.model, {
      missingApiKeyMessage: aiM('ai_configError', { params: { error: 'API Key is required for embedding' } }),
    })
    if (!resolvedResult.success)
      return resolvedResult
    const resolved = resolvedResult.data

    const input = Array.isArray(request.input) ? request.input : [request.input]

    try {
      const client = getOrCreateClient(resolved)

      const params: Record<string, unknown> = {
        model: resolved.model,
        input,
      }

      if (request.dimensions ?? embeddingConfig.dimensions) {
        params.dimensions = request.dimensions ?? embeddingConfig.dimensions
      }

      // OpenAI SDK embeddings.create 参数类型与动态构造的 params 不兼容，
      // 此处按需组装 model/input/dimensions 字段后断言为 SDK 参数类型
      const response = await client.embeddings.create(params as unknown as Parameters<typeof client.embeddings.create>[0])

      return ok({
        model: response.model,
        data: response.data.map(item => ({
          index: item.index,
          embedding: item.embedding,
        })),
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          total_tokens: response.usage.total_tokens,
        },
      })
    }
    catch (error) {
      logger.error('Embedding API call failed', { error })
      return err({
        code: AIErrorCode.EMBEDDING_API_ERROR,
        message: aiM('ai_internalError', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 对外统一嵌入入口：单条 / 批量都复用同一套分批逻辑
   */
  async function embedRequest(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>> {
    const input = Array.isArray(request.input) ? request.input : [request.input]
    const batchSize = embeddingConfig.batchSize

    // 如果输入不超过 batchSize，直接调用
    if (input.length <= batchSize) {
      return callEmbeddingAPI(request)
    }

    // 批量处理：按 batchSize 分组
    const allData: EmbeddingResponse['data'] = []
    let totalPromptTokens = 0
    let totalTokens = 0
    let resultModel = ''

    for (let i = 0; i < input.length; i += batchSize) {
      const batch = input.slice(i, i + batchSize)
      const result = await callEmbeddingAPI({ ...request, input: batch })
      if (!result.success)
        return result

      resultModel = result.data.model
      totalPromptTokens += result.data.usage.prompt_tokens
      totalTokens += result.data.usage.total_tokens

      // 调整 index 以反映全局位置
      for (const item of result.data.data) {
        allData.push({
          index: i + item.index,
          embedding: item.embedding,
        })
      }
    }

    return ok({
      model: resultModel,
      data: allData,
      usage: { prompt_tokens: totalPromptTokens, total_tokens: totalTokens },
    })
  }

  return {
    async embed(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>> {
      return embedRequest(request)
    },

    async embedText(text: string): Promise<Result<number[], AIError>> {
      const result = await embedRequest({ input: text })
      if (!result.success)
        return result
      const first = result.data.data.find(item => item.index === 0)
      if (!first) {
        return err({
          code: AIErrorCode.EMBEDDING_API_ERROR,
          message: aiM('ai_internalError', { params: { error: 'Embedding result is empty' } }),
        })
      }
      return ok(first.embedding)
    },

    async embedBatch(texts: string[]): Promise<Result<number[][], AIError>> {
      const result = await embedRequest({ input: texts })
      if (!result.success)
        return result
      const sorted = [...result.data.data].sort((a, b) => a.index - b.index)
      return ok(sorted.map(item => item.embedding))
    },
  }
}
