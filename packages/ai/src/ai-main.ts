/**
 * @h-ai/ai — AI 服务主入口
 *
 * 提供统一的 `ai` 对象，聚合所有 AI 操作功能。
 */

import type { Result } from '@h-ai/core'

import type { AIConfig, AIConfigInput, AIError } from './ai-config.js'
import type { AIFunctions } from './ai-types.js'
import type { LLMOperations, StreamOperations, ToolsOperations } from './llm/ai-llm-types.js'
import type { MCPOperations } from './mcp/ai-mcp-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIConfigSchema, AIErrorCode } from './ai-config.js'
import { aiM } from './ai-i18n.js'
import { createAILLMFunctions } from './llm/ai-llm-functions.js'
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './llm/ai-llm-stream.js'
import { createToolRegistry, defineTool } from './llm/ai-llm-tool.js'
import { createAIMCPFunctions } from './mcp/ai-mcp-functions.js'

// ─── 内部状态 ───

/** 当前配置（`null` 表示未初始化） */
let currentConfig: AIConfig | null = null
/** 当前 LLM 操作实例 */
let currentLLM: LLMOperations | null = null
/** 当前 MCP 操作实例 */
let currentMCP: MCPOperations | null = null

// ─── 未初始化占位 ───

/** 创建未初始化错误工具（统一的 NOT_INITIALIZED 响应） */
const notInitialized = core.module.createNotInitializedKit<AIError>(
  AIErrorCode.NOT_INITIALIZED,
  () => aiM('ai_notInitialized'),
)

/**
 * LLM 未初始化占位
 *
 * 异步方法返回 NOT_INITIALIZED Result。
 * chatStream 是 async generator，无法返回 Result，
 * 只能在迭代时抛出异常通知调用方。
 */
const notInitializedLLM: LLMOperations = {
  chat: () => Promise.resolve(notInitialized.result()),
  async* chatStream() {
    throw notInitialized.error()
  },
  listModels: () => Promise.resolve(notInitialized.result()),
}

/** MCP 未初始化占位：所有方法返回 NOT_INITIALIZED 错误 */
const notInitializedMCP: MCPOperations = {
  registerTool: () => notInitialized.result(),
  registerResource: () => notInitialized.result(),
  registerPrompt: () => notInitialized.result(),
  callTool: () => Promise.resolve(notInitialized.result()),
  readResource: () => Promise.resolve(notInitialized.result()),
  getPrompt: () => Promise.resolve(notInitialized.result()),
}

// ─── 纯函数操作（不依赖初始化） ───

const toolsOperations: ToolsOperations = {
  define: defineTool,
  createRegistry: createToolRegistry,
}

const streamOperations: StreamOperations = {
  createProcessor: createStreamProcessor,
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
 * import { ai } from '@h-ai/ai'
 *
 * // 初始化
 * ai.init({ llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_OPENAI_API_KEY } })
 *
 * // LLM 调用
 * const result = await ai.llm.chat({
 *   messages: [{ role: 'user', content: '你好' }],
 * })
 *
 * // 关闭
 * ai.close()
 * ```
 */
export const ai: AIFunctions = {
  init(config?: AIConfigInput): Result<void, AIError> {
    // 关闭旧实例
    if (currentConfig) {
      currentLLM = null
      currentMCP = null
      currentConfig = null
    }

    try {
      const parsed = AIConfigSchema.parse(config ?? {})

      // 创建 LLM 子功能
      const llmFunctions = createAILLMFunctions(parsed)
      currentLLM = llmFunctions.llm

      // 创建 MCP 子功能
      currentMCP = createAIMCPFunctions({ config: parsed })

      currentConfig = parsed
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: AIErrorCode.CONFIGURATION_ERROR,
        message: aiM('ai_initFailed', {
          params: { error: String(error) },
        }),
        cause: error,
      })
    }
  },

  get llm(): LLMOperations { return currentLLM ?? notInitializedLLM },
  get mcp(): MCPOperations { return currentMCP ?? notInitializedMCP },
  get tools(): ToolsOperations { return toolsOperations },
  get stream(): StreamOperations { return streamOperations },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  close(): void {
    currentLLM = null
    currentMCP = null
    currentConfig = null
  },
}
