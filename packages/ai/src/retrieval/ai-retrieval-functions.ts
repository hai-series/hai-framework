/**
 * @h-ai/ai — Retrieval 子功能实现
 *
 * 基于向量数据库 (@h-ai/vecdb) 和 Embedding 实现的检索功能。
 * @module ai-retrieval-functions
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'
import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
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
 * @returns RetrievalOperations 实例
 */
export function createRetrievalOperations(embeddingOps: EmbeddingOperations): RetrievalOperations {
  /** 已注册的检索源 */
  const sources = new Map<string, RetrievalSource>()

  return {
    addSource(source: RetrievalSource): Result<void, AIError> {
      if (sources.has(source.id)) {
        return err({
          code: AIErrorCode.RETRIEVAL_FAILED,
          message: aiM('ai_internalError', { params: { error: `Source '${source.id}' already exists` } }),
        })
      }
      sources.set(source.id, source)
      logger.info('Retrieval source added', { sourceId: source.id, collection: source.collection })
      return ok(undefined)
    },

    removeSource(sourceId: string): Result<void, AIError> {
      if (!sources.has(sourceId)) {
        return err({
          code: AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND,
          message: aiM('ai_internalError', { params: { error: `Source '${sourceId}' not found` } }),
        })
      }
      sources.delete(sourceId)
      logger.info('Retrieval source removed', { sourceId })
      return ok(undefined)
    },

    listSources(): RetrievalSource[] {
      return Array.from(sources.values())
    },

    async retrieve(request: RetrievalRequest): Promise<Result<RetrievalResult, AIError>> {
      const startTime = Date.now()

      // 确定要查询的源
      const targetSources: RetrievalSource[] = request.sources
        ? request.sources
            .map(id => sources.get(id))
            .filter((s): s is RetrievalSource => s !== undefined)
        : Array.from(sources.values())

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

        // 动态加载 vecdb（延迟依赖，避免循环引用）
        const { vecdb } = await import('@h-ai/vecdb') as { vecdb: { vector: { search: (collection: string, vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }) => Promise<Result<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>, unknown>> } } }

        // 并发查询所有源
        const allItems: RetrievalResultItem[] = []

        const searchPromises = targetSources.map(async (source) => {
          const topK = request.topK ?? source.topK ?? 5
          const minScore = request.minScore ?? source.minScore

          const searchResult = await vecdb.vector.search(source.collection, queryVector, {
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
        logger.info('Retrieval completed', { query: request.query, resultCount: limitedItems.length, duration })

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
