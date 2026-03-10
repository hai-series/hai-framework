/**
 * @h-ai/ai — 公共类型定义
 *
 * 聚合导出模块根类型和子功能类型，供外部通过 `@h-ai/ai` 一站式引入。
 * @module ai-types
 */

import type { Result } from '@h-ai/core'

import type { AIConfig, AIConfigInput, AIErrorCodeType } from './ai-config.js'
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

// ─── 错误类型 ───

/** AI 错误接口，所有 AI 操作的错误统一遵循此结构 */
export interface AIError {
  /** 错误码（数值，参见 AIErrorCode） */
  code: AIErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
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
 * ai.init({ llm: { model: 'gpt-4o-mini' } })
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
   * @returns 成功返回 `ok(undefined)`；配置校验失败返回 `err(AIError)`
   */
  init: (config?: AIConfigInput) => Result<void, AIError>
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
}

// ─── 子功能类型 re-export ───

// ─── Compress 类型 re-export ───

export type {
  CompressionStrategy,
  CompressOperations,
  CompressOptions,
  CompressResult,
} from './compress/ai-compress-types.js'
export { CompressionStrategySchema } from './compress/ai-compress-types.js'

// ─── Context 类型 re-export ───

export type {
  ContextChatOptions,
  ContextChatResult,
  ContextDeps,
  ContextManager,
  ContextManagerOptions,
  ContextOperations,
  ContextStreamEvent,
} from './context/ai-context-types.js'

// ─── Embedding 类型 re-export ───

export type {
  EmbeddingItem,
  EmbeddingOperations,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from './embedding/ai-embedding-types.js'

// ─── File 类型 re-export ───

export type {
  FileOperations,
  FileParseMethod,
  FileParseOptions,
  FileParseRequest,
  FileParseResult,
} from './file/ai-file-types.js'

// ─── Knowledge 类型 re-export ───

export type {
  EntityDocumentRelation,
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
} from './knowledge/ai-knowledge-types.js'

// ─── LLM 类型 re-export ───

export type {
  AssistantMessage,
  ChatCompletionChoice,
  ChatCompletionChunk,
  ChatCompletionDelta,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatHistoryOptions,
  ChatMessage,
  ChatRecord,
  DefineToolOptions,
  ImageContent,
  LLMOperations,
  LLMProvider,
  MessageContent,
  MessageRole,
  SSEDecoder,
  SSEEvent,
  StreamOperations,
  StreamProcessor,
  StreamResult,
  SystemMessage,
  TextContent,
  TokenUsage,
  Tool,
  ToolCall,
  ToolDefinition,
  ToolError,
  ToolErrorType,
  ToolMessage,
  ToolRegistryOperations,
  ToolsOperations,
  UserMessage,
} from './llm/ai-llm-types.js'

// ─── MCP 类型 re-export ───

export type {
  MCPContext,
  MCPOperations,
  MCPPrompt,
  MCPPromptArgument,
  MCPPromptContent,
  MCPPromptMessage,
  MCPProvider,
  MCPResource,
  MCPResourceContent,
  McpServerOptions,
  MCPToolDefinition,
  MCPToolHandler,
} from './mcp/ai-mcp-types.js'

// ─── Memory 类型 re-export ───

export type {
  MemoryClearOptions,
  MemoryEntry,
  MemoryEntryInput,
  MemoryExtractOptions,
  MemoryInjectionOptions,
  MemoryListOptions,
  MemoryListPageOptions,
  MemoryOperations,
  MemoryRecallOptions,
} from './memory/ai-memory-types.js'

// ─── RAG 类型 re-export ───

export type {
  RagContextItem,
  RagOperations,
  RagOptions,
  RagResult,
} from './rag/ai-rag-types.js'

// ─── Reasoning 类型 re-export ───

export type {
  ReasoningOperations,
  ReasoningOptions,
  ReasoningResult,
  ReasoningStep,
  ReasoningStepType,
  ReasoningStrategy,
} from './reasoning/ai-reasoning-types.js'

// ─── Rerank 类型 re-export ───

export type {
  RerankDocument,
  RerankItem,
  RerankOperations,
  RerankRequest,
  RerankResponse,
} from './rerank/ai-rerank-types.js'

// ─── Retrieval 类型 re-export ───

export type {
  Citation,
  RetrievalOperations,
  RetrievalRequest,
  RetrievalResult,
  RetrievalResultItem,
  RetrievalSource,
} from './retrieval/ai-retrieval-types.js'

// ─── Store 类型 re-export ───

export type {
  AIStore,
  AIVectorStore,
  InteractionScope,
  ObjectRef,
  SessionInfo,
  StoreFilter,
  StorePage,
} from './store/ai-store-types.js'

// ─── Summary 类型 re-export ───

export type {
  SummaryOperations,
  SummaryOptions,
  SummaryResult,
} from './summary/ai-summary-types.js'

// ─── Token 类型 re-export ───

export type {
  TokenOperations,
} from './token/ai-token-types.js'
