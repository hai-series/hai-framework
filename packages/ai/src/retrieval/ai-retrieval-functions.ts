/**
 * @h-ai/ai — Retrieval 子功能实现
 *
 * 基于向量数据库 (@h-ai/vecdb) 和 Embedding 实现的检索功能。
 * @module ai-retrieval-functions
 */

import type { Result } from '@h-ai/core'
import type { VecdbFunctions } from '@h-ai/vecdb'
import type { AIError } from '../ai-types.js'
import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
import type { RerankOperations } from '../rerank/ai-rerank-types.js'
import type { AIStore } from '../store/ai-store-types.js'
import type {
  Citation,
  RetrievalOperations,
  RetrievalRequest,
  RetrievalResult,
  RetrievalResultItem,
  RetrievalSource,
} from './ai-retrieval-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'retrieval' })

/**
 * 创建 Retrieval 操作接口
 *
 * @param embeddingOps - Embedding 操作（用于将查询文本向量化）
 * @param vecdbClient - vecdb 客户端（用于向量检索）
 * @param sourceStore - 检索源持久化存储（支持分布式一致）
 * @returns RetrievalOperations 实例
 */
export function createRetrievalOperations(
  embeddingOps: EmbeddingOperations,
  vecdbClient: VecdbFunctions,
  sourceStore: AIStore<RetrievalSource>,
  rerankOps?: RerankOperations | null,
): RetrievalOperations {
  return {
    /**
     * 注册检索源
     *
     * 将配置好的检索源持久化到 store，后续 `retrieve` 时根据 source.id 匹配。
     * 同一 id 不可重复注册，重复调用返回错误。
     *
     * @param source - 检索源配置（id、collection、描述等）
     * @returns `ok(undefined)` 注册成功；`err` 含错误码 `RETRIEVAL_FAILED`（重复注册）
     */
    async addSource(source: RetrievalSource): Promise<Result<void, AIError>> {
      const existing = await sourceStore.get(source.id)
      if (existing) {
        return err({
          code: AIErrorCode.RETRIEVAL_FAILED,
          message: aiM('ai_internalError', { params: { error: `Source '${source.id}' already exists` } }),
        })
      }
      await sourceStore.save(source.id, source)
      logger.debug('Retrieval source added', { sourceId: source.id, collection: source.collection })
      return ok(undefined)
    },

    /**
     * 取消注册检索源
     *
     * 从 store 删除指定 id 的检索源。源不存在时返回 `RETRIEVAL_SOURCE_NOT_FOUND` 错误。
     *
     * @param sourceId - 检索源的唯一标识
     * @returns `ok(undefined)` 删除成功；`err` 含错误码 `RETRIEVAL_SOURCE_NOT_FOUND`
     */
    async removeSource(sourceId: string): Promise<Result<void, AIError>> {
      const existing = await sourceStore.get(sourceId)
      if (!existing) {
        return err({
          code: AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND,
          message: aiM('ai_internalError', { params: { error: `Source '${sourceId}' not found` } }),
        })
      }
      await sourceStore.remove(sourceId)
      logger.debug('Retrieval source removed', { sourceId })
      return ok(undefined)
    },

    /**
     * 列出所有已注册的检索源
     *
     * @returns 全部检索源数组（无源时返回空数组）
     */
    async listSources(): Promise<RetrievalSource[]> {
      return sourceStore.query({})
    },

    /**
     * 执行向量检索
     *
     * 流程：
     * 1. 将 `request.query` 向量化（Embedding）
     * 2. 对每个目标检索源并发执行向量近邻搜索
     * 3. 合并结果 → 按 score 降序 → 截取 topK
     *
     * @param request - 检索请求（query、可选 sources / topK / minScore 等）
     * @returns `ok(RetrievalResult)` 含检索项列表与引用信息；无源时返回 `RETRIEVAL_SOURCE_NOT_FOUND` 错误
     *
     * @example
     * ```ts
     * const result = await retrieval.retrieve({ query: '向量数据库', topK: 5 })
     * if (result.success) console.log(result.data.items)
     * ```
     */
    async retrieve(request: RetrievalRequest): Promise<Result<RetrievalResult, AIError>> {
      const startTime = Date.now()

      // 确定要查询的源（从 DB 读取，分布式一致）
      const targetSources = await sourceStore.query(
        request.sources?.length
          ? { where: { id: { $in: request.sources } } }
          : {},
      )

      if (targetSources.length === 0) {
        return err({
          code: AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND,
          message: aiM('ai_internalError', { params: { error: 'No retrieval sources configured' } }),
        })
      }

      try {
        // 向量化查询文本
        const embedResult = await embeddingOps.embedText(request.query)
        if (!embedResult.success) {
          return err({
            code: AIErrorCode.RETRIEVAL_FAILED,
            message: aiM('ai_internalError', { params: { error: 'Failed to embed query' } }),
            cause: embedResult.error,
          })
        }

        const queryVector = embedResult.data

        // 并发查询所有源
        const allItems: RetrievalResultItem[] = []

        const searchPromises = targetSources.map(async (source) => {
          const topK = request.topK ?? source.topK ?? 5
          const minScore = request.minScore ?? source.minScore

          const searchResult = await vecdbClient.vector.search(source.collection, queryVector, {
            topK,
            minScore,
            filter: source.filter,
          })

          if (!searchResult.success) {
            logger.warn('Retrieval search failed for source', { sourceId: source.id, error: searchResult.error })
            return
          }

          for (const item of searchResult.data) {
            // 从向量记录 metadata 构建结构化信源引用
            const citation: Citation = {
              documentId: item.metadata?.documentId as string | undefined,
              title: item.metadata?.title as string | undefined ?? source.name,
              url: item.metadata?.url as string | undefined ?? source.url,
              position: item.metadata?.position as string | undefined,
              chunkId: item.id,
              collection: source.collection,
            }

            allItems.push({
              id: item.id,
              content: item.content ?? '',
              score: item.score,
              sourceId: source.id,
              metadata: item.metadata,
              citation,
            })
          }
        })

        await Promise.all(searchPromises)

        // 可选：Rerank 重排序
        if (request.enableRerank && rerankOps && allItems.length > 0) {
          const rerankResult = await rerankOps.rerank({
            query: request.query,
            documents: allItems.map(item => item.content),
            model: request.rerankModel,
            topN: request.topK ?? 10,
            returnDocuments: false,
          })
          if (rerankResult.success) {
            const reranked = rerankResult.data.results
              .map(r => ({ ...allItems[r.index], score: r.relevanceScore }))
            allItems.length = 0
            allItems.push(...reranked)
          }
          else {
            logger.warn('Rerank failed, falling back to vector scores', { error: rerankResult.error })
          }
        }

        // 按分数降序排列
        allItems.sort((a, b) => b.score - a.score)

        // 限制总数（取全局 topK 或所有结果）
        const topK = request.topK ?? 10
        const limitedItems = allItems.slice(0, topK)

        const duration = Date.now() - startTime
        logger.trace('Retrieval completed', { query: request.query, resultCount: limitedItems.length, duration })

        return ok({
          items: limitedItems,
          query: request.query,
          duration,
        })
      }
      catch (error) {
        logger.error('Retrieval failed', { error })
        return err({
          code: AIErrorCode.RETRIEVAL_FAILED,
          message: aiM('ai_internalError', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }
}
