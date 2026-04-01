/**
 * @h-ai/ai — Knowledge 子功能实现
 *
 * 编排 datapipe + KnowledgeStore + embedding + LLM，
 * 实现文档导入、实体索引、信源追踪检索。
 * @module ai-knowledge-functions
 */

import type { HaiResult } from '@h-ai/core'
import type { ChunkOptionsInput, CleanOptionsInput, DatapipeFunctions } from '@h-ai/datapipe'
import type { KnowledgeConfig } from '../ai-config.js'

import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { Citation } from '../retrieval/ai-retrieval-types.js'
import type { KnowledgeStore } from '../store/ai-store-types.js'
import type {
  EntityDocumentResult,
  EntityListOptions,
  EntityQueryOptions,
  KnowledgeAskOptions,
  KnowledgeAskResult,
  KnowledgeDocumentInfo,
  KnowledgeDocumentListOptions,
  KnowledgeDocumentRemoveOptions,
  KnowledgeEntity,
  KnowledgeIngestBatchProgress,
  KnowledgeIngestBatchResult,
  KnowledgeIngestFileInput,
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

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { extractEntities, extractEntitiesBatch } from './ai-knowledge-entity.js'

const logger = core.logger.child({ module: 'ai', scope: 'knowledge' })

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
 * 编排 datapipe → embedding → KnowledgeStore（向量存储 + 实体倒排索引），
 * 实现文档导入、语义检索与实体增强。
 *
 * @param config - Knowledge 配置（分块策略、向量集合、实体提取开关等）
 * @param llm - LLM 操作（用于实体提取和问答生成）
 * @param embedding - Embedding 操作（用于文本向量化）
 * @param datapipe - datapipe 实例（必选，用于文本清洗与分块）
 * @param store - KnowledgeStore 实例（可选，未提供时 knowledge 子系统不可用）
 * @returns KnowledgeOperations 实例
 */
export function createKnowledgeOperations(
  config: KnowledgeConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations,
  datapipe: DatapipeFunctions,
  store?: KnowledgeStore,
): KnowledgeOperations {
  /** 已完成 setup 的 collection 集合（每次 setup() 成功后将对应 collection 名加入） */
  const setupCollections = new Set<string>()

  return {
    // ─── setup ───
    /**
     * 初始化知识库（幂等，支持多次调用以初始化不同 collection）
     *
     * 创建 vecdb 集合（已存在则跳过）和 reldb 实体索引表（DDL 幂等）。
     * **每个 collection 在使用 `ingest` / `retrieve` / `ask` 前必须先对该 collection 执行 `setup`。**
     * 多分场景下可多次调用本方法，每次传入不同 `collection` 名称。
     *
     * @param options - 可选覆盖（collection 名称、向量维度）
     * @returns `ok(undefined)` 成功；建表失败时返回 `KNOWLEDGE_SETUP_FAILED`
     */
    async setup(options?: KnowledgeSetupOptions): Promise<HaiResult<void>> {
      if (!store) {
        return err(HaiAIError.KNOWLEDGE_SETUP_FAILED, aiM('ai_knowledgeSetupFailed', { params: { error: 'KnowledgeStore not available. Provider may not support knowledge operations.' } }))
      }

      const collection = options?.collection ?? config.collection
      const dimension = options?.dimension ?? config.dimension

      logger.debug('Setting up knowledge base', { collection, dimension })

      try {
        await store.initialize(collection, dimension)

        setupCollections.add(collection)
        logger.debug('Knowledge base setup completed', { collection })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Knowledge base setup failed', { error })
        return err(HaiAIError.KNOWLEDGE_SETUP_FAILED, aiM('ai_knowledgeSetupFailed', { params: { error: String(error) } }), error)
      }
    },

    // ─── ingest ───
    /**
     * 导入文档到知识库
     *
     * 流程：清洗 → 分块 → Embedding 向量化 → 存入 vecdb；
     * 可选地提取命名实体并建立倒排索引（实体增强相关度）。
     *
     * @param input - 导入输入（documentId、content、可选 cleanOptions / chunkOptions / metadata 等）
     * @returns `ok(KnowledgeIngestResult)` 含导入信息；未初始化时返回 `KNOWLEDGE_NOT_SETUP`
     *
     * @example
     * ```ts
     * await knowledge.ingest({
     *   documentId: 'doc-001',
     *   content: '文章内容...',
     *   chunkOptions: { maxSize: 512 },
     * })
     * ```
     */
    async ingest(input: KnowledgeIngestInput): Promise<HaiResult<KnowledgeIngestResult>> {
      const collection = input.collection ?? config.collection
      if (!setupCollections.has(collection)) {
        return err(HaiAIError.KNOWLEDGE_NOT_SETUP, aiM('ai_knowledgeNotSetup'))
      }

      const startTime = Date.now()
      const enableEntityExtraction = input.enableEntityExtraction ?? config.enableEntityExtraction
      // 合并 config 默认值与 input 覆盖选项（input 优先级更高）
      const cleanOptions: CleanOptionsInput = {
        ...config.cleanOptions,
        ...input.cleanOptions,
      }
      const chunkOptions: ChunkOptionsInput = {
        ...config.chunkOptions,
        ...input.chunkOptions,
      }

      logger.trace('Ingesting document', { documentId: input.documentId, collection, contentLength: input.content.length })

      try {
        // ① 清洗：标准化文本（去 HTML、空白规整等）
        const cleanResult = datapipe.clean(input.content, cleanOptions)
        const cleanedText = cleanResult.success ? cleanResult.data : input.content

        // ② 分块：按指定策略切割（分块失败退回整文本单一 chunk）
        const chunkResult = datapipe.chunk(cleanedText, chunkOptions)
        const chunks: Array<{ index: number, content: string, metadata?: Record<string, unknown> }> = chunkResult.success
          ? chunkResult.data
          : [{ index: 0, content: cleanedText }]

        // ③ 批量向量化
        const texts = chunks.map(c => c.content)
        const embedResult = await embedding.embedBatch(texts)
        if (!embedResult.success) {
          return err(HaiAIError.KNOWLEDGE_INGEST_FAILED, aiM('ai_knowledgeIngestFailed', { params: { error: 'Embedding failed' } }), embedResult.error)
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

        await store!.upsertVectors(collection, vectorDocuments)

        // ④.b 记录文档元数据
        await store!.upsertDocument({
          documentId: input.documentId,
          collection,
          title: input.title,
          url: input.url,
          chunkCount: chunks.length,
          createdAt: Date.now(),
        })

        // ⑤ 实体提取（可选）
        const extractedEntities: KnowledgeEntity[] = []

        if (enableEntityExtraction) {
          const chunkInputs = chunks.map(chunk => ({
            content: chunk.content,
            chunkId: `${input.documentId}:chunk-${chunk.index}`,
          }))

          const entityResult = await extractEntitiesBatch(llm, chunkInputs, undefined, config.entityTypes, config.systemPrompt)
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

              // 插入实体
              await store!.upsertEntity({
                id: entityId,
                name: entity.name,
                type: entity.type,
                aliases: entity.aliases,
                description: entity.description,
              })

              // 插入文档-实体关联（每个命中的 chunkId 建一条倒排记录）
              for (const chunkId of entity.chunkIds) {
                await store!.insertEntityDocument({
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
        return err(HaiAIError.KNOWLEDGE_INGEST_FAILED, aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }), error)
      }
    },

    // ─── retrieve ───
    /**
     * 语义检索知识库
     *
     * 1. 将查询向量化 → 2. vecdb 向量搜索 → 3. 实体增强（可选）：
     * LLM 提取查询中的命名实体，查实体倒排索引对匹配文档加权重排。
     *
     * @param query - 查询文本
     * @param options - 可选（collection、topK、minScore、enableEntityBoost、filter 等）
     * @returns `ok(KnowledgeRetrieveResult)` 含检索项和引用列表；未初始化时返回 `KNOWLEDGE_NOT_SETUP`
     */
    async retrieve(query: string, options?: KnowledgeRetrieveOptions): Promise<HaiResult<KnowledgeRetrieveResult>> {
      const collection = options?.collection ?? config.collection
      if (!setupCollections.has(collection)) {
        return err(HaiAIError.KNOWLEDGE_NOT_SETUP, aiM('ai_knowledgeNotSetup'))
      }

      const startTime = Date.now()
      const topK = options?.topK ?? 10
      const enableEntityBoost = options?.enableEntityBoost ?? true

      logger.trace('Knowledge retrieval', { query: query.slice(0, 100), collection, topK })

      try {
        // ① 向量化查询
        const embedResult = await embedding.embedText(query)
        if (!embedResult.success) {
          return err(HaiAIError.KNOWLEDGE_RETRIEVE_FAILED, aiM('ai_knowledgeRetrieveFailed', { params: { error: 'Query embedding failed' } }), embedResult.error)
        }

        // ② 向量搜索
        const searchHits = await store!.searchVectors(collection, embedResult.data, {
          topK: topK * 2, // 多取一些，后续合并后再截断
          minScore: options?.minScore,
          filter: options?.filter,
        })

        // 构建结果项
        const itemMap = new Map<string, KnowledgeRetrieveItem>()
        for (const hit of searchHits) {
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

        // ③ 实体增强（可选）：先用 LLM 从查询中提取命名实体，再查倒排索引对向量结果加权
        if (enableEntityBoost) {
          const queryEntityResult = await extractEntities(
            llm,
            query,
            undefined,
            config.entityTypes,
            config.systemPrompt,
          )
          const queryEntityNames = queryEntityResult.success
            ? queryEntityResult.data.map(e => e.name)
            : []

          if (queryEntityNames.length > 0) {
            // 合并多个实体名的匹配结果（Map 保证去重）
            const entityMap = new Map<string, { id: string, name: string, type: string, aliases: string[] }>()
            for (const name of queryEntityNames) {
              const entities = await store!.findEntitiesByName(name)
              for (const e of entities)
                entityMap.set(e.id, e)
            }

            if (entityMap.size > 0) {
              const entityIds = Array.from(entityMap.keys())
              const entityNameMap = new Map(Array.from(entityMap.values()).map(e => [e.id, e.name]))

              const docRelations = await store!.findDocumentsByEntityIds(entityIds, collection)
              const boostWeight = config.entityBoostWeight

              for (const relation of docRelations) {
                const chunkKey = relation.chunkId || relation.documentId
                const entityName = entityNameMap.get(relation.entityId) ?? ''

                for (const [itemId, item] of itemMap) {
                  const itemDocId = item.metadata?.documentId as string | undefined
                  if (itemId === chunkKey || itemDocId === relation.documentId) {
                    item.score += boostWeight * relation.relevance
                    if (entityName && !item.matchedEntities!.includes(entityName)) {
                      item.matchedEntities!.push(entityName)
                    }
                  }
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
        logger.trace('Knowledge retrieval completed', { resultCount: items.length, duration })

        return ok({
          items,
          citations: Array.from(citationMap.values()),
          query,
          duration,
        })
      }
      catch (error) {
        logger.error('Knowledge retrieval failed', { error })
        return err(HaiAIError.KNOWLEDGE_RETRIEVE_FAILED, aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), error)
      }
    },

    // ─── ask ───
    /**
     * 基于知识库回答问题（RAG 模式）
     *
     * 内部调用 `retrieve` 获取相关文档，将检索结果格式化为上下文后和历史消息一起发送给 LLM 生成回答。
     *
     * @param query - 用户问题
     * @param options - 可选（满足 `KnowledgeRetrieveOptions` 的所有选项 + systemPrompt、messages、temperature、model）
     * @returns `ok(KnowledgeAskResult)` 含 answer、context 列表、citations、usage 等；检索或生成失败时返回错误
     *
     * @example
     * ```ts
     * const result = await knowledge.ask('座山方皮是什么？')
     * if (result.success) console.log(result.data.answer)
     * ```
     */
    async ask(query: string, options?: KnowledgeAskOptions): Promise<HaiResult<KnowledgeAskResult>> {
      // 先检索
      const retrieveResult = await this.retrieve(query, options)
      if (!retrieveResult.success) {
        return err(HaiAIError.RAG_FAILED, aiM('ai_ragFailed', { params: { error: retrieveResult.error.message } }), retrieveResult.error)
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
        messages.push(...options.messages)
      }

      messages.push({ role: 'user', content: query })

      // 调用 LLM
      const chatResult = await llm.chat({
        model: options?.model,
        messages,
        temperature: options?.temperature,
      })

      if (!chatResult.success) {
        return err(HaiAIError.RAG_FAILED, aiM('ai_ragFailed', { params: { error: chatResult.error.message } }), chatResult.error)
      }

      const choice = chatResult.data.choices[0]
      const answer = choice?.message?.content ?? ''

      logger.trace('Knowledge ask completed', {
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
    async findByEntity(entityName: string, options?: EntityQueryOptions): Promise<HaiResult<EntityDocumentResult[]>> {
      const collection = options?.collection ?? config.collection
      if (!store || !setupCollections.has(collection)) {
        return err(HaiAIError.KNOWLEDGE_NOT_SETUP, aiM('ai_knowledgeNotSetup'))
      }

      try {
        const results = await store.findByEntityName(entityName, {
          collection,
          type: options?.type,
        })

        return ok(results.map(item => ({
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
      }
      catch (error) {
        return err(HaiAIError.KNOWLEDGE_RETRIEVE_FAILED, aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), error)
      }
    },

    // ─── listEntities ───
    async listEntities(options?: EntityListOptions): Promise<HaiResult<KnowledgeEntity[]>> {
      if (!store) {
        return err(HaiAIError.KNOWLEDGE_NOT_SETUP, aiM('ai_knowledgeNotSetup'))
      }

      try {
        const rows = await store.listEntities({
          type: options?.type,
          keyword: options?.keyword,
          limit: options?.limit,
        })

        return ok(rows.map(row => ({
          id: row.id,
          name: row.name,
          type: row.type as KnowledgeEntity['type'],
          aliases: row.aliases,
          description: row.description ?? undefined,
          createdAt: row.createdAt ?? undefined,
          updatedAt: row.updatedAt ?? undefined,
        })))
      }
      catch (error) {
        return err(HaiAIError.KNOWLEDGE_RETRIEVE_FAILED, aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), error)
      }
    },

    // ─── listDocuments ───
    async listDocuments(options?: KnowledgeDocumentListOptions): Promise<HaiResult<KnowledgeDocumentInfo[]>> {
      const collection = options?.collection ?? config.collection
      if (!store || !setupCollections.has(collection)) {
        return err(HaiAIError.KNOWLEDGE_NOT_SETUP, aiM('ai_knowledgeNotSetup'))
      }

      try {
        const docs = await store.listDocuments(collection, {
          offset: options?.offset,
          limit: options?.limit,
        })

        // 查询每个文档的实体关联数
        const docIds = docs.map(d => d.documentId)
        const entityCounts = await store.listDocumentEntityCounts(docIds, collection)

        const result: KnowledgeDocumentInfo[] = docs.map(d => ({
          documentId: d.documentId,
          title: d.title ?? undefined,
          url: d.url ?? undefined,
          chunkCount: d.chunkCount,
          entityCount: entityCounts.get(d.documentId) ?? 0,
          createdAt: d.createdAt,
        }))

        return ok(result)
      }
      catch (error) {
        return err(HaiAIError.KNOWLEDGE_RETRIEVE_FAILED, aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), error)
      }
    },

    // ─── removeDocument ───
    async removeDocument(documentId: string, options?: KnowledgeDocumentRemoveOptions): Promise<HaiResult<void>> {
      const collection = options?.collection ?? config.collection
      if (!store || !setupCollections.has(collection)) {
        return err(HaiAIError.KNOWLEDGE_NOT_SETUP, aiM('ai_knowledgeNotSetup'))
      }

      try {
        // ① 查询该文档的所有 chunk ID
        const docMeta = await store.getDocument(documentId, collection)
        const chunkCount = docMeta?.chunkCount ?? 100 // 回退到大数保证覆盖

        // 生成要删除的向量 ID 列表
        const vectorIds: string[] = []
        for (let i = 0; i < chunkCount; i++) {
          vectorIds.push(`${documentId}:chunk-${i}`)
        }

        // ② 删除向量
        if (vectorIds.length > 0) {
          try {
            await store.removeVectors(collection, vectorIds)
          }
          catch (vecError) {
            logger.warn('Failed to delete some vectors', { documentId, error: vecError })
          }
        }

        // ③ 删除实体关联
        await store.removeDocumentEntityRelations(documentId, collection)

        // ④ 删除文档元数据
        await store.removeDocument(documentId, collection)

        logger.debug('Document removed', { documentId, collection })
        return ok(undefined)
      }
      catch (error) {
        return err(HaiAIError.KNOWLEDGE_INGEST_FAILED, aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }), error)
      }
    },

    /**
     * 从文件路径读取并导入文档（仅 Node.js 端可用）
     */
    async ingestFile(input: KnowledgeIngestFileInput): Promise<HaiResult<KnowledgeIngestResult>> {
      try {
        const { readFile } = await import('node:fs/promises')
        const { basename } = await import('node:path')
        const content = await readFile(input.filePath, { encoding: input.encoding ?? 'utf-8' })
        const fileName = basename(input.filePath)
        const documentId = input.documentId ?? fileName

        return this.ingest({
          documentId,
          content,
          title: input.title ?? fileName,
          url: input.filePath,
          collection: input.collection,
          metadata: input.metadata,
          enableEntityExtraction: input.enableEntityExtraction,
          cleanOptions: input.cleanOptions,
          chunkOptions: input.chunkOptions,
        })
      }
      catch (error) {
        return err(HaiAIError.KNOWLEDGE_INGEST_FAILED, aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }), error)
      }
    },

    /**
     * 批量导入文档，逐个执行 ingest()，单个失败不中断
     */
    async ingestBatch(
      inputs: KnowledgeIngestInput[],
      onProgress?: (progress: KnowledgeIngestBatchProgress) => void,
    ): Promise<HaiResult<KnowledgeIngestBatchResult>> {
      const startTime = Date.now()
      let successCount = 0
      let failureCount = 0
      const results: KnowledgeIngestBatchResult['results'] = []

      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i]
        const documentId = input.documentId ?? `batch-${i}`
        const ingestResult = await this.ingest(input)

        if (ingestResult.success) {
          successCount++
          results.push({ documentId, result: ingestResult.data })
          onProgress?.({ completed: i + 1, total: inputs.length, currentDocumentId: documentId, result: ingestResult.data })
        }
        else {
          failureCount++
          results.push({ documentId, error: ingestResult.error })
          onProgress?.({ completed: i + 1, total: inputs.length, currentDocumentId: documentId, error: ingestResult.error })
        }
      }

      return ok({ successCount, failureCount, results, duration: Date.now() - startTime })
    },
  }
}
