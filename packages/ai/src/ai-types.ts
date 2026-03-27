/**
 * @h-ai/ai — 公共类型定义
 *
 * 聚合导出模块根类型和子功能类型，供外部通过 `@h-ai/ai` 一站式引入。
 * @module ai-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { A2AOperations } from './a2a/ai-a2a-types.js'

import type { AIConfig, AIConfigInput } from './ai-config.js'
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
import type { AIStoreProvider } from './store/ai-store-types.js'
import type { SummaryOperations } from './summary/ai-summary-types.js'
import type { TokenOperations } from './token/ai-token-types.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

/**
 * AI 错误信息映射（错误码:HTTP状态码）。
 *
 * 错误码采用 3 位数字格式（000-999），HTTP 状态码遵循标准 HTTP 规范。
 * 完整错误码将自动生成为：`hai:ai:NNN`
 */
const AIErrorInfo = {
  // 通用 (000-009)
  INTERNAL_ERROR: '000:500',

  // 初始化 (010-019)
  NOT_INITIALIZED: '010:500',
  CONFIGURATION_ERROR: '011:500',
  INIT_IN_PROGRESS: '012:500',
  RERANK_API_ERROR: '020:502',
  RERANK_INVALID_REQUEST: '021:400',

  // LLM (100-199)
  API_ERROR: '100:502',
  INVALID_REQUEST: '101:400',
  RATE_LIMITED: '102:429',
  TIMEOUT: '103:504',
  MODEL_NOT_FOUND: '104:404',
  CONTEXT_LENGTH_EXCEEDED: '105:400',
  LLM_RECORD_FAILED: '106:500',
  LLM_HISTORY_FAILED: '107:500',

  // MCP (200-299)
  MCP_CONNECTION_ERROR: '200:502',
  MCP_PROTOCOL_ERROR: '201:502',
  MCP_TOOL_ERROR: '202:500',
  MCP_RESOURCE_ERROR: '203:500',
  MCP_SERVER_ERROR: '204:502',

  // Embedding (300-399)
  EMBEDDING_API_ERROR: '300:502',
  EMBEDDING_MODEL_NOT_FOUND: '301:404',
  EMBEDDING_INPUT_TOO_LONG: '302:400',

  // 工具 (400-499)
  TOOL_NOT_FOUND: '400:404',
  TOOL_VALIDATION_FAILED: '401:400',
  TOOL_EXECUTION_FAILED: '402:500',
  TOOL_TIMEOUT: '403:504',

  // Reasoning (500-599)
  REASONING_FAILED: '500:500',
  REASONING_MAX_ROUNDS: '501:400',
  REASONING_STRATEGY_NOT_FOUND: '502:404',

  // Retrieval (600-699)
  RETRIEVAL_FAILED: '600:500',
  RETRIEVAL_SOURCE_NOT_FOUND: '601:404',

  // RAG (700-799)
  RAG_FAILED: '700:500',
  RAG_CONTEXT_BUILD_FAILED: '701:500',

  // Knowledge (800-899)
  KNOWLEDGE_SETUP_FAILED: '800:500',
  KNOWLEDGE_INGEST_FAILED: '801:500',
  KNOWLEDGE_RETRIEVE_FAILED: '802:500',
  KNOWLEDGE_ENTITY_EXTRACT_FAILED: '803:500',
  KNOWLEDGE_NOT_SETUP: '804:500',
  KNOWLEDGE_COLLECTION_NOT_FOUND: '805:404',

  // Memory (900-949)
  MEMORY_EXTRACT_FAILED: '900:500',
  MEMORY_STORE_FAILED: '901:500',
  MEMORY_RECALL_FAILED: '902:500',
  MEMORY_NOT_FOUND: '903:404',
  MEMORY_ENRICH_FAILED: '904:500',

  // File (030-049)
  FILE_PARSE_FAILED: '030:500',
  FILE_UNSUPPORTED_FORMAT: '031:400',
  FILE_OCR_FAILED: '032:500',
  FILE_INVALID_CONTENT: '033:400',

  // Context (950-999)
  CONTEXT_COMPRESS_FAILED: '950:500',
  CONTEXT_SUMMARIZE_FAILED: '951:500',
  CONTEXT_TOKEN_ESTIMATE_FAILED: '952:500',
  CONTEXT_BUDGET_EXCEEDED: '953:400',

  // Store (960-969)
  STORE_FAILED: '960:500',
  STORE_NOT_AVAILABLE: '961:503',

  // Session (970-979)
  SESSION_NOT_FOUND: '970:404',
  SESSION_FAILED: '971:500',

  // A2A (980-999)
  A2A_NOT_CONFIGURED: '980:500',
  A2A_HANDLE_FAILED: '981:500',
  A2A_REMOTE_CALL_FAILED: '982:502',
  A2A_AUTH_FAILED: '983:401',
  A2A_LIST_MESSAGES_FAILED: '984:500',
} as const satisfies ErrorInfo

