/**
 * @h-ai/ai — AI 服务主入口
 *
 * 提供统一的 `ai` 对象，聚合所有 AI 操作功能。
 * @module ai-main
 */

import type { Result } from '@h-ai/core'

import type { AIConfig, AIConfigInput } from './ai-config.js'
import type { AIError, AIFunctions } from './ai-types.js'
import type { ContextOperations, ContextSummary } from './context/ai-context-types.js'
import type { EmbeddingOperations } from './embedding/ai-embedding-types.js'
import type { FileOperations } from './file/ai-file-types.js'
import type { KnowledgeOperations } from './knowledge/ai-knowledge-types.js'
import type { ChatMessage, ChatRecord, LLMOperations, StreamOperations, ToolsOperations } from './llm/ai-llm-types.js'
import type { MCPOperations } from './mcp/ai-mcp-types.js'
import type { MemoryEntry, MemoryOperations } from './memory/ai-memory-types.js'
import type { RagOperations } from './rag/ai-rag-types.js'
import type { ReasoningOperations } from './reasoning/ai-reasoning-types.js'
import type { RerankOperations } from './rerank/ai-rerank-types.js'
import type { RetrievalOperations } from './retrieval/ai-retrieval-types.js'
import type { ReldbJsonOps, ReldbSql, SessionInfo, VecdbClient } from './store/ai-store-types.js'

import { core, err, ok } from '@h-ai/core'
import { datapipe } from '@h-ai/datapipe'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

import { AIConfigSchema, AIErrorCode, ContextConfigSchema, KnowledgeConfigSchema, MemoryConfigSchema } from './ai-config.js'
import { aiM } from './ai-i18n.js'
import { createContextOperations } from './context/ai-context-functions.js'
import { createEmbeddingOperations } from './embedding/ai-embedding-functions.js'
import { createFileOperations } from './file/ai-file-functions.js'
import { createKnowledgeOperations } from './knowledge/ai-knowledge-functions.js'
import { createAILLMFunctions } from './llm/ai-llm-functions.js'
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './llm/ai-llm-stream.js'
import { createToolRegistry, defineTool } from './llm/ai-llm-tool.js'
import { createAIMCPFunctions } from './mcp/ai-mcp-functions.js'
import { createMemoryOperations } from './memory/ai-memory-functions.js'
import { createRagOperations } from './rag/ai-rag-functions.js'
import { createReasoningOperations } from './reasoning/ai-reasoning-functions.js'
import { createRerankOperations } from './rerank/ai-rerank-functions.js'
import { createRetrievalOperations } from './retrieval/ai-retrieval-functions.js'
import { ReldbAIStore, VecdbAIVectorStore } from './store/ai-store-db.js'

const logger = core.logger.child({ module: 'ai', scope: 'main' })

// ─── 内部状态 ───

/** 当前配置（`null` 表示未初始化） */
let currentConfig: AIConfig | null = null
/** 当前 LLM 操作实例 */
let currentLLM: LLMOperations | null = null
/** 当前 MCP 操作实例 */
let currentMCP: MCPOperations | null = null
/** 当前 Embedding 操作实例 */
let currentEmbedding: EmbeddingOperations | null = null
/** 当前 Reasoning 操作实例 */
let currentReasoning: ReasoningOperations | null = null
/** 当前 Retrieval 操作实例 */
let currentRetrieval: RetrievalOperations | null = null
/** 当前 RAG 操作实例 */
let currentRag: RagOperations | null = null
/** 当前 Knowledge 操作实例 */
let currentKnowledge: KnowledgeOperations | null = null
/** 当前 Memory 操作实例 */
let currentMemory: MemoryOperations | null = null
/** 当前 Context 操作实例 */
let currentContext: ContextOperations | null = null
/** 当前 Rerank 操作实例 */
let currentRerank: RerankOperations | null = null
/** 当前 File 操作实例 */
let currentFile: FileOperations | null = null

// ─── 未初始化占位 ───

/** 创建未初始化错误工具（统一的 NOT_INITIALIZED 响应） */
const notInitialized = core.module.createNotInitializedKit<AIError>(
  AIErrorCode.NOT_INITIALIZED,
  () => aiM('ai_notInitialized'),
)

/**
 * LLM 未初始化占位
 *
 * 异步方法返回 NOT_INITIALIZED Result。
 * chatStream 是 async generator，无法返回 Result，
 * 只能在迭代时抛出异常通知调用方。
 */
const notInitializedLLM: LLMOperations = {
  chat: () => Promise.resolve(notInitialized.result()),
  async* chatStream() {
    throw notInitialized.error()
  },
  listModels: () => Promise.resolve(notInitialized.result()),
  getHistory: () => Promise.resolve(notInitialized.result()),
  listSessions: () => Promise.resolve(notInitialized.result()),
}

