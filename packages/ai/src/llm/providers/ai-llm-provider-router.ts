/**
 * @h-ai/ai — LLM Provider 路由层
 *
 * 按每次请求解析出的 API 协议（`chat` / `responses` / `anthropic`）分派到具体 Provider，
 * 对上层 `ai.llm` 暴露统一的 `LLMProvider` 接口。OpenAI Provider 内部同时覆盖
 * Chat Completions 与 Responses 两种原生协议；Anthropic 走独立 Provider。
 * @module ai-llm-provider-router
 */

import type { AILLMFunctionsDeps, ChatCompletionChunk, ChatCompletionRequest, LLMProvider } from '../ai-llm-types.js'

import { resolveModelApi } from '../../ai-config.js'
import { createAnthropicProvider } from './ai-llm-provider-anthropic.js'
import { createOpenAIProvider } from './ai-llm-provider-openai.js'

/**
 * 创建按协议分派的 LLM Provider
 *
 * @param deps - LLM 子功能依赖（含校验后配置）
 * @returns 统一的 LLMProvider（内部按模型 `api` 路由）
 */
export function createLLMProvider(deps: AILLMFunctionsDeps): LLMProvider {
  const openai = createOpenAIProvider(deps)
  // Anthropic Provider 惰性创建：仅在实际使用到 anthropic 协议时初始化
  let anthropic: LLMProvider | undefined

  function getAnthropic(): LLMProvider {
    anthropic ??= createAnthropicProvider(deps)
    return anthropic
  }

  /** 按请求解析协议并选择 Provider（chat / responses → OpenAI；anthropic → Anthropic） */
  function pick(request: ChatCompletionRequest): LLMProvider {
    const api = resolveModelApi(deps.config.llm, request.model, request.tempModel?.api)
    return api === 'anthropic' ? getAnthropic() : openai
  }

  return {
    chat: request => pick(request).chat(request),
    chatStream: (request): AsyncIterable<ChatCompletionChunk> => pick(request).chatStream(request),
    listModels: () => {
      const api = deps.config.llm.api ?? 'chat'
      return api === 'anthropic' ? getAnthropic().listModels() : openai.listModels()
    },
  }
}
