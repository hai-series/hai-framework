import type { ACPOperations } from './acp/ai-acp-types.js'
import type { CompressOperations } from './compress/ai-compress-types.js'
import type { ContextOperations } from './context/ai-context-types.js'
import type { EmbeddingOperations } from './embedding/ai-embedding-types.js'
import type { FileOperations } from './file/ai-file-types.js'
import type { KnowledgeOperations } from './knowledge/ai-knowledge-types.js'
import type { MemoryOperations } from './memory/ai-memory-types.js'
import type { PersonaOperations } from './persona/ai-persona-types.js'
import type { RagOperations } from './rag/ai-rag-types.js'
import type { ReasoningOperations } from './reasoning/ai-reasoning-types.js'
import type { ManagedAudioOperations, ManagedImageOperations, ManagedLLMOperations, ManagedMCPOperations, ManagedRetrievalOperations } from './registry/ai-registry-types.js'
import type { RerankOperations } from './rerank/ai-rerank-types.js'
import type { SummaryOperations } from './summary/ai-summary-types.js'
import type { TokenOperations } from './token/ai-token-types.js'
import { core } from '@h-ai/core'
import { aiM } from './ai-i18n.js'
import { HaiAIError } from './ai-types.js'
import { parseBoundedLocalFile } from './file/ai-file-functions.js'

/** 创建未初始化错误工具（统一的 NOT_INITIALIZED 响应） */
const notInitialized = core.module.createNotInitializedKit(
  HaiAIError.NOT_INITIALIZED,
  () => aiM('ai_notInitialized'),
)

/**
 * LLM 未初始化占位
 *
 * 异步方法返回 NOT_INITIALIZED HaiResult。
 * chatStream 是 async generator，无法返回 HaiResult，
 * 只能在迭代时抛出异常通知调用方。
 */
const notInitializedLLM: ManagedLLMOperations = {
  models: notInitialized.proxy<ManagedLLMOperations['models']>(),
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
  generateObject: () => Promise.resolve(notInitialized.result()),
}

/** ACP 未初始化占位；各层对象与其他子功能一样在模块顶层复用。 */
const notInitializedACP: ACPOperations = {
  scoped: () => ({
    plan: () => Promise.resolve(notInitialized.result()),
    run: () => Promise.resolve(notInitialized.result()),
    agents: notInitialized.proxy<ReturnType<ACPOperations['scoped']>['agents']>(),
    approvals: notInitialized.proxy<ReturnType<ACPOperations['scoped']>['approvals']>(),
    tasks: notInitialized.proxy<ReturnType<ACPOperations['scoped']>['tasks']>(),
    sessions: notInitialized.proxy<ReturnType<ACPOperations['scoped']>['sessions']>(),
  }),
  registerManagedExecutors: () => {},
  agents: notInitialized.proxy<ACPOperations['agents']>(),
  sessions: notInitialized.proxy<ACPOperations['sessions']>(),
  workspaces: notInitialized.proxy<ACPOperations['workspaces']>(),
  connect: () => Promise.resolve(notInitialized.result()),
  close: async () => {},
}

/** MCP 未初始化占位：所有方法返回 NOT_INITIALIZED 错误 */
const notInitializedMCP: ManagedMCPOperations = {
  servers: notInitialized.proxy<ManagedMCPOperations['servers']>(),
  services: {
    invoke: () => Promise.resolve(notInitialized.result()),
    createBroker: () => notInitialized.result(),
  },
  registerTool: () => notInitialized.result(),
  registerResource: () => notInitialized.result(),
  registerPrompt: () => notInitialized.result(),
  callTool: () => Promise.resolve(notInitialized.result()),
  readResource: () => Promise.resolve(notInitialized.result()),
  getPrompt: () => Promise.resolve(notInitialized.result()),
}

/** Embedding 未初始化占位 */
const notInitializedEmbedding = notInitialized.proxy<EmbeddingOperations>()

/** Reasoning 未初始化占位 */
const notInitializedReasoning: ReasoningOperations = {
  run: () => Promise.resolve(notInitialized.result()),
  async* runStream() { throw notInitialized.error() },
}

