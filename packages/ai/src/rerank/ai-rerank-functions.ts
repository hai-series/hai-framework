/**
 * @h-ai/ai — Rerank 子功能实现
 *
 * 基于 Cohere 兼容格式的文档重排序实现。
 * @module ai-rerank-functions
 */

import type { Result } from '@h-ai/core'
import type { AIConfig, RerankConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type {
  RerankDocument,
  RerankItem,
  RerankOperations,
  RerankRequest,
  RerankResponse,
} from './ai-rerank-types.js'

import process from 'node:process'
import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'rerank' })

/**
 * Cohere Rerank API 响应结果条目
 */
interface CohereRerankResult {
  index: number
  relevance_score: number
  document?: { text: string }
}

/**
 * Cohere Rerank API 响应体
 */
interface CohereRerankResponse {
  id: string
  results: CohereRerankResult[]
  meta?: Record<string, unknown>
}

/**
 * 创建 Rerank 操作接口
 *
 * 通过 Cohere 兼容的 Rerank API 对文档进行相关性重排序。
 * apiKey / baseUrl 优先使用 rerank 专属配置，未配置时回退到 LLM 配置和环境变量。
 *
 * @param config - 校验后的 AI 配置
 * @returns RerankOperations 实例
 */
export function createRerankOperations(config: AIConfig): RerankOperations {
  const rerankConfig: Partial<RerankConfig> = config.rerank ?? {}

  /** 获取 API Key */
  function getApiKey(): string | undefined {
    return rerankConfig.apiKey
      ?? config.llm?.apiKey
      ?? process.env.HAI_OPENAI_API_KEY
      ?? process.env.OPENAI_API_KEY
  }

  /** 获取 Base URL，默认使用 LLM 配置或 Cohere 官方地址 */
  function getBaseUrl(): string {
    const base = rerankConfig.baseUrl
      ?? config.llm?.baseUrl
      ?? process.env.HAI_OPENAI_BASE_URL
      ?? process.env.OPENAI_BASE_URL
      ?? 'https://api.cohere.com'
    return base.replace(/\/+$/, '')
  }

  /** 将输入文档统一转换为文本数组和 id 映射 */
  function normalizeDocuments(documents: string[] | RerankDocument[]): {
    texts: string[]
    ids: (string | undefined)[]
  } {
    if (documents.length === 0) {
      return { texts: [], ids: [] }
    }
    if (typeof documents[0] === 'string') {
      const strs = documents as string[]
      return { texts: strs, ids: strs.map(() => undefined) }
    }
    const docs = documents as RerankDocument[]
    return {
      texts: docs.map(d => d.text),
      ids: docs.map(d => d.id),
    }
  }

  /**
   * 调用 Cohere 兼容的 Rerank API
   */
  async function callRerankAPI(request: RerankRequest): Promise<Result<RerankResponse, AIError>> {
    const apiKey = getApiKey()
    if (!apiKey) {
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_configError', { params: { error: 'API Key is required for rerank' } }),
      })
    }

    const { texts, ids } = normalizeDocuments(request.documents)
    if (texts.length === 0) {
      return err({
        code: AIErrorCode.RERANK_INVALID_REQUEST,
        message: aiM('ai_rerankInvalidRequest', { params: { reason: 'documents cannot be empty' } }),
      })
    }

    const model = request.model ?? rerankConfig.model ?? 'rerank-english-v3.0'
    const baseUrl = getBaseUrl()

    const body: Record<string, unknown> = {
      model,
      query: request.query,
      documents: texts,
    }
    if (request.topN !== undefined) {
      body.top_n = request.topN
    }
    if (request.returnDocuments) {
      body.return_documents = true
    }

    logger.debug('Calling rerank API', { model, documentCount: texts.length, topN: request.topN })

    try {
      const response = await fetch(`${baseUrl}/v1/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        logger.error('Rerank API request failed', { status: response.status, error: errorText })
        return err({
          code: AIErrorCode.RERANK_API_ERROR,
          message: aiM('ai_rerankApiFailed', { params: { error: `HTTP ${response.status}: ${errorText}` } }),
        })
      }

      const data = await response.json() as CohereRerankResponse

      const results: RerankItem[] = data.results.map(item => ({
        index: item.index,
        id: ids[item.index],
        relevanceScore: item.relevance_score,
        document: item.document?.text,
      }))

      logger.debug('Rerank completed', { resultCount: results.length })

      return ok({ model, results })
    }
    catch (error) {
      logger.error('Rerank API call failed', { error })
      return err({
        code: AIErrorCode.RERANK_API_ERROR,
        message: aiM('ai_rerankApiFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  return {
    async rerank(request: RerankRequest): Promise<Result<RerankResponse, AIError>> {
      return callRerankAPI(request)
    },

    async rerankTexts(query: string, texts: string[], topN?: number): Promise<Result<RerankItem[], AIError>> {
      const result = await callRerankAPI({ query, documents: texts, topN })
      if (!result.success)
        return result
      return ok(result.data.results)
    },
  }
}