/** MCP 未初始化占位：所有方法返回 NOT_INITIALIZED 错误 */
const notInitializedMCP: MCPOperations = {
  registerTool: () => notInitialized.result(),
  registerResource: () => notInitialized.result(),
  registerPrompt: () => notInitialized.result(),
  callTool: () => Promise.resolve(notInitialized.result()),
  readResource: () => Promise.resolve(notInitialized.result()),
  getPrompt: () => Promise.resolve(notInitialized.result()),
}

/** Embedding 未初始化占位 */
const notInitializedEmbedding: EmbeddingOperations = {
  embed: () => Promise.resolve(notInitialized.result()),
  embedText: () => Promise.resolve(notInitialized.result()),
  embedBatch: () => Promise.resolve(notInitialized.result()),
}

/** Reasoning 未初始化占位 */
const notInitializedReasoning: ReasoningOperations = {
  run: () => Promise.resolve(notInitialized.result()),
}

/** Retrieval 未初始化占位 */
const notInitializedRetrieval: RetrievalOperations = {
  addSource: () => notInitialized.result(),
  removeSource: () => notInitialized.result(),
  listSources: () => [],
  retrieve: () => Promise.resolve(notInitialized.result()),
}

/** RAG 未初始化占位 */
const notInitializedRag: RagOperations = {
  query: () => Promise.resolve(notInitialized.result()),
}

/** Knowledge 未初始化占位 */
const notInitializedKnowledge: KnowledgeOperations = {
  setup: () => Promise.resolve(notInitialized.result()),
  ingest: () => Promise.resolve(notInitialized.result()),
  retrieve: () => Promise.resolve(notInitialized.result()),
  ask: () => Promise.resolve(notInitialized.result()),
  findByEntity: () => Promise.resolve(notInitialized.result()),
  listEntities: () => Promise.resolve(notInitialized.result()),
}

/** Memory 未初始化占位 */
const notInitializedMemory: MemoryOperations = {
  extract: () => Promise.resolve(notInitialized.result()),
  add: () => Promise.resolve(notInitialized.result()),
  get: () => Promise.resolve(notInitialized.result()),
  recall: () => Promise.resolve(notInitialized.result()),
  injectMemories: () => Promise.resolve(notInitialized.result()),
  remove: () => Promise.resolve(notInitialized.result()),
  list: () => Promise.resolve(notInitialized.result()),
  listPage: () => Promise.resolve(notInitialized.result()),
  clear: () => Promise.resolve(notInitialized.result()),
}

/** Context 未初始化占位 */
const notInitializedContext: ContextOperations = {
  tryCompress: () => Promise.resolve(notInitialized.result()),
  summarize: () => Promise.resolve(notInitialized.result()),
  estimateTokens: () => notInitialized.result(),
  createManager: () => notInitialized.result(),
  restoreManager: () => Promise.resolve(notInitialized.result()),
  listSessions: () => Promise.resolve(notInitialized.result()),
}

/** Rerank 未初始化占位 */
const notInitializedRerank: RerankOperations = {
  rerank: () => Promise.resolve(notInitialized.result()),
  rerankTexts: () => Promise.resolve(notInitialized.result()),
}

/** File 未初始化占位 */
const notInitializedFile: FileOperations = {
  parse: () => Promise.resolve(notInitialized.result()),
  parseText: () => Promise.resolve(notInitialized.result()),
}

// ─── 纯函数操作（不依赖初始化） ───

const toolsOperations: ToolsOperations = {
  define: defineTool,
  createRegistry: createToolRegistry,
}

const streamOperations: StreamOperations = {
  createProcessor: createStreamProcessor,
  collect: collectStream,
  createSSEDecoder,
  encodeSSE,
}

// ─── 服务对象 ───

/**
 * AI 服务对象，统一的 AI 访问入口
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 初始化
 * ai.init({ llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_OPENAI_API_KEY } })
 *
 * // LLM 调用
 * const result = await ai.llm.chat({
 *   messages: [{ role: 'user', content: '你好' }],
 * })
 *
 * // 关闭
 * ai.close()
 * ```
 */
