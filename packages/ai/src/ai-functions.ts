import type { McpServer } from '@agentclientprotocol/sdk'
import type { DatapipeFunctions } from '@h-ai/datapipe'
import type { z } from 'zod'
import type { A2ADeps } from './a2a/ai-a2a-functions.js'
import type { ACPAgentAdapter, ACPOperations } from './acp/ai-acp-types.js'

import type { AIConfig } from './ai-config.js'
import type { CompressOperations } from './compress/ai-compress-types.js'
/**
 * @h-ai/ai — 子功能组装工厂
 *
 * 将所有子功能的创建逻辑集中在此文件，main.ts 仅做生命周期管理和 API 编排。
 * @module ai-functions
 */

import type { PersistedContextState } from './context/ai-context-state.js'
import type { ContextOperations } from './context/ai-context-types.js'

import type { EmbeddingOperations } from './embedding/ai-embedding-types.js'
import type { FileOperations } from './file/ai-file-types.js'
import type { KnowledgeOperations } from './knowledge/ai-knowledge-types.js'
import type { ChatRecord } from './llm/ai-llm-types.js'
import type {
  MemoryEntry,
  MemoryOperations,
} from './memory/ai-memory-types.js'
import type {
  PersonaOperations,
  PersonaProfile,
} from './persona/ai-persona-types.js'
import type { RagOperations } from './rag/ai-rag-types.js'
import type { ReasoningOperations } from './reasoning/ai-reasoning-types.js'
import type { ResourceRecord } from './registry/ai-registry-functions.js'
import type {
  ManagedAudioOperations,
  ManagedImageOperations,
  ManagedLLMOperations,
  ManagedMCPOperations,
  ManagedRetrievalOperations,
} from './registry/ai-registry-types.js'
import type { RerankOperations } from './rerank/ai-rerank-types.js'
import type { RetrievalSource } from './retrieval/ai-retrieval-types.js'
import type { AIStoreProvider, SessionInfo } from './store/ai-store-types.js'
import type { SummaryOperations } from './summary/ai-summary-types.js'
import type { TokenOperations } from './token/ai-token-types.js'
import { err } from '@h-ai/core'
import { createA2AStores } from './a2a/ai-a2a-functions.js'
import { resolveEnvironment } from './acp/ai-acp-adapters.js'

import { createACPOperations } from './acp/ai-acp-functions.js'
import {
  AudioConfigSchema,
  AudioModelEntrySchema,
  CompressConfigSchema,
  ImageConfigSchema,
  ImageModelEntrySchema,
  KnowledgeConfigSchema,
  MCPExternalServerSchema,
  MemoryConfigSchema,
  ModelEntrySchema,
  RetrievalSourceSchema,
  SummaryConfigSchema,
  TokenConfigSchema,
} from './ai-config.js'
import { aiM } from './ai-i18n.js'
import { HaiAIError } from './ai-types.js'

import { createAudioOperations } from './audio/ai-audio-functions.js'
import { createCompressOperations } from './compress/ai-compress-functions.js'
import { createContextOperations } from './context/ai-context-functions.js'
import { createEmbeddingOperations } from './embedding/ai-embedding-functions.js'
import { createFileOperations } from './file/ai-file-functions.js'
import { createImageOperations } from './image/ai-image-functions.js'
import { createKnowledgeOperations } from './knowledge/ai-knowledge-functions.js'
import { createAILLMFunctions } from './llm/ai-llm-functions.js'
import { createAIMCPFunctions } from './mcp/ai-mcp-functions.js'
import { createMemoryOperations } from './memory/ai-memory-facade.js'
import { createMem0MemoryOperations } from './memory/providers/ai-memory-provider-mem0.js'
import { createNativeMemoryOperations } from './memory/providers/ai-memory-provider-native.js'
import { createPersonaOperations } from './persona/ai-persona-functions.js'
import { createRagOperations } from './rag/ai-rag-functions.js'
import { createReasoningOperations } from './reasoning/ai-reasoning-functions.js'
import { createResourceRegistry } from './registry/ai-registry-functions.js'
import { createRerankOperations } from './rerank/ai-rerank-functions.js'
import { createRetrievalOperations } from './retrieval/ai-retrieval-functions.js'
import { createSummaryOperations } from './summary/ai-summary-functions.js'
import { createTokenOperations } from './token/ai-token-functions.js'

/**
 * 子功能组装依赖
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function dependencies(storeProvider: AIStoreProvider, datapipe: DatapipeFunctions): AISubsystemDeps {
 *   return { storeProvider, datapipe }
 * }
 * ```
 */
