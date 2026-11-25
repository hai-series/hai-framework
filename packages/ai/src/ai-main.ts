import type { HaiResult } from '@h-ai/core'
import type { A2ADeps, A2AImplementation } from './a2a/ai-a2a-functions.js'
import type { A2AOperations } from './a2a/ai-a2a-types.js'
import type { ACPOperations } from './acp/ai-acp-types.js'
import type { AIConfig, AIConfigInput } from './ai-config.js'
import type { AIFunctions, AIInitOptions } from './ai-types.js'
/**
 * @h-ai/ai — AI 服务主入口
 *
 * 提供统一的 `ai` 对象，聚合所有 AI 操作功能。
 * @module ai-main
 */

import type { CompressOperations } from './compress/ai-compress-types.js'

import type { ContextOperations } from './context/ai-context-types.js'
import type { EmbeddingOperations } from './embedding/ai-embedding-types.js'
import type { FileOperations } from './file/ai-file-types.js'
import type { KnowledgeOperations } from './knowledge/ai-knowledge-types.js'
import type { StreamOperations, ToolsOperations } from './llm/ai-llm-types.js'
import type { MemoryOperations } from './memory/ai-memory-types.js'
import type { PersonaOperations } from './persona/ai-persona-types.js'
import type { RagOperations } from './rag/ai-rag-types.js'
import type { ReasoningOperations } from './reasoning/ai-reasoning-types.js'
import type { ManagedAudioOperations, ManagedImageOperations, ManagedLLMOperations, ManagedMCPOperations, ManagedRetrievalOperations } from './registry/ai-registry-types.js'
import type { RerankOperations } from './rerank/ai-rerank-types.js'
import type { AIStoreProvider } from './store/ai-store-types.js'
import type { SummaryOperations } from './summary/ai-summary-types.js'
import type { TokenOperations } from './token/ai-token-types.js'
import { core } from '@h-ai/core'
import { datapipe } from '@h-ai/datapipe'
import { createA2ALazyProxy } from './a2a/ai-a2a-functions.js'
import { AgentEvent, Message, Part, SendMessageRequest, Task, TaskArtifactUpdateEvent, TaskStatus, TaskStatusUpdateEvent } from './a2a/ai-a2a-types.js'

import { AIConfigSchema, ensureAudioCredential, resolveAudioModel, resolveImageModel, resolveModelApi, resolveModelEntry } from './ai-config.js'

import { createAISubsystems, selectAIStoreProvider } from './ai-functions.js'

import { aiM } from './ai-i18n.js'
import { HaiAIError } from './ai-types.js'
import { notInitializedOperations, notInitializedResult } from './ai-uninitialized.js'
import { serializePlayableAudio } from './audio/ai-audio-serialization.js'
import { createJsonFieldPreview } from './llm/ai-llm-json-preview.js'
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './llm/ai-llm-stream.js'
import { adaptToolRegistry } from './llm/ai-llm-tool.js'
import { createMcpServer, McpServer, SSEServerTransport, StdioServerTransport, StreamableHTTPServerTransport } from './mcp/ai-mcp-server.js'

import { createBuiltinToolBroker } from './tools/ai-tools-broker.js'
import { createBuiltinTools } from './tools/ai-tools-builtin.js'
import { createMcpTools } from './tools/ai-tools-mcp.js'

const logger = core.logger.child({ module: 'ai', scope: 'main' })

// ─── 内部状态 ───

/** 并发初始化防护 */
let initInProgress = false
/** 关闭等待已开始的初始化；重初始化直接清理旧实例，避免等待自身。 */
let initCompletion: Promise<void> | null = null
let closingPromise: Promise<void> | null = null
/** 当前配置（`null` 表示未初始化） */
let currentConfig: AIConfig | null = null
/** 当前 LLM 操作实例 */
let currentLLM: ManagedLLMOperations | null = null
/** 当前 ACP 操作实例 */
let currentACP: ACPOperations | null = null
/** 当前 MCP 操作实例 */
let currentMCP: ManagedMCPOperations | null = null
/** 当前 Embedding 操作实例 */
let currentEmbedding: EmbeddingOperations | null = null
/** 当前 Reasoning 操作实例 */
let currentReasoning: ReasoningOperations | null = null
/** 当前 Retrieval 操作实例 */
let currentRetrieval: ManagedRetrievalOperations | null = null
/** 当前 RAG 操作实例 */
let currentRag: RagOperations | null = null
/** 当前 Knowledge 操作实例 */
let currentKnowledge: KnowledgeOperations | null = null
/** 当前 Memory 操作实例 */
let currentMemory: MemoryOperations | null = null
/** 当前 Persona 操作实例 */
let currentPersona: PersonaOperations | null = null
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
/** 当前 Audio 操作实例 */
let currentAudio: ManagedAudioOperations | null = null
/** 当前 Image 操作实例 */
let currentImage: ManagedImageOperations | null = null
/** A2A 配置（从 config.a2a 存储，供延迟初始化使用） */
let currentA2AConfig: AIConfig['a2a']
/** A2A 内部实现（registerExecutor 成功后才有值） */
let currentA2AImpl: A2AImplementation | null = null
/** 初始化阶段准备完成的任务与消息存储 */
let currentA2AStores: A2ADeps | null = null
/** 使所有配置/数据库清单的旧句柄失效。 */
let currentRegistriesClose: (() => Promise<void>) | null = null
/** 当前存储 Provider（用于模块关闭时统一释放资源） */
let currentStoreProvider: AIStoreProvider | null = null

