/**
 * @h-ai/ai — Embedding 子功能实现
 *
 * 基于 OpenAI Embeddings API 的向量嵌入实现。
 * @module ai-embedding-functions
 */

import type { Result } from '@h-ai/core'
import type { AIConfig, EmbeddingConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type {
  EmbeddingOperations,
  EmbeddingRequest,
  EmbeddingResponse,
} from './ai-embedding-types.js'

import process from 'node:process'
import { core, err, ok } from '@h-ai/core'

import { AIErrorCode, resolveModel } from '../ai-config.js'
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

  /** 获取 API Key（LLM 配置 → 环境变量） */
  function getApiKey(): string | undefined {
    return config.llm?.apiKey
      ?? process.env.HAI_OPENAI_API_KEY
      ?? process.env.OPENAI_API_KEY
  }

  /** 获取 Base URL */
  function getBaseUrl(): string | undefined {
    return config.llm?.baseUrl
      ?? process.env.HAI_OPENAI_BASE_URL
      ?? process.env.OPENAI_BASE_URL
  }

  /**
   * 缓存的 OpenAI 客户端实例（懒初始化，全生命周期复用）
   */
  let cachedClient: InstanceType<typeof import('openai').default> | null = null

  /**
   * 获取或创建 OpenAI 客户端（首次调用时初始化，后续复用同一实例）
   */
  async function getOrCreateClient() {
    if (cachedClient)
      return cachedClient

    const OpenAI = (await import('openai')).default
    cachedClient = new OpenAI({
      apiKey: getApiKey(),
      baseURL: getBaseUrl(),
    })
    return cachedClient
  }

  /**
   * 调用 OpenAI Embeddings API（单次请求）
   *
   * 复用缓存的 OpenAI 客户端。批量调用由上层 embed / embedBatch 拆分后逐批调用本函数。
   */
  async function callEmbeddingAPI(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>> {
    const apiKey = getApiKey()
    if (!apiKey) {
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_configError', { params: { error: 'API Key is required for embedding' } }),
      })
    }

    const model = request.model ?? resolveModel(config.llm, 'embedding')
    const input = Array.isArray(request.input) ? request.input : [request.input]

    try {
      const client = await getOrCreateClient()

      const params: Record<string, unknown> = {
        model,
        input,
      }

      if (request.dimensions ?? embeddingConfig.dimensions) {
        params.dimensions = request.dimensions ?? embeddingConfig.dimensions
      }

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

  return {
    async embed(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>> {
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
    },

    async embedText(text: string): Promise<Result<number[], AIError>> {
      const result = await callEmbeddingAPI({ input: text })
      if (!result.success)
        return result
      return ok(result.data.data[0].embedding)
    },

    async embedBatch(texts: string[]): Promise<Result<number[][], AIError>> {
      const request: EmbeddingRequest = { input: texts }
      const input = texts
      const batchSize = embeddingConfig.batchSize

      if (input.length <= batchSize) {
        const result = await callEmbeddingAPI(request)
        if (!result.success)
          return result
        // 按 index 排序并提取向量
        const sorted = result.data.data.sort((a, b) => a.index - b.index)
        return ok(sorted.map(item => item.embedding))
      }

      // 批量处理
      const allEmbeddings: { index: number, embedding: number[] }[] = []

      for (let i = 0; i < input.length; i += batchSize) {
        const batch = input.slice(i, i + batchSize)
        const result = await callEmbeddingAPI({ ...request, input: batch })
        if (!result.success)
          return result

        for (const item of result.data.data) {
          allEmbeddings.push({ index: i + item.index, embedding: item.embedding })
        }
      }

      allEmbeddings.sort((a, b) => a.index - b.index)
      return ok(allEmbeddings.map(item => item.embedding))
    },
  }
}