export const ai: AIFunctions = {
  init(config?: AIConfigInput): Result<void, AIError> {
    // 关闭旧实例
    if (currentConfig) {
      logger.warn('AI module is already initialized, reinitializing')
      ai.close()
    }

    logger.info('Initializing AI module')

    const parseResult = AIConfigSchema.safeParse(config ?? {})
    if (!parseResult.success) {
      logger.error('AI config validation failed', { error: parseResult.error.message })
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_configError', { params: { error: parseResult.error.message } }),
        cause: parseResult.error,
      })
    }
    const parsed = parseResult.data

    try {
      // 注入 reldb / vecdb 存储依赖（必选）
      if (!reldb.isInitialized || !vecdb.isInitialized) {
        const missing = [!reldb.isInitialized && 'reldb', !vecdb.isInitialized && 'vecdb'].filter(Boolean).join(', ')
        return err({
          code: AIErrorCode.CONFIGURATION_ERROR,
          message: aiM('ai_configError', { params: { error: `${missing} not initialized. reldb and vecdb are required.` } }),
        })
      }
      const _sql = reldb.sql as unknown as ReldbSql
      const _jsonOps = reldb.json as unknown as ReldbJsonOps
      const _vecdb = vecdb as unknown as VecdbClient

      // 创建 LLM 子功能（含对话记录存储）
      const chatRecordStore = new ReldbAIStore<ChatRecord>(_sql, 'ai_chat_records', _jsonOps)
      const sessionStore = new ReldbAIStore<SessionInfo>(_sql, 'ai_sessions', _jsonOps)
      const llmFunctions = createAILLMFunctions(parsed, { recordStore: chatRecordStore, sessionStore })
      currentLLM = llmFunctions.llm

      // 创建 MCP 子功能
      currentMCP = createAIMCPFunctions({ config: parsed })

      // 创建 Embedding 子功能
      currentEmbedding = createEmbeddingOperations(parsed)

      // 创建 Reasoning 子功能（依赖 LLM）
      currentReasoning = createReasoningOperations(parsed, currentLLM)

      // 创建 Retrieval 子功能（依赖 Embedding）
      currentRetrieval = createRetrievalOperations(currentEmbedding)

      // 创建 RAG 子功能（依赖 LLM + Retrieval）
      currentRag = createRagOperations(currentLLM, currentRetrieval)

      // 创建 Knowledge 子功能（依赖 LLM + Embedding + vecdb + reldb + datapipe）
      const knowledgeConfig = parsed.knowledge ?? {}
      const knowledgeParsed = KnowledgeConfigSchema.parse(knowledgeConfig)

      currentKnowledge = createKnowledgeOperations(
        knowledgeParsed,
        currentLLM,
        currentEmbedding,
        async () => vecdb.isInitialized ? vecdb : null,
        async () => reldb.isInitialized ? reldb.sql : null,
        async () => datapipe as unknown as { clean: (text: string, options?: Record<string, unknown>) => Result<string, unknown>, chunk: (text: string, options: Record<string, unknown>) => Result<Array<{ index: number, content: string, metadata?: Record<string, unknown> }>, unknown> },
      )

      // 创建 Memory 子功能（依赖 LLM + Embedding + Store）
      const memoryConfig = parsed.memory ?? {}
      const memoryParsed = MemoryConfigSchema.parse(memoryConfig)
      const memoryStore = new ReldbAIStore<MemoryEntry>(_sql, 'ai_memory', _jsonOps)
      const memoryVectorStore = new VecdbAIVectorStore(_vecdb, 'ai_memory_vectors')
      currentMemory = createMemoryOperations(memoryParsed, currentLLM, currentEmbedding, memoryStore, memoryVectorStore)

      // 创建 Context 子功能（依赖 LLM + Store）
      const contextConfig = parsed.context ?? {}
      const contextParsed = ContextConfigSchema.parse(contextConfig)
      const contextStore = new ReldbAIStore<{ messages: ChatMessage[], summaries: ContextSummary[], updatedAt: number }>(_sql, 'ai_context', _jsonOps)
      currentContext = createContextOperations(contextParsed, currentLLM, parsed.llm?.maxTokens ?? 4096, contextStore, sessionStore)

      // 创建 Rerank 子功能
      currentRerank = createRerankOperations(parsed)

      // 创建 File 子功能（依赖 LLM）
      currentFile = createFileOperations(parsed, currentLLM)

      currentConfig = parsed
      logger.info('AI module initialized', { model: parsed.llm?.model })
      return ok(undefined)
    }
    catch (error) {
      logger.error('AI module initialization failed', { error })
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_initFailed', {
          params: { error: String(error) },
        }),
        cause: error,
      })
    }
  },

  get llm(): LLMOperations { return currentLLM ?? notInitializedLLM },
  get mcp(): MCPOperations { return currentMCP ?? notInitializedMCP },
  get tools(): ToolsOperations { return toolsOperations },
  get stream(): StreamOperations { return streamOperations },
  get embedding(): EmbeddingOperations { return currentEmbedding ?? notInitializedEmbedding },
  get reasoning(): ReasoningOperations { return currentReasoning ?? notInitializedReasoning },
  get retrieval(): RetrievalOperations { return currentRetrieval ?? notInitializedRetrieval },
  get rag(): RagOperations { return currentRag ?? notInitializedRag },
  get knowledge(): KnowledgeOperations { return currentKnowledge ?? notInitializedKnowledge },
  get memory(): MemoryOperations { return currentMemory ?? notInitializedMemory },
  get context(): ContextOperations { return currentContext ?? notInitializedContext },
  get rerank(): RerankOperations { return currentRerank ?? notInitializedRerank },
  get file(): FileOperations { return currentFile ?? notInitializedFile },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  close(): void {
    if (!currentConfig) {
      logger.info('AI module already closed, skipping')
      return
    }

    logger.info('Closing AI module')

    currentLLM = null
    currentMCP = null
    currentEmbedding = null
    currentReasoning = null
    currentRetrieval = null
    currentRag = null
    currentKnowledge = null
    currentMemory = null
    currentContext = null
    currentRerank = null
    currentFile = null
    currentConfig = null

    logger.info('AI module closed')
  },
}
