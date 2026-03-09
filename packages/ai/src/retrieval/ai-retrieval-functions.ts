/**
 * @h-ai/ai — Retrieval 子功能实现
 *
 * 基于向量数据库 (@h-ai/vecdb) 和 Embedding 实现的检索功能。
 * @module ai-retrieval-functions
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'
import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
import type { AIStore, VecdbClient } from '../store/ai-store-types.js'
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
  vecdbClient: VecdbClient,
  sourceStore: AIStore<RetrievalSource>,
): RetrievalOperations {
  return {
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

    async listSources(): Promise<RetrievalSource[]> {
      return sourceStore.query({})
    },

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

        // 按分数降序排列
        allItems.sort((a, b) => b.score - a.score)

        // 限制总数（取全局 topK 或所有结果）
        const topK = request.topK ?? 10
        const limitedItems = allItems.slice(0, topK)

        const duration = Date.now() - startTime
        logger.debug('Retrieval completed', { query: request.query, resultCount: limitedItems.length, duration })

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
