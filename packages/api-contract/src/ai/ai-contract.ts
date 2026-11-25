/**
 * 将 AI 各子模块的端点装配成默认契约和单独挂载的可选契约。
 * @module ai-contract
 */

import { aiAudioContract } from './audio/ai-audio-contract.js'
import { aiChatContract, aiChatStreamingContract } from './chats/ai-chat-contract.js'
import { aiImageContract } from './images/ai-image-contract.js'
import { aiMemoryReadContract, aiMemoryWriteContract } from './memories/ai-memory-contract.js'
import { aiSessionContract } from './sessions/ai-session-contract.js'

/**
 * AI 领域 oRPC contract。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.ai
 * void contract
 * ```
 */
export const aiContract = {
  chats: aiChatContract,
  memories: aiMemoryReadContract,
  sessions: aiSessionContract,
}

/**
 * ai 领域公开 procedure 契约的完整类型。
 * @example
 * ```ts
 *
 * import { type AiContract, apiContract } from '@h-ai/api-contract'
 *
 * const contract: AiContract = apiContract.ai
 * void contract
 * ```
 */
export type AiContract = typeof aiContract

/**
 * AI 可选路由。应用将需要的路由与默认 AI 契约按分组组合。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const path = apiContract.pathOf(apiContract.extensions.ai.chats.streamCompletion)
 * void path
 * ```
 */
export const aiOptionalContract = {
  chats: aiChatStreamingContract,
  memories: aiMemoryWriteContract,
  audio: aiAudioContract,
  images: aiImageContract,
}

/**
 * AI 可选 HTTP 路由树。
 * @example
 * ```ts
 * import { type AiExtensionContract, apiContract } from '@h-ai/api-contract'
 *
 * const extensions: AiExtensionContract = apiContract.extensions.ai
 * void extensions
 * ```
 */
export type AiExtensionContract = typeof aiOptionalContract
