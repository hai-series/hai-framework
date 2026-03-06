/**
 * @h-ai/ai — Knowledge 子功能实现
 *
 * 编排 datapipe + vecdb + reldb + embedding + LLM，
 * 实现文档导入、实体索引、信源追踪检索。
 * @module ai-knowledge-functions
 */

import type { Result } from '@h-ai/core'
import type { KnowledgeConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { Citation } from '../retrieval/ai-retrieval-types.js'
import type {
  EntityDocumentResult,
  EntityListOptions,
  EntityQueryOptions,
  KnowledgeAskOptions,
  KnowledgeAskResult,
  KnowledgeEntity,
  KnowledgeIngestInput,
  KnowledgeIngestResult,
  KnowledgeOperations,
  KnowledgeRetrieveItem,
  KnowledgeRetrieveOptions,
  KnowledgeRetrieveResult,
  KnowledgeSetupOptions,
} from './ai-knowledge-types.js'

import { core, err, ok } from '@h-ai/core'
import { nanoid } from 'nanoid'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { extractEntitiesBatch } from './ai-knowledge-entity.js'
import {
  createKnowledgeSchema,
  findByEntityName,
  findDocumentsByEntityIds,
  findEntitiesByName,
  insertEntityDocument,
  listEntities as listEntitiesFromDb,
  upsertEntity,
} from './ai-knowledge-schema.js'

const logger = core.logger.child({ module: 'ai', scope: 'knowledge' })

// ─── 延迟依赖类型 ───

/**
 * reldb 数据操作接口（最小化约束，延迟加载）
 */
interface DataOps {
  execute: (sql: string, params?: unknown[]) => Promise<Result<unknown, unknown>>
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<Result<T[], unknown>>
}

/**
 * vecdb 操作接口（最小化约束，延迟加载）
 */
interface VecdbOps {
  collection: {
    create: (name: string, options: { dimension: number }) => Promise<Result<void, unknown>>
    exists: (name: string) => Promise<Result<boolean, unknown>>
  }
  vector: {
    upsert: (collection: string, documents: Array<{ id: string, vector: number[], content?: string, metadata?: Record<string, unknown> }>) => Promise<Result<void, unknown>>
    search: (collection: string, vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }) => Promise<Result<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>, unknown>>
  }
}

/**
 * datapipe 操作接口（最小化约束，延迟加载）
 */
interface DatapipeOps {
  clean: (text: string, options?: Record<string, unknown>) => Result<string, unknown>
  chunk: (text: string, options: Record<string, unknown>) => Result<Array<{ index: number, content: string, metadata?: Record<string, unknown> }>, unknown>
}

// ─── 默认提示词 ───

const DEFAULT_KNOWLEDGE_ASK_SYSTEM_PROMPT = `You are an expert assistant. Answer the user's question based ONLY on the provided context.

Rules:
- Cite sources using [N] notation where N matches the context item number.
- If the context doesn't contain enough information, say so honestly.
- Be precise and factual.
- Prefer direct quotes when appropriate.`

/**
 * 创建 Knowledge 操作接口
 *
 * @param config - Knowledge 配置
 * @param llm - LLM 操作（用于实体提取和问答）
 * @param embedding - Embedding 操作（用于向量化）
 * @param getVecdb - 延迟获取 vecdb 实例
 * @param getReldb - 延迟获取 reldb 数据操作实例
 * @param getDatapipe - 延迟获取 datapipe 实例
 * @returns KnowledgeOperations 实例
 */
