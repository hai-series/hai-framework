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

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'embedding' })

/**
 * 创建 Embedding 操作接口
 *
 * @param config - 校验后的 AI 配置
 * @returns EmbeddingOperations 实例
 */
export function createEmbeddingOperations(config: AIConfig): EmbeddingOperations {
  const embeddingConfig: EmbeddingConfig = config.embedding ?? { model: 'text-embedding-3-small', batchSize: 100 }

  /** 获取 API Key（优先 embedding 配置 → LLM 配置 → 环境变量） */
  function getApiKey(): string | undefined {
    return embeddingConfig.apiKey
      ?? config.llm?.apiKey
      ?? process.env.HAI_OPENAI_API_KEY
      ?? process.env.OPENAI_API_KEY
  }

  /** 获取 Base URL */
  function getBaseUrl(): string | undefined {
    return embeddingConfig.baseUrl
      ?? config.llm?.baseUrl
      ?? process.env.HAI_OPENAI_BASE_URL
      ?? process.env.OPENAI_BASE_URL
  }

  /**
   * 调用 OpenAI Embeddings API
   */
  async function callEmbeddingAPI(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>> {
    const apiKey = getApiKey()
    if (!apiKey) {
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_configError', { params: { error: 'API Key is required for embedding' } }),
      })
    }

    const model = request.model ?? embeddingConfig.model
    const input = Array.isArray(request.input) ? request.input : [request.input]

    try {
      // 动态加载 OpenAI SDK
      const OpenAI = (await import('openai')).default

      const client = new OpenAI({
        apiKey,
        baseURL: getBaseUrl(),
      })

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
