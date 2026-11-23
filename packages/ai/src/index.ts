export type { AgentCapabilities, AgentCard, AgentExecutor, AgentInterface, AgentProvider, AgentSkill, Artifact, CancelTaskRequest, ExecutionEventBus, GetTaskRequest, StreamResponse, SubscribeToTaskRequest, TaskPushNotificationConfig } from './a2a/ai-a2a-types.js'
export type { A2AAgentCardConfig, A2AAgentCardDocument, A2AApiKeySecurity, A2AAuthenticator, A2ACallerIdentity, A2ACallOptions, A2ACallResult, A2AContextInfo, A2AHandleResult, A2AMessageRecord, A2AOperations, A2ASecurityConfig, A2ATaskFilter } from './a2a/ai-a2a-types.js'
export { Role, TaskState } from './a2a/ai-a2a-types.js'
export type { ACPConfig, ACPConfigInput } from './acp/ai-acp-config.js'
export { ACPAgentSchema, ACPConfigSchema, ACPPublishSchema, ACPRepositorySchema, ACPWorkspaceSchema } from './acp/ai-acp-config.js'
export type { ACPApprovalDecision, ACPCitation, ACPPlatformPolicy, ACPPlatformRequest, ACPRunObserver, ACPRunRequest, ACPSubmitTurn, ACPTurnOptions } from './acp/ai-acp-platform.js'
export type { ACPProjectChanges, ACPProjectSnapshot, ACPPublishSnapshot } from './acp/ai-acp-project.js'
export * from './acp/ai-acp-types.js'
export { A2AConfigSchema, A2ASkillConfigSchema, AIConfigSchema, ApiTypeSchema, AudioConfigSchema, AudioModelEntrySchema, AudioOperationSchema, AudioOperationsSchema, AudioProviderSchema, CompressConfigSchema, CompressionStrategySchema, EmbeddingConfigSchema, EntityTypeSchema, FileConfigSchema, ImageConfigSchema, ImageModelEntrySchema, ImageProviderSchema, KnowledgeConfigSchema, LLMConfigSchema, MCPConfigSchema, MCPExternalServerSchema, MCPServerCapabilitiesSchema, MCPServerConfigSchema, MemoryConfigSchema, MemoryTypeSchema, ModelCapabilitiesSchema, ModelEntrySchema, ModelScenarioSchema, OptionalSecretSchema, RetrievalConfigSchema, RetrievalSourceSchema, SummaryConfigSchema, TokenConfigSchema } from './ai-config.js'
export type { A2AConfig, AIConfig, AIConfigInput, ApiType, AudioConfig, AudioModelEntry, AudioOperation, AudioProviderName, CompressConfig, CompressionStrategy, EmbeddingConfig, EntityType, FileConfig, ImageConfig, ImageModelEntry, ImageProviderName, KnowledgeConfig, LLMConfig, MCPConfig, MCPExternalServer, MCPServerCapabilities, MCPServerConfig, MemoryConfig, MemoryType, ModelEntry, ModelScenario, ResolvedAudioModel, ResolvedImageModel, ResolvedModelConfig, ResolveRequiredModelEntryOptions, RetrievalConfig, RetrievalSourceConfig, SummaryConfig, TokenConfig } from './ai-config.js'
export * from './ai-main.js'
export * from './ai-types.js'

export * from './audio/ai-audio-types.js'
export * from './audio/ai-audio-ws-protocol.js'
export * from './compress/ai-compress-types.js'
export * from './context/ai-context-types.js'
export * from './embedding/ai-embedding-types.js'
export * from './file/ai-file-types.js'
export * from './image/ai-image-types.js'
export * from './knowledge/ai-knowledge-types.js'
export * from './llm/ai-llm-types.js'

export * from './mcp/ai-mcp-types.js'
export * from './memory/ai-memory-types.js'
export * from './persona/ai-persona-types.js'
export * from './rag/ai-rag-types.js'
export * from './reasoning/ai-reasoning-types.js'
export type { AIResourceEntry, AIResourceRegistry, ManagedAudioOperations, ManagedImageOperations, ManagedLLMOperations, ManagedMCPOperations, ManagedRetrievalOperations } from './registry/ai-registry-types.js'
export * from './rerank/ai-rerank-types.js'
export * from './retrieval/ai-retrieval-types.js'
export * from './store/ai-store-types.js'

export * from './summary/ai-summary-types.js'

export * from './token/ai-token-types.js'
export type { McpToolOptions } from './tools/ai-tools-mcp.js'

