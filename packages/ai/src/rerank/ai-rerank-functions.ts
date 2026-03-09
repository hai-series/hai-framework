/**
 * @h-ai/ai — Rerank 子功能实现
 *
 * 基于 Cohere 兼容格式的文档重排序实现。
 * @module ai-rerank-functions
 */

import type { Result } from '@h-ai/core'
import type { AIConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type {
  RerankDocument,
  RerankItem,
  RerankOperations,
  RerankRequest,
  RerankResponse,
} from './ai-rerank-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode, resolveModelEntry } from '../ai-config.js'
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
 * apiKey / baseUrl / model 统一通过 `resolveModelEntry(llm, 'rerank')` 解析，
 * 可在 `llm.models` 中为 rerank 场景配置独立的 apiKey / baseUrl。
 *
 * @param config - 校验后的 AI 配置
 * @returns RerankOperations 实例
 */
export function createRerankOperations(config: AIConfig): RerankOperations {
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
    const resolvedResult = resolveModelEntry(config.llm, 'rerank', request.model, {
      missingApiKeyMessage: aiM('ai_configError', { params: { error: 'API Key is required for rerank' } }),
    })
    if (!resolvedResult.success)
      return resolvedResult
    const resolved = resolvedResult.data

    const { texts, ids } = normalizeDocuments(request.documents)
    if (texts.length === 0) {
      return err({
        code: AIErrorCode.RERANK_INVALID_REQUEST,
        message: aiM('ai_rerankInvalidRequest', { params: { reason: 'documents cannot be empty' } }),
      })
    }

    const body: Record<string, unknown> = {
      model: resolved.model,
      query: request.query,
      documents: texts,
    }
    if (request.topN !== undefined) {
      body.top_n = request.topN
    }
    if (request.returnDocuments) {
      body.return_documents = true
    }

    logger.trace('Calling rerank API', { model: resolved.model, documentCount: texts.length, topN: request.topN })

    try {
      const response = await fetch(`${resolved.baseUrl}/v1/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resolved.apiKey}`,
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

      logger.trace('Rerank completed', { resultCount: results.length })

      return ok({ model: resolved.model, results })
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
    /**
     * 对文档列表进行相关度重排
     *
     * 调用 Cohere 兼容 Rerank API，按与 query 的语义相关度对文档重新排序。
     *
     * @param request - 重排请求（query、documents、可选 topN/model）
     * @returns `ok(RerankResponse)` 含重排后的结果列表；API 调用失败时返回 `RERANK_API_ERROR`
     */
    async rerank(request: RerankRequest): Promise<Result<RerankResponse, AIError>> {
      return callRerankAPI(request)
    },

    /**
     * 对纯文本数组进行重排（`rerank` 的简化版本）
     *
     * @param query - 用于对比相关度的查询文本
     * @param texts - 待重排的文本列表
     * @param topN - 仅返回前 N 个结果（可选）
     * @returns `ok(RerankItem[])` 按相关度降序排列的结果；API 调用失败时返回错误
     */
    async rerankTexts(query: string, texts: string[], topN?: number): Promise<Result<RerankItem[], AIError>> {
      const result = await callRerankAPI({ query, documents: texts, topN })
      if (!result.success)
        return result
      return ok(result.data.results)
    },
  }
}
