/**
 * =============================================================================
 * @hai/ai - AI 服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `ai` 对象，聚合所有 AI 操作功能。
 *
 * 使用方式：
 * 1. 调用 `ai.init()` 初始化 AI 服务
 * 2. 通过 `ai.llm` 进行大模型调用
 * 3. 通过 `ai.mcp` 进行 MCP 服务调用
 * 4. 通过 `ai.tools` 定义和管理工具
 * 5. 通过 `ai.stream` 处理流式响应
 * 6. 调用 `ai.close()` 关闭服务
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 *
 * // 1. 初始化 AI 服务
 * ai.init({
 *     llm: {
 *         model: 'gpt-4o-mini',
 *         apiKey: process.env.OPENAI_API_KEY,
 *     }
 * })
 *
 * // 2. LLM 调用
 * const result = await ai.llm.chat({
 *     messages: [
 *         { role: 'system', content: '你是一个有帮助的助手' },
 *         { role: 'user', content: '你好！' }
 *     ]
 * })
 *
 * // 3. MCP 工具调用
 * ai.mcp.registerTool(
 *     { name: 'search', description: '搜索', inputSchema: {} },
 *     async (input) => ({ results: [] })
 * )
 * await ai.mcp.callTool('search', { query: 'hello' })
 *
 * // 4. 工具定义
 * const tool = ai.tools.define({
 *     name: 'greet',
 *     description: '问候',
 *     parameters: z.object({ name: z.string() }),
 *     handler: ({ name }) => `Hello ${name}`,
 * })
 *
 * // 5. 流处理
 * const processor = ai.stream.createProcessor()
 *
 * // 6. 关闭服务
 * ai.close()
 * ```
 *
 * @module ai-main
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AIConfig,
  AIConfigInput,
  AIError,
  AIService,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  LLMOperations,
  LLMProvider,
  MCPContext,
  MCPOperations,
  MCPPrompt,
  MCPPromptMessage,
  MCPProvider,
  MCPResource,
  MCPResourceContent,
  MCPToolDefinition,
  MCPToolHandler,
  StreamOperations,
  ToolsOperations,
} from './ai-types.js'

import { core, err, ok } from '@hai/core'

import { AIConfigSchema, AIErrorCode } from './ai-config.js'
import { aiM } from './ai-i18n.js'

import { createHaiLLMProvider } from './llm/ai-llm-provider.js'
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './llm/ai-llm-stream.js'
import { createToolRegistry, defineTool } from './llm/ai-llm-tool.js'
import { createHaiMCPProvider } from './mcp/ai-mcp-provider.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的 LLM Provider，未初始化时为 `null` */
let currentLLMProvider: LLMProvider | null = null

/** 当前活跃的 MCP Provider，未初始化时为 `null` */
let currentMCPProvider: MCPProvider | null = null

/** 当前 AI 配置（经过 Zod 校验后的完整配置），未初始化时为 `null` */
let currentConfig: AIConfig | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

/**
 * 根据配置创建 LLM Provider
 *
 * @param config - 经过校验的 AI 配置
 * @returns 基于 OpenAI SDK 的 LLM Provider 实例
 */
function createLLMProvider(config: AIConfig): LLMProvider {
  return createHaiLLMProvider(config)
}

/**
 * 根据配置创建 MCP Provider
 *
 * @param config - 经过校验的 AI 配置
 * @returns MCP Provider 实例
 */
function createMCPProvider(config: AIConfig): MCPProvider {
  return createHaiMCPProvider(config)
}

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

/** 未初始化工具集 */
const notInitialized = core.module.createNotInitializedKit<AIError>(
  AIErrorCode.NOT_INITIALIZED,
  () => aiM('ai_notInitialized'),
)

/**
 * 未初始化时的 LLM 操作占位
 *
 * `chat`/`listModels` 返回包含 `NOT_INITIALIZED` 错误的 Result，
 * `chatStream` 抛出 `NOT_INITIALIZED` 异常（因为 AsyncGenerator 无法返回 Result）。
 */
const notInitializedLLM: LLMOperations = {
  chat: () => Promise.resolve(notInitialized.result()),
  async* chatStream() {
    throw notInitialized.error()
  },
  listModels: () => Promise.resolve(notInitialized.result()),
}

/**
 * 未初始化时的 MCP 操作占位
 *
 * `register*` 抛出异常，调用操作返回包含 `NOT_INITIALIZED` 错误的 Result。
 */
const notInitializedMCP: MCPOperations = {
  registerTool: () => { throw notInitialized.error() },
  registerResource: () => { throw notInitialized.error() },
  registerPrompt: () => { throw notInitialized.error() },
  callTool: () => Promise.resolve(notInitialized.result()),
  readResource: () => Promise.resolve(notInitialized.result()),
  getPrompt: () => Promise.resolve(notInitialized.result()),
}

// =============================================================================
// 统一 AI 服务对象
// =============================================================================