export type { BuiltinArtifact, BuiltinArtifactAccess, BuiltinArtifactReference, BuiltinToolBinding, BuiltinToolBroker, BuiltinToolBrokerOptions, BuiltinToolOptions, CreateBuiltinTools } from './tools/ai-tools-types.js'

// 声明打包会保留双重类型的直接再导出；显式类型别名确保这些名称仅可用于类型位置。
/**
 * A2A 消息。
 * @example
 * ```ts
 * import { type Message, ai } from '@h-ai/ai'
 * const message: Message = ai.Message.fromJSON({ role: 'ROLE_USER', messageId: 'message-1', parts: [{ text: '你好' }] })
 * ```
 */
export type Message = import('@a2a-js/sdk').Message
/**
 * A2A 消息里的文本、文件或结构化数据。
 * @example
 * ```ts
 * import { type Part, ai } from '@h-ai/ai'
 * const part: Part = ai.Part.fromJSON({ text: '你好' })
 * ```
 */
export type Part = import('@a2a-js/sdk').Part
/**
 * A2A 发送消息请求。
 * @example
 * ```ts
 * import type { SendMessageRequest } from '@h-ai/ai'
 * function messageFrom(request: SendMessageRequest) { return request.message }
 * ```
 */
export type SendMessageRequest = import('@a2a-js/sdk').SendMessageRequest
/**
 * A2A 任务及其状态。
 * @example
 * ```ts
 * import type { Task } from '@h-ai/ai'
 * function stateOf(task: Task) { return task.status?.state }
 * ```
 */
export type Task = import('@a2a-js/sdk').Task
/**
 * A2A 任务产物更新事件。
 * @example
 * ```ts
 * import type { TaskArtifactUpdateEvent } from '@h-ai/ai'
 * function artifactOf(event: TaskArtifactUpdateEvent) { return event.artifact }
 * ```
 */
export type TaskArtifactUpdateEvent = import('@a2a-js/sdk').TaskArtifactUpdateEvent
/**
 * A2A 任务状态。
 * @example
 * ```ts
 * import type { TaskStatus } from '@h-ai/ai'
 * function stateOf(status: TaskStatus) { return status.state }
 * ```
 */
export type TaskStatus = import('@a2a-js/sdk').TaskStatus
/**
 * A2A 任务状态更新事件。
 * @example
 * ```ts
 * import type { TaskStatusUpdateEvent } from '@h-ai/ai'
 * function statusOf(event: TaskStatusUpdateEvent) { return event.status }
 * ```
 */
export type TaskStatusUpdateEvent = import('@a2a-js/sdk').TaskStatusUpdateEvent
/**
 * A2A 执行器收到的请求上下文。
 * @example
 * ```ts
 * import type { RequestContext } from '@h-ai/ai'
 * function taskIdOf(context: RequestContext) { return context.taskId }
 * ```
 */
export type RequestContext = import('@a2a-js/sdk/server').RequestContext
/**
 * A2A 服务端的调用上下文。
 * @example
 * ```ts
 * import type { ServerCallContext } from '@h-ai/ai'
 * function tenantOf(context: ServerCallContext) { return context.tenant }
 * ```
 */
export type ServerCallContext = import('@a2a-js/sdk/server').ServerCallContext
/**
 * MCP SDK 服务器实例。
 * @example
 * ```ts
 * import { type McpServer, ai } from '@h-ai/ai'
 * const server: McpServer = ai.createMcpServer({ name: 'example', version: '1.0.0' })
 * ```
 */
export type McpServer = import('./mcp/ai-mcp-server.js').McpServer
/**
 * MCP SSE 服务端传输实例。
 * @example
 * ```ts
 * import type { SSEServerTransport } from '@h-ai/ai'
 * async function shutdown(transport: SSEServerTransport) { await transport.close() }
 * ```
 */
export type SSEServerTransport = import('./mcp/ai-mcp-server.js').SSEServerTransport
/**
 * MCP 标准输入输出传输实例。
 * @example
 * ```ts
 * import { type StdioServerTransport, ai } from '@h-ai/ai'
 * const transport: StdioServerTransport = new ai.StdioServerTransport()
 * ```
 */
export type StdioServerTransport = import('./mcp/ai-mcp-server.js').StdioServerTransport
/**
 * MCP 流式 HTTP 服务端传输实例。
 * @example
 * ```ts
 * import { type StreamableHTTPServerTransport, ai } from '@h-ai/ai'
 * const transport: StreamableHTTPServerTransport = new ai.StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
 * ```
 */
export type StreamableHTTPServerTransport = import('./mcp/ai-mcp-server.js').StreamableHTTPServerTransport