/** A2A 延迟初始化代理（委托给 a2a 模块的 createA2ALazyProxy） */
const a2aLazyOperations: A2AOperations = createA2ALazyProxy({
  isInitialized: () => currentConfig !== null,
  getA2AConfig: () => currentA2AConfig ?? null,
  getA2AImpl: () => currentA2AImpl,
  setA2AImpl: (impl) => { currentA2AImpl = impl },
  getStores: () => currentA2AStores,
  notInitializedResult,
})

// ─── 内部辅助 ───

/** 重置所有子功能引用并释放 StoreProvider（用于 close 和 init 失败清理） */
async function resetAllState(): Promise<void> {
  const storeProvider = currentStoreProvider
  await currentA2AImpl?.close()

  await currentACP?.close()
  currentLLM = null
  await currentRegistriesClose?.()
  currentRegistriesClose = null
  currentACP = null
  currentMCP = null
  currentEmbedding = null
  currentReasoning = null
  currentRetrieval = null
  currentRag = null
  currentKnowledge = null
  currentMemory = null
  currentPersona = null
  currentToken = null
  currentSummary = null
  currentCompress = null
  currentContext = null
  currentRerank = null
  currentFile = null
  currentAudio = null
  currentImage = null
  currentA2AConfig = undefined
  currentA2AImpl = null
  currentA2AStores = null
  currentStoreProvider = null
  currentConfig = null

  if (storeProvider?.close) {
    try {
      await storeProvider.close()
    }
    catch (error) {
      logger.error('AI store provider close failed', { error })
    }
  }
}

// ─── 纯函数操作（不依赖初始化） ───

const toolsOperations: ToolsOperations = {
  createMcpTools: options => createMcpTools(options, () => (currentMCP ?? notInitializedOperations.mcp).services),
  createBuiltinTools: options => createBuiltinTools(options, {
    image: () => currentImage ?? notInitializedOperations.image,
    audio: () => currentAudio ?? notInitializedOperations.audio,
    llm: () => currentLLM ?? notInitializedOperations.llm,
  }),
  createBroker: createBuiltinToolBroker,
  adapt: adaptToolRegistry,
}