/**
 * AI 服务对象
 *
 * 统一的 AI 访问入口，提供以下功能：
 * - `ai.init()` - 初始化 AI 服务
 * - `ai.close()` - 关闭服务
 * - `ai.llm` - LLM 操作（聊天、流式响应）
 * - `ai.mcp` - MCP 操作（工具、资源、提示词）
 * - `ai.tools` - 工具操作（定义、注册表）
 * - `ai.stream` - 流处理操作（处理器、SSE）
 * - `ai.config` - 当前配置
 * - `ai.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 *
 * ai.init({ llm: { model: 'gpt-4o-mini' } })
 *
 * const result = await ai.llm.chat({
 *     messages: [{ role: 'user', content: '你好' }]
 * })
 *
 * for await (const chunk of ai.llm.chatStream({ messages: [...] })) {
 *     // 处理 chunk.choices[0].delta.content
 * }
 *
 * ai.close()
 * ```
 */
export const ai: AIService = {
  /**
   * 初始化 AI 服务
   *
   * 通过 Zod Schema 校验配置并创建各 Provider。
   * 重复调用时会先释放旧实例。
   *
   * @param config - AI 配置（可选），未提供时使用全部默认值
   * @returns 成功返回 `ok(undefined)`，配置校验失败返回 `err(CONFIGURATION_ERROR)`
   */
  init(config?: AIConfigInput): Result<void, AIError> {
    // 关闭现有服务（如果存在）
    if (currentLLMProvider || currentMCPProvider) {
      currentLLMProvider = null
      currentMCPProvider = null
      currentConfig = null
    }

    try {
      // 运行时校验并补齐默认值
      const normalizedConfig = AIConfigSchema.parse(config ?? {})

      // 创建各 Provider
      currentLLMProvider = createLLMProvider(normalizedConfig)
      currentMCPProvider = createMCPProvider(normalizedConfig)
      currentConfig = normalizedConfig

      return ok(undefined)
    }
    catch (error) {
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_initFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  },

  /**
   * 获取 LLM 操作接口
   *
   * 未初始化时返回占位对象（所有方法返回 NOT_INITIALIZED 错误）。
   */
  get llm(): LLMOperations {
    if (!currentLLMProvider) {
      return notInitializedLLM
    }

    return {
      chat: (request: ChatCompletionRequest): Promise<Result<ChatCompletionResponse, AIError>> => {
        return currentLLMProvider!.chat(request)
      },
      chatStream: (request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> => {
        return currentLLMProvider!.chatStream(request)
      },
      listModels: (): Promise<Result<string[], AIError>> => {
        return currentLLMProvider!.listModels()
      },
    }
  },

  /**
   * 获取 MCP 操作接口
   *
   * 未初始化时返回占位对象（注册操作抛异常，调用操作返回 NOT_INITIALIZED 错误）。
   */
  get mcp(): MCPOperations {
    if (!currentMCPProvider) {
      return notInitializedMCP
    }

    return {
      registerTool: <TInput, TOutput>(
        definition: MCPToolDefinition,
        handler: MCPToolHandler<TInput, TOutput>,
      ): void => {
        currentMCPProvider!.registerTool(definition, handler)
      },
      registerResource: (
        resource: MCPResource,
        handler: () => Promise<MCPResourceContent>,
      ): void => {
        currentMCPProvider!.registerResource(resource, handler)
      },
      registerPrompt: (
        prompt: MCPPrompt,
        handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
      ): void => {
        currentMCPProvider!.registerPrompt(prompt, handler)
      },
      callTool: (name: string, args: unknown, context?: MCPContext): Promise<Result<unknown, AIError>> => {
        return currentMCPProvider!.callTool(name, args, context)
      },
      readResource: (uri: string): Promise<Result<MCPResourceContent, AIError>> => {
        return currentMCPProvider!.readResource(uri)
      },
      getPrompt: (name: string, args: Record<string, string>): Promise<Result<MCPPromptMessage[], AIError>> => {
        return currentMCPProvider!.getPrompt(name, args)
      },
    }
  },

  /**
   * 获取工具操作接口
   *
   * 工具操作为纯函数，不依赖初始化状态，可随时调用。
   */
  get tools(): ToolsOperations {
    return {
      define: defineTool,
      createRegistry: createToolRegistry,
    }
  },

  /**
   * 获取流处理操作接口
   *
   * 流处理操作为纯函数，不依赖初始化状态，可随时调用。
   */
  get stream(): StreamOperations {
    return {
      createProcessor: createStreamProcessor,
      collect: collectStream,
      createSSEDecoder,
      encodeSSE,
    }
  },

  /** 获取当前配置，未初始化时返回 `null` */
  get config(): AIConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化（即 LLM Provider 是否存在） */
  get isInitialized(): boolean {
    return currentLLMProvider !== null
  },

  /**
   * 关闭 AI 服务
   *
   * 释放所有 Provider 实例并清空配置。
   * 重复调用是安全的（幂等）。
   */
  close(): void {
    currentLLMProvider = null
    currentMCPProvider = null
    currentConfig = null
  },
}
