/** 内置 LLM 适配器共享契约，不是 ai.init 的扩展入口。 */
import type { HaiResult } from '@h-ai/core'
import type { AIConfig } from '../../ai-config.js'
import type { ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse } from '../ai-llm-types.js'

// ─── LLM Provider 接口 ───

/**
 * LLM Provider 接口
 *
 * 底层 API 适配层，当前内置 OpenAI 兼容实现。
 * @internal
 * @example
 * ```ts
 * // 模块内部上下文：统一适配器返回 HaiResult，由调用层处理失败。
 * async function complete(provider: LLMProvider, request: ChatCompletionRequest) {
 *   const response = await provider.chat(request)
 *   if (!response.success)
 *     return response
 *   return response.data.choices[0]?.message.content ?? ''
 * }
 * ```
 */
export interface LLMProvider {
  /** 发送聊天请求并获取完整响应 */
  chat: (request: ChatCompletionRequest) => Promise<HaiResult<ChatCompletionResponse>>
  /** 发送聊天请求并获取流式响应（逐 chunk 产出） */
  chatStream: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  /** 获取可用模型列表 */
  listModels: () => Promise<HaiResult<string[]>>
}

// ─── LLM 工厂依赖 ───

/**
 * LLM 子功能工厂依赖（内部使用）。
 * @internal
 * @example
 * ```ts
 * // 模块内部上下文：共享校验后的配置，模型请求仍由统一路由分派。
 * function bindConfig(config: AIConfig): AILLMFunctionsDeps {
 *   return { config }
 * }
 * ```
 */
export interface AILLMFunctionsDeps {
  /** 校验后的 AI 配置 */
  config: AIConfig
}
