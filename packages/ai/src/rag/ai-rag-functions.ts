/**
 * @h-ai/ai — RAG 子功能实现
 *
 * 组合 Retrieval + LLM 实现检索增强生成。
 * @module ai-rag-functions
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { Citation, RetrievalOperations } from '../retrieval/ai-retrieval-types.js'
import type {
  RagContextItem,
  RagOperations,
  RagOptions,
  RagResult,
  RagStreamEvent,
} from './ai-rag-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'rag' })

// ─── 默认提示词 ───

const DEFAULT_RAG_SYSTEM_PROMPT = `You are a helpful assistant. Answer the user's question based on the provided context.
If the context doesn't contain relevant information, say so honestly.
When using information from the context, cite the source by its number, e.g. [1] or [2].`

/**
 * 默认上下文格式化：将检索结果格式化为编号列表，含标题和 URL、便于 LLM 注明信源
 */
function defaultFormatContext(items: RagContextItem[]): string {
  if (items.length === 0)
    return 'No relevant context found.'

  return items
    .map((item, i) => {
      const sourceLabel = item.citation?.title ?? item.citation?.url ?? item.sourceId
      const urlPart = item.citation?.url ? ` (${item.citation.url})` : ''
      return `[${i + 1}] Source: ${sourceLabel}${urlPart}\n${item.content}`
    })
    .join('\n\n')
}

/**
 * 创建 RAG 操作接口
 *
 * @param llm - LLM 操作（用于生成回答）
 * @param retrieval - Retrieval 操作（用于检索上下文）
 * @returns RagOperations 实例
 */
