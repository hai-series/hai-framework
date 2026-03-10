/**
 * @h-ai/ai — AI 服务主入口
 *
 * 提供统一的 `ai` 对象，聚合所有 AI 操作功能。
 * @module ai-main
 */

import type { Result } from '@h-ai/core'

import type { AIConfig, AIConfigInput } from './ai-config.js'
import type { AIError, AIFunctions } from './ai-types.js'
import type { CompressOperations } from './compress/ai-compress-types.js'
import type { ContextOperations } from './context/ai-context-types.js'
import type { EmbeddingOperations } from './embedding/ai-embedding-types.js'
import type { FileOperations } from './file/ai-file-types.js'
import type { KnowledgeOperations } from './knowledge/ai-knowledge-types.js'
import type { LLMOperations, StreamOperations, ToolsOperations } from './llm/ai-llm-types.js'
import type { MCPOperations } from './mcp/ai-mcp-types.js'
import type { MemoryOperations } from './memory/ai-memory-types.js'
import type { RagOperations } from './rag/ai-rag-types.js'
import type { ReasoningOperations } from './reasoning/ai-reasoning-types.js'
import type { RerankOperations } from './rerank/ai-rerank-types.js'
import type { RetrievalOperations } from './retrieval/ai-retrieval-types.js'
import type { SummaryOperations } from './summary/ai-summary-types.js'
import type { TokenOperations } from './token/ai-token-types.js'

import { core, err, ok } from '@h-ai/core'
import { datapipe } from '@h-ai/datapipe'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

import { AIConfigSchema, AIErrorCode } from './ai-config.js'
import { createAISubsystems } from './ai-functions.js'
import { aiM } from './ai-i18n.js'
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './llm/ai-llm-stream.js'
import { createToolRegistry, defineTool } from './llm/ai-llm-tool.js'

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
/** 当前 Token 操作实例 */
let currentToken: TokenOperations | null = null
/** 当前 Summary 操作实例 */
let currentSummary: SummaryOperations | null = null
/** 当前 Compress 操作实例 */
let currentCompress: CompressOperations | null = null
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
  ask: () => Promise.resolve(notInitialized.result()),
  async* askStream() {
    throw notInitialized.error()
  },
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
  async* runStream() { throw notInitialized.error() },
}

/** Retrieval 未初始化占位 */
const notInitializedRetrieval: RetrievalOperations = {
  addSource: () => Promise.resolve(notInitialized.result()),
  removeSource: () => Promise.resolve(notInitialized.result()),
  listSources: () => Promise.resolve([]),
  retrieve: () => Promise.resolve(notInitialized.result()),
}

/** RAG 未初始化占位 */
const notInitializedRag: RagOperations = {
  query: () => Promise.resolve(notInitialized.result()),
  async* queryStream() { throw notInitialized.error() },
}

/** Knowledge 未初始化占位 */
const notInitializedKnowledge: KnowledgeOperations = {
  setup: () => Promise.resolve(notInitialized.result()),
  ingest: () => Promise.resolve(notInitialized.result()),
  retrieve: () => Promise.resolve(notInitialized.result()),
  ask: () => Promise.resolve(notInitialized.result()),
  findByEntity: () => Promise.resolve(notInitialized.result()),
  listEntities: () => Promise.resolve(notInitialized.result()),
  listDocuments: () => Promise.resolve(notInitialized.result()),
  removeDocument: () => Promise.resolve(notInitialized.result()),
  ingestFile: () => Promise.resolve(notInitialized.result()),
  ingestBatch: () => Promise.resolve(notInitialized.result()),
}

/** Memory 未初始化占位 */
const notInitializedMemory: MemoryOperations = {
  extract: () => Promise.resolve(notInitialized.result()),
  add: () => Promise.resolve(notInitialized.result()),
  update: () => Promise.resolve(notInitialized.result()),
  get: () => Promise.resolve(notInitialized.result()),
  recall: () => Promise.resolve(notInitialized.result()),
  injectMemories: () => Promise.resolve(notInitialized.result()),
  remove: () => Promise.resolve(notInitialized.result()),
  list: () => Promise.resolve(notInitialized.result()),
  listPage: () => Promise.resolve(notInitialized.result()),
  clear: () => Promise.resolve(notInitialized.result()),
}

/** Token 未初始化占位 */
const notInitializedToken: TokenOperations = {
  estimateText: () => 0,
  estimateMessages: () => 0,
}

/** Summary 未初始化占位 */
const notInitializedSummary: SummaryOperations = {
  generate: () => Promise.resolve(notInitialized.result()),
  summarize: () => Promise.resolve(notInitialized.result()),
}

/** Compress 未初始化占位 */
const notInitializedCompress: CompressOperations = {
  tryCompress: () => Promise.resolve(notInitialized.result()),
}

/** Context 未初始化占位 */
const notInitializedContext: ContextOperations = {
  createManager: () => notInitialized.result(),
  restoreManager: () => Promise.resolve(notInitialized.result()),
  listSessions: () => Promise.resolve(notInitialized.result()),
  renameSession: () => Promise.resolve(notInitialized.result()),
  removeSession: () => Promise.resolve(notInitialized.result()),
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

// ─── 内部辅助 ───

/** 重置所有子功能引用为 null（用于 close 和 init 失败清理） */
function resetAllState(): void {
  currentLLM = null
  currentMCP = null
  currentEmbedding = null
  currentReasoning = null
  currentRetrieval = null
  currentRag = null
  currentKnowledge = null
  currentMemory = null
  currentToken = null
  currentSummary = null
  currentCompress = null
  currentContext = null
  currentRerank = null
  currentFile = null
  currentConfig = null
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

      // 委托 ai-functions 组装所有子功能
      const subs = createAISubsystems(parsed, {
        sql: reldb.sql,
        jsonOps: reldb.json,
        dbType: reldb.config?.type,
        vecdb,
        datapipe,
      })

      currentLLM = subs.llm
      currentMCP = subs.mcp
      currentEmbedding = subs.embedding
      currentReasoning = subs.reasoning
      currentRerank = subs.rerank
      currentRetrieval = subs.retrieval
      currentRag = subs.rag
      currentKnowledge = subs.knowledge
      currentMemory = subs.memory
      currentToken = subs.token
      currentSummary = subs.summary
      currentCompress = subs.compress
      currentContext = subs.context
      currentFile = subs.file

      currentConfig = parsed
      logger.info('AI module initialized', { model: parsed.llm?.model })
      return ok(undefined)
    }
    catch (error) {
      // 清理部分赋值的子功能引用，避免 isInitialized=false 但 getter 返回无效实例
      resetAllState()
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
  get token(): TokenOperations { return currentToken ?? notInitializedToken },
  get summary(): SummaryOperations { return currentSummary ?? notInitializedSummary },
  get compress(): CompressOperations { return currentCompress ?? notInitializedCompress },
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
    resetAllState()
    logger.info('AI module closed')
  },
}