/**
 * AI 模块标准错误定义对象。
 *
 * 通过 `HaiAIError.ERROR_CODE_NAME` 访问具体错误定义，如：
 * ```ts
 * const def = HaiAIError.NOT_INITIALIZED
 * // => { code: 'hai:ai:010', httpStatus: 500, system: 'hai', module: 'ai' }
 * ```
 */
export const HaiAIError = core.error.buildHaiErrorsDef('ai', AIErrorInfo)

// ─── 初始化选项 ───

/**
 * AI 初始化运行时选项
 *
 * 用于传入运行时对象（如自定义 StoreProvider），
 * 这些对象无法通过 Zod 配置 Schema 传递。
 */
export interface AIInitOptions {
  /**
   * 自定义存储 Provider
   *
   * 提供后 AI 模块将使用此 Provider 而非默认的 reldb+vecdb 实现，
   * 此时不需要提前初始化 reldb/vecdb。
   */
  storeProvider?: AIStoreProvider
}

// ─── AIFunctions 接口 ───

/**
 * AI 服务接口（通过 `ai` 对象访问）
 *
 * 所有 AI 功能的统一入口，需先调用 `init()` 初始化后才能使用 `llm`、`mcp` 操作。
 * `tools` 和 `stream` 为纯函数，无需初始化即可使用。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * await ai.init({ llm: { model: 'gpt-4o-mini' } })
 * const result = await ai.llm.chat({ messages: [{ role: 'user', content: '你好' }] })
 * ai.close()
 * ```
 */
export interface AIFunctions {
  /**
   * 初始化 AI 服务
   *
   * 使用 Zod Schema 校验配置，失败返回 `CONFIGURATION_ERROR`。
   * 重复调用会先关闭旧实例再重新初始化。
   *
   * @param config - AI 配置（可选，默认使用空对象并应用 Schema 默认值）
   * @param options - 运行时选项（可选，用于传入自定义 StoreProvider 等运行时对象）
   * @returns 成功返回 `ok(undefined)`；配置校验失败返回 `err(HaiAIError.CONFIGURATION_ERROR)`
   */
  init: (config?: AIConfigInput, options?: AIInitOptions) => Promise<HaiResult<void>>
  /**
   * 关闭 AI 服务，释放内部状态
   *
   * 关闭后 `llm`、`mcp` 操作将返回 `NOT_INITIALIZED` 错误。
   * 重复关闭不会报错。
   */
  close: () => void
  /** 当前配置（未初始化时为 `null`） */
  readonly config: AIConfig | null
  /** 是否已初始化（`init()` 成功后为 `true`，`close()` 后为 `false`） */
  readonly isInitialized: boolean
  /** LLM 操作（聊天、流式、模型列表），需要先调用 `init()` */
  readonly llm: LLMOperations
  /** MCP 操作（工具/资源/提示词注册与调用），需要先调用 `init()` */
  readonly mcp: MCPOperations
  /** 工具操作（定义工具与注册表），纯函数，无需初始化 */
  readonly tools: ToolsOperations
  /** 流处理操作（流处理器、SSE 编解码），纯函数，无需初始化 */
  readonly stream: StreamOperations
  /** Embedding 操作（向量嵌入），需要先调用 `init()` */
  readonly embedding: EmbeddingOperations
  /** 推理操作（ReAct / CoT / Plan-Execute），需要先调用 `init()` */
  readonly reasoning: ReasoningOperations
  /** 检索操作（向量检索），需要先调用 `init()` */
  readonly retrieval: RetrievalOperations
  /** RAG 操作（检索增强生成），需要先调用 `init()` */
  readonly rag: RagOperations
  /** Knowledge 操作（知识库管理与检索），需要先调用 `init()` 和 `knowledge.setup()` */
  readonly knowledge: KnowledgeOperations
  /** Memory 操作（记忆提取、存储、检索、注入），需要先调用 `init()` */
  readonly memory: MemoryOperations
  /** Token 操作（Token 估算），需要先调用 `init()` */
  readonly token: TokenOperations
  /** Summary 操作（消息摘要生成），需要先调用 `init()` */
  readonly summary: SummaryOperations
  /** Compress 操作（上下文压缩），需要先调用 `init()` */
  readonly compress: CompressOperations
  /** Context 操作（有状态上下文管理器，编排 LLM + Memory + RAG + Reasoning），需要先调用 `init()` */
  readonly context: ContextOperations
  /** Rerank 操作（文档重排序），需要先调用 `init()` */
  readonly rerank: RerankOperations
  /** File 操作（文件内容解析），需要先调用 `init()` */
  readonly file: FileOperations
  /** A2A 操作（Agent-to-Agent 协议），需要先调用 `init()` 并配置 `a2a` */
  readonly a2a: A2AOperations
}