/** Retrieval 未初始化占位 */
const notInitializedRetrieval: ManagedRetrievalOperations = {
  sources: notInitialized.proxy<ManagedRetrievalOperations['sources']>(),
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
const notInitializedKnowledge = notInitialized.proxy<KnowledgeOperations>()

/** Memory 未初始化占位 */
const notInitializedMemory = notInitialized.proxy<MemoryOperations>()

/** Persona 未初始化占位 */
const notInitializedPersona = notInitialized.proxy<PersonaOperations>()

/**
 * Token 未初始化占位
 *
 * Token 方法返回原始 number 而非 HaiResult，无法通过 proxy 安全拦截。
 * 未初始化时直接抛出异常，避免静默返回 0 导致下游 Token 计算错误。
 */
const notInitializedToken: TokenOperations = {
  estimateText: () => { throw notInitialized.error() },
  estimateMessages: () => { throw notInitialized.error() },
}

/** Summary 未初始化占位 */
const notInitializedSummary = notInitialized.proxy<SummaryOperations>()

/** Compress 未初始化占位 */
const notInitializedCompress = notInitialized.proxy<CompressOperations>()

/** Context 未初始化占位 */
const notInitializedContext: ContextOperations = {
  createManager: () => notInitialized.result(),
  restoreManager: () => Promise.resolve(notInitialized.result()),
  listSessions: () => Promise.resolve(notInitialized.result()),
  renameSession: () => Promise.resolve(notInitialized.result()),
  removeSession: () => Promise.resolve(notInitialized.result()),
}

/** Rerank 未初始化占位 */
const notInitializedRerank = notInitialized.proxy<RerankOperations>()

/** File 未初始化占位 */
const notInitializedFile: FileOperations = {
  parse: request => request.options?.mode === 'local'
    ? parseBoundedLocalFile(request)
    : Promise.resolve(notInitialized.result()),
  parseText: () => Promise.resolve(notInitialized.result()),
}

/**
 * Audio 未初始化占位
 *
 * transcribe / synthesize 返回 NOT_INITIALIZED HaiResult；
 * 流式方法是 async generator，无法返回 HaiResult，只能在迭代时抛出异常。
 */
const notInitializedAudio: ManagedAudioOperations = {
  models: notInitialized.proxy<ManagedAudioOperations['models']>(),
  transcribe: () => Promise.resolve(notInitialized.result()),
  async* transcribeStream() { throw notInitialized.error() },
  synthesize: () => Promise.resolve(notInitialized.result()),
  async* synthesizeStream() { throw notInitialized.error() },
  getCapabilities: () => notInitialized.result(),
}

/** Image 未初始化占位 */
const notInitializedImage: ManagedImageOperations = {
  models: notInitialized.proxy<ManagedImageOperations['models']>(),
  generate: () => Promise.resolve(notInitialized.result()),
}

/**
 * A2A 延迟装配时沿用统一的未初始化错误。
 * @example 模块内部上下文
 * ```ts
 * const result = notInitializedResult<string>()
 * if (!result.success) void result.error.code
 * ```
 */
export const notInitializedResult = notInitialized.result

/**
 * 已发布的子功能不可用时，从入口转发到相应的占位操作。
 * @example 模块内部上下文
 * ```ts
 * async function unavailableModels() {
 *   const result = await notInitializedOperations.llm.listModels()
 *   if (!result.success) return result.error.code
 *   return result.data
 * }
 * ```
 */
export const notInitializedOperations = {
  llm: notInitializedLLM,
  acp: notInitializedACP,
  mcp: notInitializedMCP,
  embedding: notInitializedEmbedding,
  reasoning: notInitializedReasoning,
  retrieval: notInitializedRetrieval,
  rag: notInitializedRag,
  knowledge: notInitializedKnowledge,
  memory: notInitializedMemory,
  persona: notInitializedPersona,
  token: notInitializedToken,
  summary: notInitializedSummary,
  compress: notInitializedCompress,
  context: notInitializedContext,
  rerank: notInitializedRerank,
  file: notInitializedFile,
  audio: notInitializedAudio,
  image: notInitializedImage,
}
