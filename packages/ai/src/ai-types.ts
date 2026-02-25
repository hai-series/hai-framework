/**
 * @h-ai/ai — 公共类型定义
 *
 * 聚合导出模块根类型和子功能类型，供外部通过 `@h-ai/ai` 一站式引入。
 */

import type { Result } from '@h-ai/core'

import type { AIConfig, AIConfigInput, AIError } from './ai-config.js'
import type { LLMOperations, StreamOperations, ToolsOperations } from './llm/ai-llm-types.js'
import type { MCPOperations } from './mcp/ai-mcp-types.js'

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
}

// ─── 子功能类型 re-export ───

export type {
  AssistantMessage,
  ChatCompletionChoice,
  ChatCompletionChunk,
  ChatCompletionDelta,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
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