const streamOperations: StreamOperations = {
  createProcessor: createStreamProcessor,
  createJsonFieldPreview,
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
 * import { type AIConfigInput, type AIInitOptions, ai } from '@h-ai/ai'
 *
 * async function run(config: AIConfigInput, options: AIInitOptions) {
 *   // 默认 Store 所需 reldb/vecdb 已由应用初始化；显式测试 Store 通过 options 注入。
 *   const initialized = await ai.init(config, options)
 *   if (!initialized.success) return initialized
 *   try {
 *     const result = await ai.llm.chat({ messages: [{ role: 'user', content: '你好' }] })
 *     if (!result.success) return result
 *     return result.data.choices[0]?.message.content
 *   }
 *   finally { await ai.close() }
 * }
 * ```
 */
export const ai: AIFunctions = {
  AgentEvent,
  Message,
  Part,
  SendMessageRequest,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatus,
  TaskStatusUpdateEvent,
  McpServer,
  SSEServerTransport,
  StdioServerTransport,
  StreamableHTTPServerTransport,
  // 独立工具保持原有调用契约，不依赖模块初始化状态。
  createMcpServer,
  ensureAudioCredential,
  resolveAudioModel,
  resolveImageModel,
  resolveModelApi,
  resolveModelEntry,
  serializePlayableAudio,
  async init(config?: AIConfigInput, options?: AIInitOptions): Promise<HaiResult<void>> {
    // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
    if (initInProgress || closingPromise) {
      logger.warn('AI init already in progress, skipping concurrent call')
      return core.err(HaiAIError.INIT_IN_PROGRESS, aiM('ai_initInProgress'))
    }
    initInProgress = true
    let resolveInit!: () => void
    initCompletion = new Promise<void>((resolve) => {
      resolveInit = resolve
    })
    let closingPrevious = false

    try {
      // 关闭旧实例
      if (currentConfig) {
        logger.warn('AI module is already initialized, reinitializing')
        closingPrevious = true
        await resetAllState()
        closingPrevious = false
      }

      logger.info('Initializing AI module')

      const parseResult = AIConfigSchema.safeParse(config ?? {})
      if (!parseResult.success) {
        logger.error('AI config validation failed', { error: parseResult.error.message })
        return core.err(
          HaiAIError.CONFIGURATION_ERROR,
          aiM('ai_configError', {
            params: { error: parseResult.error.message },
          }),
          parseResult.error,
        )
      }
      const parsed = parseResult.data

      const selectedStore = selectAIStoreProvider(options?.storeProvider, logger)
      if (!selectedStore.success)
        return selectedStore
      const storeProvider = selectedStore.data
      currentStoreProvider = storeProvider

      // 委托 ai-functions 组装所有子功能（含建表）
      const subs = await createAISubsystems(parsed, {
        storeProvider,
        datapipe,
        acpAdapters: options?.acpAdapters,
        runner: options?.runner,
        acpPolicy: options?.acpPolicy,
        mcpJobFiles: options?.mcpJobFiles,
      })

      currentRegistriesClose = subs.closeRegistries
      currentLLM = subs.llm
      currentACP = subs.acp
      currentACP.registerManagedExecutors()
      currentMCP = subs.mcp
      currentEmbedding = subs.embedding
      currentReasoning = subs.reasoning
      currentRerank = subs.rerank
      currentRetrieval = subs.retrieval
      currentRag = subs.rag
      currentKnowledge = subs.knowledge
      currentMemory = subs.memory
      currentPersona = subs.persona
      currentToken = subs.token
      currentSummary = subs.summary
      currentCompress = subs.compress
      currentContext = subs.context
      currentFile = subs.file
      currentAudio = subs.audio
      currentImage = subs.image

      currentA2AConfig = parsed.a2a
      currentA2AStores = subs.a2aStores

      currentConfig = parsed
      logger.info('AI module initialized', { model: parsed.llm?.model })
      return core.ok(undefined)
    }
    catch (error) {
      // 旧实例清理失败时保留资源与占用供显式重试；部分初始化清理也不能突破 HaiResult 边界。
      if (!closingPrevious) {
        try {
          await resetAllState()
        }
        catch (cleanupError) {
          logger.error('AI initialization cleanup failed', { error: cleanupError })
        }
      }
      logger.error('AI module initialization failed', { error })
      return core.err(
        HaiAIError.CONFIGURATION_ERROR,
        aiM('ai_initFailed', {
          params: {
            error: String(error),
          },
        }),
        error,
      )
    }
    finally {
      initInProgress = false
      initCompletion = null
      resolveInit()
    }
  },

  get llm(): ManagedLLMOperations { return currentLLM ?? notInitializedOperations.llm },
  get acp(): ACPOperations {
    return currentACP ?? notInitializedOperations.acp
  },
  get mcp(): ManagedMCPOperations { return currentMCP ?? notInitializedOperations.mcp },
  get tools(): ToolsOperations { return toolsOperations },
  get stream(): StreamOperations { return streamOperations },
  get embedding(): EmbeddingOperations { return currentEmbedding ?? notInitializedOperations.embedding },
  get reasoning(): ReasoningOperations { return currentReasoning ?? notInitializedOperations.reasoning },
  get retrieval(): ManagedRetrievalOperations { return currentRetrieval ?? notInitializedOperations.retrieval },
  get rag(): RagOperations { return currentRag ?? notInitializedOperations.rag },
  get knowledge(): KnowledgeOperations { return currentKnowledge ?? notInitializedOperations.knowledge },
  get memory(): MemoryOperations { return currentMemory ?? notInitializedOperations.memory },
  get persona(): PersonaOperations { return currentPersona ?? notInitializedOperations.persona },
  get token(): TokenOperations { return currentToken ?? notInitializedOperations.token },
  get summary(): SummaryOperations { return currentSummary ?? notInitializedOperations.summary },
  get compress(): CompressOperations { return currentCompress ?? notInitializedOperations.compress },
  get context(): ContextOperations { return currentContext ?? notInitializedOperations.context },
  get rerank(): RerankOperations { return currentRerank ?? notInitializedOperations.rerank },
  get file(): FileOperations { return currentFile ?? notInitializedOperations.file },
  get audio(): ManagedAudioOperations { return currentAudio ?? notInitializedOperations.audio },
  get image(): ManagedImageOperations { return currentImage ?? notInitializedOperations.image },
  get a2a(): A2AOperations { return a2aLazyOperations },
  get config() {
    return currentConfig
      ? core.sanitize.sanitizeSensitiveFields(currentConfig)
      : null
  },
  get isInitialized() { return currentConfig !== null },

  async close(): Promise<void> {
    if (!closingPromise) {
      closingPromise = (async () => {
        if (initCompletion)
          await initCompletion
        logger.info('Closing AI module')
        await resetAllState()
        logger.info('AI module closed')
      })().finally(() => { closingPromise = null })
    }
    return closingPromise
  },
}
