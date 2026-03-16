/**
 * @h-ai/ai — 子功能组装工厂
 *
 * 将所有子功能的创建逻辑集中在此文件，main.ts 仅做生命周期管理和 API 编排。
 * @module ai-functions
 */

import type { DatapipeFunctions } from '@h-ai/datapipe'
import type { DbType, DmlOperations, ReldbJsonOps } from '@h-ai/reldb'
import type { VecdbFunctions } from '@h-ai/vecdb'

import type { AIConfig } from './ai-config.js'
import type { CompressOperations } from './compress/ai-compress-types.js'
import type { ContextOperations } from './context/ai-context-types.js'
import type { EmbeddingOperations } from './embedding/ai-embedding-types.js'
import type { FileOperations } from './file/ai-file-types.js'
import type { KnowledgeOperations } from './knowledge/ai-knowledge-types.js'
import type { ChatMessage, ChatRecord, LLMOperations } from './llm/ai-llm-types.js'
import type { MCPOperations } from './mcp/ai-mcp-types.js'
import type { MemoryEntry, MemoryOperations } from './memory/ai-memory-types.js'
import type { RagOperations } from './rag/ai-rag-types.js'
import type { ReasoningOperations } from './reasoning/ai-reasoning-types.js'
import type { RerankOperations } from './rerank/ai-rerank-types.js'
import type { RetrievalOperations, RetrievalSource } from './retrieval/ai-retrieval-types.js'
import type { SessionInfo } from './store/ai-store-types.js'
import type { SummaryOperations, SummaryResult } from './summary/ai-summary-types.js'
import type { TokenOperations } from './token/ai-token-types.js'

import { core } from '@h-ai/core'

import { CompressConfigSchema, KnowledgeConfigSchema, MemoryConfigSchema, RetrievalConfigSchema, SummaryConfigSchema, TokenConfigSchema } from './ai-config.js'
import { createCompressOperations } from './compress/ai-compress-functions.js'
import { createContextOperations } from './context/ai-context-functions.js'
import { createEmbeddingOperations } from './embedding/ai-embedding-functions.js'
import { createFileOperations } from './file/ai-file-functions.js'
import { createKnowledgeOperations } from './knowledge/ai-knowledge-functions.js'
import { createAILLMFunctions } from './llm/ai-llm-functions.js'
import { createAIMCPFunctions } from './mcp/ai-mcp-functions.js'
import { createMemoryOperations } from './memory/ai-memory-functions.js'
import { createRagOperations } from './rag/ai-rag-functions.js'
import { createReasoningOperations } from './reasoning/ai-reasoning-functions.js'
import { createRerankOperations } from './rerank/ai-rerank-functions.js'
import { createRetrievalOperations } from './retrieval/ai-retrieval-functions.js'
import { ReldbAIStore, VecdbAIVectorStore } from './store/ai-store-db.js'
import { createSummaryOperations } from './summary/ai-summary-functions.js'
import { createTokenOperations } from './token/ai-token-functions.js'

const logger = core.logger.child({ module: 'ai', scope: 'functions' })

/** 子功能组装依赖 */
export interface AISubsystemDeps {
  sql: DmlOperations
  jsonOps: ReldbJsonOps
  dbType: DbType | undefined
  vecdb: VecdbFunctions
  datapipe: DatapipeFunctions
}

/** 子功能组装结果 */
export interface AISubsystems {
  llm: LLMOperations
  mcp: MCPOperations
  embedding: EmbeddingOperations
  reasoning: ReasoningOperations
  rerank: RerankOperations
  retrieval: RetrievalOperations
  rag: RagOperations
  knowledge: KnowledgeOperations
  memory: MemoryOperations
  token: TokenOperations
  summary: SummaryOperations
  compress: CompressOperations
  context: ContextOperations
  file: FileOperations
}

/**
 * 组装所有 AI 子功能实例
 *
 * 根据 parsed config 和外部依赖创建所有子功能操作接口。
 * 与 main.ts 解耦——main 仅负责生命周期，本函数负责创建逻辑。
 */