export interface AISubsystemDeps {
  storeProvider: AIStoreProvider
  acpAdapters?: Record<string, ACPAgentAdapter>
  datapipe: DatapipeFunctions
}

/**
 * 子功能组装结果
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function openContext(subsystems: AISubsystems) {
 *   const result = subsystems.context.createManager({ scope: { objectId: 'user-1', sessionId: 'session-1' } })
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface AISubsystems {
  /** 使已捕获的资源清单句柄失效。 */
  closeRegistries: () => void
  /** 在统一初始化之前创建的 A2A 存储 */
  a2aStores: A2ADeps | null
  llm: ManagedLLMOperations
  acp: ACPOperations
  mcp: ManagedMCPOperations
  embedding: EmbeddingOperations
  reasoning: ReasoningOperations
  rerank: RerankOperations
  retrieval: ManagedRetrievalOperations
  rag: RagOperations
  knowledge: KnowledgeOperations
  memory: MemoryOperations
  persona: PersonaOperations
  token: TokenOperations
  summary: SummaryOperations
  compress: CompressOperations
  context: ContextOperations
  file: FileOperations
  audio: ManagedAudioOperations
  image: ManagedImageOperations
}

/**
 * 组装所有 AI 子功能实例
 *
 * 根据 parsed config 和外部依赖创建所有子功能操作接口。
 * 与 main.ts 解耦——main 仅负责生命周期，本函数负责创建逻辑。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function assemble(config: AIConfig, dependencies: AISubsystemDeps) {
 *   // 生命周期与失败清理由 ai.init/close 管理，此工厂复用注入的真实依赖。
 *   const subsystems = await createAISubsystems(config, dependencies)
 *   const result = subsystems.context.createManager({ scope: { objectId: 'user-1', sessionId: 'session-1' } })
 *   if (!result.success) throw new Error(result.error.message)
 *   return subsystems
 * }
 * ```
 */