export function createRagOperations(llm: LLMOperations, retrieval: RetrievalOperations): RagOperations {
  return {
    /**
     * 执行 RAG 查询
     *
     * 流程：
     * 1. 向量检索相关文档（`retrieval.retrieve`）
     * 2. 格式化为编号列表上下文（可通过 `options.formatContext` 自定义）
     * 3. 组装系统提示 + 上下文 → 调用 LLM 生成回答
     *
     * @param query - 用户查询文本
     * @param options - 可选配置（sources / topK / minScore / systemPrompt / formatContext / history 等）
     * @returns `ok(RagResult)` 含 answer、context 列表与引用信源；检索或生成失败时返回错误
     *
     * @example
     * ```ts
     * const result = await rag.query('什么是 vecdb？')
     * if (result.success) console.log(result.data.answer)
     * ```
     */
    async query(query: string, options?: RagOptions): Promise<Result<RagResult, AIError>> {
      logger.trace('Starting RAG query', { query: query.slice(0, 100) })

      try {
        // 阶段1：检索相关上下文
        const retrieveResult = await retrieval.retrieve({
          query,
          sources: options?.sources,
          topK: options?.topK ?? 5,
          minScore: options?.minScore,
          enableRerank: options?.enableRerank,
          rerankModel: options?.rerankModel,
        })

        if (!retrieveResult.success) {
          return err({
            code: AIErrorCode.RAG_CONTEXT_BUILD_FAILED,
            message: aiM('ai_internalError', { params: { error: 'Failed to retrieve context' } }),
            cause: retrieveResult.error,
          })
        }

        // 构建上下文
        const contextItems: RagContextItem[] = retrieveResult.data.items.map(item => ({
          content: item.content,
          score: item.score,
          sourceId: item.sourceId,
          metadata: item.metadata,
          citation: item.citation,
        }))

        // 格式化上下文
        const formatFn = options?.formatContext ?? defaultFormatContext
        const contextText = formatFn(contextItems)

        // 阶段2：构建 LLM 消息
        const systemPrompt = options?.systemPrompt ?? DEFAULT_RAG_SYSTEM_PROMPT
        const systemContent = `${systemPrompt}\n\n--- Context ---\n${contextText}\n--- End Context ---`

        const messages: ChatMessage[] = [
          { role: 'system', content: systemContent },
        ]

        // 添加消息历史（多轮对话）
        if (options?.messages) {
          messages.push(...options.messages)
        }

        // 添加当前查询
        messages.push({ role: 'user', content: query })

        // 阶段3：调用 LLM 生成回答
        const chatResult = await llm.chat({
          model: options?.model,
          messages,
          temperature: options?.temperature,
          objectId: options?.objectId,
          sessionId: options?.sessionId,
          enablePersist: options?.enablePersist,
        })

        if (!chatResult.success) {
          return err({
            code: AIErrorCode.RAG_FAILED,
            message: aiM('ai_internalError', { params: { error: 'LLM generation failed' } }),
            cause: chatResult.error,
          })
        }

        const choice = chatResult.data.choices[0]
        const answer = choice?.message?.content ?? ''

        logger.trace('RAG query completed', {
          contextCount: contextItems.length,
          model: chatResult.data.model,
        })

        // 从上下文项中去重聚合信源引用
        const citationMap = new Map<string, Citation>()
        for (const ctx of contextItems) {
          if (ctx.citation) {
            const key = ctx.citation.documentId ?? ctx.citation.chunkId ?? ctx.citation.url ?? `${ctx.sourceId}:${ctx.content.slice(0, 50)}`
            if (!citationMap.has(key)) {
              citationMap.set(key, ctx.citation)
            }
          }
        }
        const citations = Array.from(citationMap.values())

        return ok({
          answer,
          context: contextItems,
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
      }
      catch (error) {
        logger.error('RAG query failed', { error })
        return err({
          code: AIErrorCode.RAG_FAILED,
          message: aiM('ai_internalError', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 流式 RAG 查询：先产出 context，再逐 chunk 产出 delta，最后 done
     */
    async* queryStream(query: string, options?: RagOptions): AsyncIterable<RagStreamEvent> {
      logger.trace('Starting RAG stream', { query: query.slice(0, 100) })

      // 阶段1：检索
      const retrieveResult = await retrieval.retrieve({
        query,
        sources: options?.sources,
        topK: options?.topK ?? 5,
        minScore: options?.minScore,
        enableRerank: options?.enableRerank,
        rerankModel: options?.rerankModel,
      })

      if (!retrieveResult.success) {
        throw new Error(`RAG context build failed: ${String(retrieveResult.error)}`)
      }

      const contextItems: RagContextItem[] = retrieveResult.data.items.map(item => ({
        content: item.content,
        score: item.score,
        sourceId: item.sourceId,
        metadata: item.metadata,
        citation: item.citation,
      }))

      // 去重信源
      const citationMap = new Map<string, Citation>()
      for (const ctx of contextItems) {
        if (ctx.citation) {
          const key = ctx.citation.documentId ?? ctx.citation.chunkId ?? ctx.citation.url ?? `${ctx.sourceId}:${ctx.content.slice(0, 50)}`
          if (!citationMap.has(key)) {
            citationMap.set(key, ctx.citation)
          }
        }
      }
      const citations = Array.from(citationMap.values())

      // 产出上下文事件
      yield { type: 'context', items: contextItems, citations }

      // 阶段2：流式 LLM 生成
      const formatFn = options?.formatContext ?? defaultFormatContext
      const contextText = formatFn(contextItems)
      const systemPrompt = options?.systemPrompt ?? DEFAULT_RAG_SYSTEM_PROMPT
      const systemContent = `${systemPrompt}\n\n--- Context ---\n${contextText}\n--- End Context ---`

      const messages: ChatMessage[] = [
        { role: 'system', content: systemContent },
      ]
      if (options?.messages) {
        messages.push(...options.messages)
      }
      messages.push({ role: 'user', content: query })

      const stream = llm.chatStream({
        model: options?.model,
        messages,
        temperature: options?.temperature,
        objectId: options?.objectId,
        sessionId: options?.sessionId,
        enablePersist: options?.enablePersist,
      })

      let fullAnswer = ''
      let model = ''
      let usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | undefined

      for await (const chunk of stream) {
        if (!model && chunk.model)
          model = chunk.model
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          fullAnswer += delta
          yield { type: 'delta', text: delta }
        }
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
          }
        }
      }

      yield { type: 'done', answer: fullAnswer, model, usage }
    },
  }
}
