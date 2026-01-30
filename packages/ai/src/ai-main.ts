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
 * 4. 通过 `ai.skills` 管理和执行技能
 * 5. 调用 `ai.close()` 关闭服务
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
 * // 4. 技能执行
 * ai.skills.register(mySkill)
 * await ai.skills.execute('translate', { text: 'hello', to: 'zh' })
 *
 * // 5. 关闭服务
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
  Skill,
  SkillContext,
  SkillQuery,
  SkillResult,
  SkillsOperations,
  SkillsProvider,
} from './ai-types.js'

import { err, ok } from '@hai/core'

import { AIConfigSchema, AIErrorCode } from './ai-config.js'

import { createHaiLLMProvider } from './provider/ai-provider-llm.js'
import { createHaiMCPProvider } from './provider/ai-provider-mcp.js'
import { createHaiSkillsProvider } from './provider/ai-provider-skills.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的 LLM Provider */
let currentLLMProvider: LLMProvider | null = null

/** 当前活跃的 MCP Provider */
let currentMCPProvider: MCPProvider | null = null

/** 当前活跃的 Skills Provider */
let currentSkillsProvider: SkillsProvider | null = null

/** 当前 AI 配置 */
let currentConfig: AIConfig | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

/**
 * 根据配置创建 LLM Provider
 */
function createLLMProvider(config: AIConfig): LLMProvider {
  // 目前只支持 hai provider（兼容 OpenAI API）
  return createHaiLLMProvider(config)
}

/**
 * 根据配置创建 MCP Provider
 */
function createMCPProvider(config: AIConfig): MCPProvider {
  return createHaiMCPProvider(config)
}

/**
 * 根据配置创建 Skills Provider
 */
function createSkillsProvider(config: AIConfig): SkillsProvider {
  return createHaiSkillsProvider(config)
}

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

/**
 * 创建未初始化错误
 */
function notInitializedError(): AIError {
  return {
    code: AIErrorCode.NOT_INITIALIZED,
    message: 'AI service not initialized. Call ai.init() first.',
  }
}

/** 创建未初始化错误 Result */
function notInitializedResult<T>(): Result<T, AIError> {
  return err(notInitializedError())
}

/** 未初始化时的 LLM 操作占位 */
const notInitializedLLM: LLMOperations = {
  chat: () => Promise.resolve(notInitializedResult()),
  async* chatStream() {
    throw notInitializedError()
  },
  listModels: () => Promise.resolve(notInitializedResult()),
}

/** 未初始化时的 MCP 操作占位 */
const notInitializedMCP: MCPOperations = {
  registerTool: () => { throw notInitializedError() },
  registerResource: () => { throw notInitializedError() },
  registerPrompt: () => { throw notInitializedError() },
  callTool: () => Promise.resolve(notInitializedResult()),
  readResource: () => Promise.resolve(notInitializedResult()),
  getPrompt: () => Promise.resolve(notInitializedResult()),
}

/** 未初始化时的 Skills 操作占位 */
const notInitializedSkills: SkillsOperations = {
  register: () => { throw notInitializedError() },
  unregister: () => { throw notInitializedError() },
  get: () => { throw notInitializedError() },
  query: () => { throw notInitializedError() },
  execute: () => Promise.resolve(notInitializedResult()),
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
 * - `ai.skills` - 技能操作（注册、执行）
 * - `ai.config` - 当前配置
 * - `ai.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 *
 * // 初始化
 * ai.init({ llm: { model: 'gpt-4o-mini' } })
 *
 * // LLM 调用
 * const result = await ai.llm.chat({
 *     messages: [{ role: 'user', content: '你好' }]
 * })
 *
 * // 流式调用
 * for await (const chunk of ai.llm.chatStream({ messages: [...] })) {
 *     // 处理 chunk.choices[0].delta.content
 * }
 *
 * // 关闭
 * ai.close()
 * ```
 */
export const ai: AIService = {
  /** 初始化 AI 服务 */
  init(config?: AIConfigInput): Result<void, AIError> {
    // 关闭现有服务（如果存在）
    if (currentLLMProvider || currentMCPProvider || currentSkillsProvider) {
      currentLLMProvider = null
      currentMCPProvider = null
      currentSkillsProvider = null
      currentConfig = null
    }

    try {
      // 运行时校验并补齐默认值
      const normalizedConfig = AIConfigSchema.parse(config ?? {})

      // 创建各 Provider
      currentLLMProvider = createLLMProvider(normalizedConfig)
      currentMCPProvider = createMCPProvider(normalizedConfig)
      currentSkillsProvider = createSkillsProvider(normalizedConfig)
      currentConfig = normalizedConfig

      return ok(undefined)
    }
    catch (error) {
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: `Failed to initialize AI service: ${error}`,
        cause: error,
      })
    }
  },

  /** 获取 LLM 操作接口 */
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

  /** 获取 MCP 操作接口 */
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

  /** 获取 Skills 操作接口 */
  get skills(): SkillsOperations {
    if (!currentSkillsProvider) {
      return notInitializedSkills
    }

    return {
      register: <TInput, TOutput>(skill: Skill<TInput, TOutput>): void => {
        currentSkillsProvider!.register(skill)
      },
      unregister: (name: string): void => {
        currentSkillsProvider!.unregister(name)
      },
      get: (name: string): Skill | undefined => {
        return currentSkillsProvider!.get(name)
      },
      query: (query: SkillQuery): Skill[] => {
        return currentSkillsProvider!.query(query)
      },
      execute: <TInput, TOutput>(
        name: string,
        input: TInput,
        context?: SkillContext,
      ): Promise<Result<SkillResult<TOutput>, AIError>> => {
        return currentSkillsProvider!.execute(name, input, context)
      },
    }
  },

  /** 获取当前配置 */
  get config(): AIConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentLLMProvider !== null
  },

  /** 关闭 AI 服务 */
  close(): void {
    currentLLMProvider = null
    currentMCPProvider = null
    currentSkillsProvider = null
    currentConfig = null
  },
}