export function createKnowledgeOperations(
  config: KnowledgeConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations,
  getVecdb: () => Promise<VecdbOps | null>,
  getReldb: () => Promise<DataOps | null>,
  getDatapipe: () => Promise<DatapipeOps | null>,
): KnowledgeOperations {
  /** 是否已完成 setup */
  let isSetup = false

  return {
    // ─── setup ───
    async setup(options?: KnowledgeSetupOptions): Promise<Result<void, AIError>> {
      const collection = options?.collection ?? config.collection
      const dimension = options?.dimension ?? config.dimension

      logger.debug('Setting up knowledge base', { collection, dimension })

      try {
        // 创建 vecdb 集合
        const vecdbInstance = await getVecdb()
        if (!vecdbInstance) {
          return err({
            code: AIErrorCode.KNOWLEDGE_SETUP_FAILED,
            message: aiM('ai_knowledgeSetupFailed', { params: { error: 'vecdb not available' } }),
          })
        }

        const existsResult = await vecdbInstance.collection.exists(collection)
        if (existsResult.success && !existsResult.data) {
          const createResult = await vecdbInstance.collection.create(collection, { dimension })
          if (!createResult.success) {
            return err({
              code: AIErrorCode.KNOWLEDGE_SETUP_FAILED,
              message: aiM('ai_knowledgeSetupFailed', { params: { error: String(createResult.error) } }),
              cause: createResult.error,
            })
          }
        }

        // 创建 reldb 实体表
        const reldbInstance = await getReldb()
        if (reldbInstance) {
          const schemaResult = await createKnowledgeSchema(reldbInstance)
          if (!schemaResult.success)
            return schemaResult
        }
        else {
          logger.warn('reldb not available, entity indexing will be disabled')
        }

        isSetup = true
        logger.debug('Knowledge base setup completed', { collection })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Knowledge base setup failed', { error })
        return err({
          code: AIErrorCode.KNOWLEDGE_SETUP_FAILED,
          message: aiM('ai_knowledgeSetupFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    // ─── ingest ───
    async ingest(input: KnowledgeIngestInput): Promise<Result<KnowledgeIngestResult, AIError>> {
      if (!isSetup) {
        return err({
          code: AIErrorCode.KNOWLEDGE_NOT_SETUP,
          message: aiM('ai_knowledgeNotSetup'),
        })
      }

      const startTime = Date.now()
      const collection = input.collection ?? config.collection
      const enableEntityExtraction = input.enableEntityExtraction ?? config.enableEntityExtraction
      const chunkMode = input.chunkMode ?? config.chunkMode
      const chunkMaxSize = input.chunkMaxSize ?? config.chunkMaxSize
      const chunkOverlap = input.chunkOverlap ?? config.chunkOverlap

      logger.debug('Ingesting document', { documentId: input.documentId, collection, contentLength: input.content.length })

      try {
        // 获取依赖
        const datapipeInstance = await getDatapipe()
        const vecdbInstance = await getVecdb()

        if (!vecdbInstance) {
          return err({
            code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
            message: aiM('ai_knowledgeIngestFailed', { params: { error: 'vecdb not available' } }),
          })
        }

        // ① 清洗
        let cleanedText = input.content
        if (datapipeInstance) {
          const cleanResult = datapipeInstance.clean(input.content)
          if (cleanResult.success) {
            cleanedText = cleanResult.data
          }
        }

        // ② 分块
        let chunks: Array<{ index: number, content: string, metadata?: Record<string, unknown> }> = []
        if (datapipeInstance) {
          const chunkResult = datapipeInstance.chunk(cleanedText, {
            mode: chunkMode,
            maxSize: chunkMaxSize,
            overlap: chunkOverlap,
          })
          if (chunkResult.success) {
            chunks = chunkResult.data
          }
          else {
            // 分块失败时，将整个文本作为单一 chunk
            chunks = [{ index: 0, content: cleanedText }]
          }
        }
        else {
          // 没有 datapipe 时，将整个文本作为单一 chunk
          chunks = [{ index: 0, content: cleanedText }]
        }

        // ③ 批量向量化
        const texts = chunks.map(c => c.content)
        const embedResult = await embedding.embedBatch(texts)
        if (!embedResult.success) {
          return err({
            code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
            message: aiM('ai_knowledgeIngestFailed', { params: { error: 'Embedding failed' } }),
            cause: embedResult.error,
          })
        }

        // ④ 存入 vecdb
        const vectorDocuments = chunks.map((chunk, i) => {
          const chunkId = `${input.documentId}:chunk-${chunk.index}`
          return {
            id: chunkId,
            vector: embedResult.data[i],
            content: chunk.content,
            metadata: {
              ...input.metadata,
              ...chunk.metadata,
              documentId: input.documentId,
              title: input.title,
              url: input.url,
              position: `chunk:${chunk.index}`,
              chunkIndex: chunk.index,
            },
          }
        })

        const upsertResult = await vecdbInstance.vector.upsert(collection, vectorDocuments)
        if (!upsertResult.success) {
          return err({
            code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
            message: aiM('ai_knowledgeIngestFailed', { params: { error: String(upsertResult.error) } }),
            cause: upsertResult.error,
          })
        }

        // ⑤ 实体提取（可选）
        const extractedEntities: KnowledgeEntity[] = []

        if (enableEntityExtraction) {
          const reldbInstance = await getReldb()

          const chunkInputs = chunks.map(chunk => ({
            content: chunk.content,
            chunkId: `${input.documentId}:chunk-${chunk.index}`,
          }))

          const entityResult = await extractEntitiesBatch(llm, chunkInputs)
          if (entityResult.success) {
            // ⑥ 写入 reldb
            for (const entity of entityResult.data) {
              const entityId = `ent-${nanoid(12)}`
              const knowledgeEntity: KnowledgeEntity = {
                id: entityId,
                name: entity.name,
                type: entity.type,
                aliases: entity.aliases,
                description: entity.description,
              }
              extractedEntities.push(knowledgeEntity)

              if (reldbInstance) {
                // 插入实体
                await upsertEntity(reldbInstance, {
                  id: entityId,
                  name: entity.name,
                  type: entity.type,
                  aliases: entity.aliases,
                  description: entity.description,
                })

                // 插入文档-实体关联
                for (const chunkId of entity.chunkIds) {
                  await insertEntityDocument(reldbInstance, {
                    entityId,
                    documentId: input.documentId,
                    chunkId,
                    collection,
                    relevance: 1.0,
                    context: chunks.find(c => `${input.documentId}:chunk-${c.index}` === chunkId)?.content?.slice(0, 200),
                  })
                }
              }
            }
          }
          else {
            logger.warn('Entity extraction failed, skipping', { error: entityResult.error })
          }
        }

        const duration = Date.now() - startTime
        logger.debug('Document ingested', {
          documentId: input.documentId,
          chunkCount: chunks.length,
          entityCount: extractedEntities.length,
          duration,
        })

        return ok({
          documentId: input.documentId,
          chunkCount: chunks.length,
          entities: extractedEntities,
          duration,
        })
      }
      catch (error) {
        logger.error('Document ingestion failed', { documentId: input.documentId, error })
        return err({
          code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
          message: aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    // ─── retrieve ───
    async retrieve(query: string, options?: KnowledgeRetrieveOptions): Promise<Result<KnowledgeRetrieveResult, AIError>> {
      if (!isSetup) {
        return err({
          code: AIErrorCode.KNOWLEDGE_NOT_SETUP,
          message: aiM('ai_knowledgeNotSetup'),
        })
      }

      const startTime = Date.now()
      const collection = options?.collection ?? config.collection
      const topK = options?.topK ?? 10
      const enableEntityBoost = options?.enableEntityBoost ?? true

      logger.debug('Knowledge retrieval', { query: query.slice(0, 100), collection, topK })

      try {
        const vecdbInstance = await getVecdb()
        if (!vecdbInstance) {
          return err({
            code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
            message: aiM('ai_knowledgeRetrieveFailed', { params: { error: 'vecdb not available' } }),
          })
        }

        // ① 向量化查询
        const embedResult = await embedding.embedText(query)
        if (!embedResult.success) {
          return err({
            code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
            message: aiM('ai_knowledgeRetrieveFailed', { params: { error: 'Query embedding failed' } }),
            cause: embedResult.error,
          })
        }

        // ② 向量搜索
        const searchResult = await vecdbInstance.vector.search(collection, embedResult.data, {
          topK: topK * 2, // 多取一些，后续合并后再截断
          minScore: options?.minScore,
          filter: options?.filter,
        })

        if (!searchResult.success) {
          return err({
            code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
            message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(searchResult.error) } }),
            cause: searchResult.error,
          })
        }

        // 构建结果项
        const itemMap = new Map<string, KnowledgeRetrieveItem>()
        for (const hit of searchResult.data) {
          const metadata = hit.metadata ?? {}
          const citation: Citation = {
            documentId: metadata.documentId as string | undefined,
            title: metadata.title as string | undefined,
            url: metadata.url as string | undefined,
            position: metadata.position as string | undefined,
            chunkId: hit.id,
            collection,
          }

          itemMap.set(hit.id, {
            id: hit.id,
            content: hit.content ?? '',
            score: hit.score,
            citation,
            metadata,
            matchedEntities: [],
          })
        }

        // ③ 实体增强（可选）
        if (enableEntityBoost) {
          const reldbInstance = await getReldb()
          if (reldbInstance) {
            // 从查询文本中提取可能的实体关键词
            const entityResult = await findEntitiesByName(reldbInstance, query)
            if (entityResult.success && entityResult.data.length > 0) {
              const entityIds = entityResult.data.map(e => e.id)
              const entityNameMap = new Map(entityResult.data.map(e => [e.id, e.name]))

              // 查询倒排索引
              const docResult = await findDocumentsByEntityIds(reldbInstance, entityIds, collection)
              if (docResult.success) {
                const boostWeight = config.entityBoostWeight

                for (const relation of docResult.data) {
                  const chunkKey = relation.chunkId || relation.documentId
                  const entityName = entityNameMap.get(relation.entityId) ?? ''

                  // 查找已有结果项，加权
                  for (const [itemId, item] of itemMap) {
                    const itemDocId = item.metadata?.documentId as string | undefined
                    if (itemId === chunkKey || itemDocId === relation.documentId) {
                      item.score += boostWeight * relation.relevance
                      if (entityName && !item.matchedEntities!.includes(entityName)) {
                        item.matchedEntities!.push(entityName)
                      }
                    }
                  }

                  // 如果倒排索引中的文档不在向量搜索结果中，可以考虑补充
                  // 但为简化实现，这里仅对已有结果加权
                }
              }
            }
          }
        }

        // 排序 + 截断
        const items = Array.from(itemMap.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, topK)

        // 去重信源引用
        const citationMap = new Map<string, Citation>()
        for (const item of items) {
          const key = item.citation.documentId ?? item.citation.chunkId ?? item.id
          if (!citationMap.has(key)) {
            citationMap.set(key, item.citation)
          }
        }

        const duration = Date.now() - startTime
        logger.debug('Knowledge retrieval completed', { resultCount: items.length, duration })

        return ok({
          items,
          citations: Array.from(citationMap.values()),
          query,
          duration,
        })
      }
      catch (error) {
        logger.error('Knowledge retrieval failed', { error })
        return err({
          code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
          message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    // ─── ask ───
    async ask(query: string, options?: KnowledgeAskOptions): Promise<Result<KnowledgeAskResult, AIError>> {
      // 先检索
      const retrieveResult = await this.retrieve(query, options)
      if (!retrieveResult.success) {
        return err({
          code: AIErrorCode.RAG_FAILED,
          message: aiM('ai_ragFailed', { params: { error: retrieveResult.error.message } }),
          cause: retrieveResult.error,
        })
      }

      const { items, citations } = retrieveResult.data

      // 格式化上下文（带编号引用标记）
      const contextText = items.length > 0
        ? items.map((item, i) => {
            const source = item.citation.title ?? item.citation.documentId ?? item.citation.chunkId ?? 'unknown'
            return `[${i + 1}] (source: ${source}, score: ${item.score.toFixed(3)})\n${item.content}`
          }).join('\n\n')
        : 'No relevant context found.'

      // 构建 LLM 消息
      const systemPrompt = options?.systemPrompt ?? DEFAULT_KNOWLEDGE_ASK_SYSTEM_PROMPT
      const systemContent = `${systemPrompt}\n\n--- Context ---\n${contextText}\n--- End Context ---`

      const messages: ChatMessage[] = [
        { role: 'system', content: systemContent },
      ]

      // 消息历史
      if (options?.messages) {
        for (const msg of options.messages) {
          messages.push({ role: msg.role, content: msg.content })
        }
      }

      messages.push({ role: 'user', content: query })

      // 调用 LLM
      const chatResult = await llm.chat({
        model: options?.model,
        messages,
        temperature: options?.temperature,
      })

      if (!chatResult.success) {
        return err({
          code: AIErrorCode.RAG_FAILED,
          message: aiM('ai_ragFailed', { params: { error: chatResult.error.message } }),
          cause: chatResult.error,
        })
      }

      const choice = chatResult.data.choices[0]
      const answer = choice?.message?.content ?? ''

      logger.debug('Knowledge ask completed', {
        contextCount: items.length,
        model: chatResult.data.model,
      })

      return ok({
        answer,
        context: items,
        citations,
        query,
        model: chatResult.data.model,
        usage: chatResult.data.usage
          ? {
              prompt_tokens: chatResult.data.usage.prompt_tokens,
              completion_tokens: chatResult.data.usage.completion_tokens,
              total_tokens: chatResult.data.usage.total_tokens,
            }
          : undefined,
      })
    },

    // ─── findByEntity ───
    async findByEntity(entityName: string, options?: EntityQueryOptions): Promise<Result<EntityDocumentResult[], AIError>> {
      const reldbInstance = await getReldb()
      if (!reldbInstance) {
        return err({
          code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
          message: aiM('ai_knowledgeRetrieveFailed', { params: { error: 'reldb not available' } }),
        })
      }

      const result = await findByEntityName(reldbInstance, entityName, {
        collection: options?.collection ?? config.collection,
        type: options?.type,
      })

      if (!result.success)
        return result as Result<never, AIError>

      return ok(result.data.map(item => ({
        entity: {
          id: item.entity.id,
          name: item.entity.name,
          type: item.entity.type as KnowledgeEntity['type'],
          aliases: item.entity.aliases,
          description: item.entity.description ?? undefined,
        },
        documents: item.documents.map(doc => ({
          documentId: doc.documentId,
          chunkId: doc.chunkId || undefined,
          collection: doc.collection,
          relevance: doc.relevance,
          context: doc.context ?? undefined,
        })),
      })))
    },

    // ─── listEntities ───
    async listEntities(options?: EntityListOptions): Promise<Result<KnowledgeEntity[], AIError>> {
      const reldbInstance = await getReldb()
      if (!reldbInstance) {
        return err({
          code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
          message: aiM('ai_knowledgeRetrieveFailed', { params: { error: 'reldb not available' } }),
        })
      }

      const result = await listEntitiesFromDb(reldbInstance, {
        type: options?.type,
        keyword: options?.keyword,
        limit: options?.limit,
      })

      if (!result.success)
        return result as Result<never, AIError>

      return ok(result.data.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type as KnowledgeEntity['type'],
        aliases: row.aliases,
        description: row.description ?? undefined,
        createdAt: row.createdAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
      })))
    },
  }
}