export function createAISubsystems(config: AIConfig, deps: AISubsystemDeps): AISubsystems {
  const { sql, jsonOps, dbType, vecdb: vecdbDep, datapipe: datapipeDep } = deps

  // LLM（含对话记录存储）
  const chatRecordStore = new ReldbAIStore<ChatRecord>(sql, 'hai_ai_chat_records', jsonOps, { dbType, hasObjectId: true, hasSessionId: true })
  const sessionStore = new ReldbAIStore<SessionInfo>(sql, 'hai_ai_sessions', jsonOps, { dbType, hasObjectId: true })
  const llmFunctions = createAILLMFunctions(config, { recordStore: chatRecordStore, sessionStore })
  const llm = llmFunctions.llm

  // MCP
  const mcp = createAIMCPFunctions({ config })

  // Embedding
  const embedding = createEmbeddingOperations(config)

  // Reasoning（依赖 LLM）
  const reasoning = createReasoningOperations(config, llm)

  // Rerank
  const rerank = createRerankOperations(config)

  // Retrieval（依赖 Embedding + vecdb，可选依赖 Rerank）
  const sourceStore = new ReldbAIStore<RetrievalSource>(sql, 'hai_ai_retrieval_sources', jsonOps, { dbType })
  const retrieval = createRetrievalOperations(embedding, vecdbDep, sourceStore, rerank)

  // 预注册配置中的检索源（幂等写入，就算其他实例已有相同数据也安全）
  if (config.retrieval?.sources?.length) {
    const configSources = RetrievalConfigSchema.parse(config.retrieval).sources ?? []
    sourceStore
      .saveMany(configSources.map(s => ({ id: s.id, data: s })))
      .catch(e => logger.warn('Failed to pre-register retrieval sources', { error: e }))
  }

  // RAG（依赖 LLM + Retrieval）
  const rag = createRagOperations(llm, retrieval)

  // Knowledge（依赖 LLM + Embedding + vecdb + reldb + datapipe）
  const knowledgeParsed = KnowledgeConfigSchema.parse(config.knowledge ?? {})
  const knowledge = createKnowledgeOperations(knowledgeParsed, llm, embedding, vecdbDep, sql, datapipeDep, dbType)

  // Memory（依赖 LLM + Embedding + Store）
  const memoryParsed = MemoryConfigSchema.parse(config.memory ?? {})
  const memoryStore = new ReldbAIStore<MemoryEntry>(sql, 'hai_ai_memory', jsonOps, { dbType, hasObjectId: true })
  const memoryVectorStore = new VecdbAIVectorStore(vecdbDep, 'hai_ai_memory_vectors')
  const memory = createMemoryOperations(memoryParsed, llm, embedding, memoryStore, memoryVectorStore)

  // Token / Summary / Compress
  const tokenParsed = TokenConfigSchema.parse(config.token ?? {})
  const summaryParsed = SummaryConfigSchema.parse(config.summary ?? {})
  const compressParsed = CompressConfigSchema.parse(config.compress ?? {})

  const token = createTokenOperations(tokenParsed)
  const summary = createSummaryOperations(config.llm, llm, token, summaryParsed)
  const compress = createCompressOperations(compressParsed, token, summary, config.llm.maxTokens ?? 4096)

  // Context（依赖 Compress + Token + SessionStore + LLM + Memory + RAG + Reasoning）
  const contextStore = new ReldbAIStore<{ messages: ChatMessage[], summaries: SummaryResult[], updatedAt: number }>(sql, 'hai_ai_context', jsonOps, { dbType, hasObjectId: true, hasSessionId: true })
  const context = createContextOperations(compressParsed, token, compress, contextStore, sessionStore, {
    llm,
    memory: memory ?? undefined,
    rag: rag ?? undefined,
    reasoning: reasoning ?? undefined,
  })

  // File（依赖 LLM）
  const file = createFileOperations(config, llm)

  return { llm, mcp, embedding, reasoning, rerank, retrieval, rag, knowledge, memory, token, summary, compress, context, file }
}
