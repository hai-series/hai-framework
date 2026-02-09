/**
 * @hai/ai — LLM 子功能工厂
 *
 * 组装 LLM 操作：Provider + 工具 + 流处理器。
 */

import type { AIConfig } from '../ai-config.js'
import type { LLMOperations, StreamOperations, ToolsOperations } from './ai-llm-types.js'

import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './ai-llm-stream.js'
import { createToolRegistry, defineTool } from './ai-llm-tool.js'
import { createOpenAIProvider } from './providers/ai-llm-provider-openai.js'

// ─── LLM 子功能 ───

/** LLM 子功能创建结果 */
export interface AILLMFunctions {
  /** LLM 操作接口（对话 / 流式对话 / 模型列表） */
  llm: LLMOperations
  /** 工具操作接口（定义工具 / 创建注册表） */
  tools: ToolsOperations
  /** 流处理操作接口（流处理器 / SSE 编解码） */
  stream: StreamOperations
}

/**
 * 创建 LLM 相关的全部子功能
 *
 * 根据配置创建 OpenAI Provider，组装 LLM、工具、流处理三个操作接口。
 *
 * @param config - 校验后的 AI 配置
 * @returns `{ llm, tools, stream }` 三个操作接口
 */
export function createAILLMFunctions(config: AIConfig): AILLMFunctions {
  const provider = createOpenAIProvider({ config })

  const llm: LLMOperations = {
    chat: request => provider.chat(request),
    chatStream: request => provider.chatStream(request),
    listModels: () => provider.listModels(),
  }

  const tools: ToolsOperations = {
    define: defineTool,
    createRegistry: createToolRegistry,
  }

  const stream: StreamOperations = {
    createProcessor: createStreamProcessor,
    collect: collectStream,
    createSSEDecoder,
    encodeSSE,
  }

  return { llm, tools, stream }
}