export async function createAISubsystems(
  config: AIConfig,
  deps: AISubsystemDeps,
): Promise<AISubsystems> {
  const { storeProvider, datapipe: datapipeDep } = deps

  // 记忆后端：Mem0 数据格式适配自管理存储，无需 hai 的 memoryStore / memoryVectorStore
  const memoryParsed = MemoryConfigSchema.parse(config.memory ?? {})
  const useMem0Oss = memoryParsed.provider === 'mem0'

  // 通过 Provider 创建存储实例
  const chatRecordStore = storeProvider.createRelStore<ChatRecord>(
    'hai_ai_chat_records',
    { hasObjectId: true, hasSessionId: true },
  )
  const sessionStore = storeProvider.createRelStore<SessionInfo>(
    'hai_ai_sessions',
    { hasObjectId: true },
  )
  const sourceStore = storeProvider.createRelStore<RetrievalSource>(
    'hai_ai_retrieval_sources',
  )
  const memoryStore = useMem0Oss
    ? null
    : storeProvider.createRelStore<MemoryEntry>('hai_ai_memory', {
        hasObjectId: true,
        hasScopeIndex: true,
      })
  const contextStore = storeProvider.createRelStore<PersistedContextState>(
    'hai_ai_context',
    { hasObjectId: true, hasSessionId: true },
  )
  const personaStore = storeProvider.createRelStore<PersonaProfile>(
    'hai_ai_persona',
    { hasObjectId: true },
  )
  const a2aStores = config.a2a
    ? createA2AStores(storeProvider)
    : null

  // 向量存储
  const memoryVectorStore = useMem0Oss
    ? null
    : storeProvider.createVectorStore('hai_ai_memory_vectors')

  let registriesOpen = true
  const isOpen = () => registriesOpen
  const llmModels = createResourceRegistry(
    storeProvider.createRelStore<
      ResourceRecord<z.output<typeof ModelEntrySchema>>
    >('hai_ai_llm_models'),
    ModelEntrySchema,
    config.llm.models ?? [],
    isOpen,
  )
  const audioModels = createResourceRegistry(
    storeProvider.createRelStore<
      ResourceRecord<z.output<typeof AudioModelEntrySchema>>
    >('hai_ai_audio_models'),
    AudioModelEntrySchema,
    config.audio?.models ?? [],
    isOpen,
  )
  const imageModels = createResourceRegistry(
    storeProvider.createRelStore<
      ResourceRecord<z.output<typeof ImageModelEntrySchema>>
    >('hai_ai_image_models'),
    ImageModelEntrySchema,
    config.image?.models ?? [],
    isOpen,
  )
  const mcpServers = createResourceRegistry(
    storeProvider.createRelStore<
      ResourceRecord<z.output<typeof MCPExternalServerSchema>>
    >('hai_ai_mcp_servers'),
    MCPExternalServerSchema,
    config.mcp?.servers ?? [],
    isOpen,
  )
  const retrievalSources = createResourceRegistry(
    sourceStore,
    RetrievalSourceSchema,
    config.retrieval?.sources ?? [],
    isOpen,
  )
  async function llmConfig(): Promise<AIConfig> {
    return {
      ...config,
      llm: { ...config.llm, models: await llmModels.values() },
    }
  }
  async function audioConfig(): Promise<AIConfig> {
    return {
      ...config,
      audio: AudioConfigSchema.parse({
        ...config.audio,
        models: await audioModels.values(),
      }),
    }
  }
  async function imageConfig(): Promise<AIConfig> {
    return {
      ...config,
      image: ImageConfigSchema.parse({
        ...config.image,
        models: await imageModels.values(),
      }),
    }
  }
  async function mcpLookup(ids: string[]): Promise<McpServer[]> {
    const servers: McpServer[] = []
    for (const id of ids) {
      const entry = await mcpServers.read(id)
      if (!entry)
        throw new Error('MCP resource missing')
      const server = entry.value
      if (server.transport === 'stdio') {
        servers.push({
          name: server.name,
          command: server.command!,
          args: server.args,
          env: Object.entries(resolveEnvironment(server.environmentRefs)).map(
            ([name, value]) => ({ name, value }),
          ),
        })
      }
      else {
        servers.push({
          type: server.transport,
          name: server.name,
          url: server.url!,
          headers: Object.entries(resolveEnvironment(server.headerEnv)).map(
            ([name, value]) => ({ name, value }),
          ),
        })
      }
    }
    return servers
  }
  const acp = createACPOperations(
    storeProvider,
    config,
    deps.acpAdapters,
    llmConfig,
    mcpLookup,
  )

  // 统一初始化（建表等）
  await storeProvider.initialize()

  const llmFunctions = createAILLMFunctions(config, {
    recordStore: chatRecordStore,
    sessionStore,
    resolveConfig: llmConfig,
  })
  const llm: ManagedLLMOperations = Object.assign(llmFunctions.llm, {
    models: llmModels.operations,
  })

  // MCP
  const mcp: ManagedMCPOperations = Object.assign(createAIMCPFunctions(), {
    servers: mcpServers.operations,
  })

  // Embedding
  async function resourceCall<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    }
    catch {
      return err(
        HaiAIError.RESOURCE_OPERATION_FAILED,
        aiM('ai_resourceOperationFailed'),
      )
    }
  }
  const embedding: EmbeddingOperations = {
    embed: request =>
      resourceCall(async () =>
        createEmbeddingOperations(await llmConfig()).embed(request),
      ),
    embedText: text =>
      resourceCall(async () =>
        createEmbeddingOperations(await llmConfig()).embedText(text),
      ),
    embedBatch: texts =>
      resourceCall(async () =>
        createEmbeddingOperations(await llmConfig()).embedBatch(texts),
      ),
  }

  // Reasoning（依赖 LLM）
  const reasoning: ReasoningOperations = {
    run: (query, options) => resourceCall(async () => createReasoningOperations(await llmConfig(), llm).run(query, options)),
    async* runStream(query, options) { yield* createReasoningOperations(await llmConfig(), llm).runStream(query, options) },
  }

  // Rerank
  const rerank: RerankOperations = {
    rerank: request =>
      resourceCall(async () =>
        createRerankOperations(await llmConfig()).rerank(request),
      ),
    rerankTexts: (query, texts, topN) =>
      resourceCall(async () =>
        createRerankOperations(await llmConfig()).rerankTexts(
          query,
          texts,
          topN,
        ),
      ),
  }

  const retrieval: ManagedRetrievalOperations = Object.assign(
    createRetrievalOperations(
      embedding,
      storeProvider,
      sourceStore,
      rerank,
      retrievalSources,
    ),
    { sources: retrievalSources.operations },
  )

  // RAG（依赖 LLM + Retrieval）
  const rag = createRagOperations(llm, retrieval)

  // Knowledge（依赖 KnowledgeStore + LLM + Embedding + datapipe）
  const knowledgeParsed = KnowledgeConfigSchema.parse(config.knowledge ?? {})
  const knowledgeStore = storeProvider.createKnowledgeStore?.()
  const knowledge = createKnowledgeOperations(
    knowledgeParsed,
    llm,
    embedding,
    datapipeDep,
    knowledgeStore,
  )

  const memoryCore
    = memoryStore && memoryVectorStore
      ? createNativeMemoryOperations(
          memoryParsed,
          llm,
          embedding,
          memoryStore,
          memoryVectorStore,
        )
      : await createMem0MemoryOperations({
          config: memoryParsed,
          embedding,
          llm,
          collectionName: 'hai_ai_memory',
          embeddingDims: config.embedding?.dimensions,
          vectorBackend: storeProvider.getVectorBackend?.(),
        })
  // 封装出对外的公共记忆接口（作用域绑定 scoped + 管理接口 admin + clear 空过滤保护）
  const memory: MemoryOperations = createMemoryOperations(memoryCore)

  // Token / Summary / Compress
  const tokenParsed = TokenConfigSchema.parse(config.token ?? {})
  const summaryParsed = SummaryConfigSchema.parse(config.summary ?? {})
  const compressParsed = CompressConfigSchema.parse(config.compress ?? {})

  const token = createTokenOperations(tokenParsed)
  const summary: SummaryOperations = {
    generate: (messages, options) => resourceCall(async () => createSummaryOperations((await llmConfig()).llm, llm, token, summaryParsed).generate(messages, options)),
    summarize: (messages, options) => resourceCall(async () => createSummaryOperations((await llmConfig()).llm, llm, token, summaryParsed).summarize(messages, options)),
  }
  const compress = createCompressOperations(
    compressParsed,
    token,
    summary,
    config.llm.maxTokens ?? 4096,
  )

  const context = createContextOperations(
    compressParsed,
    token,
    compress,
    contextStore,
    sessionStore,
    {
      llm,
      memory: memory ?? undefined,
      rag: rag ?? undefined,
      reasoning: reasoning ?? undefined,
      summary,
    },
  )

  // Persona（全局共享的 AI 角色档案）
  const persona = createPersonaOperations(personaStore)

  // File（依赖 LLM）
  const file: FileOperations = {
    parse: request => resourceCall(async () => createFileOperations(await llmConfig(), llm).parse(request)),
    parseText: (content, filename) => resourceCall(async () => createFileOperations(await llmConfig(), llm).parseText(content, filename)),
  }

  // Audio（语音识别 / 语音合成，独立平台 Provider）
  let audioSnapshot = createAudioOperations(await audioConfig())
  async function currentAudio() {
    audioSnapshot = createAudioOperations(await audioConfig())
    return audioSnapshot
  }
  const audio: ManagedAudioOperations = {
    models: {
      list: () =>
        resourceCall(async () => {
          await currentAudio()
          return audioModels.operations.list()
        }),
      get: id =>
        resourceCall(async () => {
          await currentAudio()
          return audioModels.operations.get(id)
        }),
      register: input =>
        resourceCall(async () => {
          const result = await audioModels.operations.register(input)
          if (result.success)
            await currentAudio()
          return result
        }),
      update: (input, version) =>
        resourceCall(async () => {
          const result = await audioModels.operations.update(input, version)
          if (result.success)
            await currentAudio()
          return result
        }),
      remove: (id, version) =>
        resourceCall(async () => {
          const result = await audioModels.operations.remove(id, version)
          if (result.success)
            await currentAudio()
          return result
        }),
    },
    transcribe: request =>
      resourceCall(async () => (await currentAudio()).transcribe(request)),
    synthesize: request =>
      resourceCall(async () => (await currentAudio()).synthesize(request)),
    async* transcribeStream(request) {
      yield* (await currentAudio()).transcribeStream(request)
    },
    async* synthesizeStream(request) {
      yield* (await currentAudio()).synthesizeStream(request)
    },
    getCapabilities: request => audioSnapshot.getCapabilities(request),
  }
  const image: ManagedImageOperations = {
    models: imageModels.operations,
    generate: request =>
      resourceCall(async () =>
        createImageOperations(await imageConfig()).generate(request),
      ),
  }

  return {
    closeRegistries: () => {
      registriesOpen = false
    },
    a2aStores,
    llm,
    acp,
    mcp,
    embedding,
    reasoning,
    rerank,
    retrieval,
    rag,
    knowledge,
    memory,
    persona,
    token,
    summary,
    compress,
    context,
    file,
    audio,
    image,
  }
}
