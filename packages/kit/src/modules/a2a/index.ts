/**
 * @h-ai/kit — A2A 模块导出
 *
 * SvelteKit 与 A2A 协议集成
 * @module index
 */

import { createA2AApiKeyAuthenticator } from './kit-a2a-auth.js'
import { handleA2ARequest, resolveA2AConfig } from './kit-a2a-handle.js'
import { createA2AHandler, createAgentCardHandler } from './kit-a2a-helpers.js'

export type { A2AApiKeyAuthConfig } from './kit-a2a-auth.js'
export type { ResolvedA2AConfig } from './kit-a2a-handle.js'

export * from './kit-a2a-types.js'

/**
 * Kit a2a 子路径的统一入口。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * // 从专用子路径读取 A2A 配置解析方法。
 * const resolveConfig = kit.a2a.resolveConfig
 * void resolveConfig
 * ```
 */
export const kit = {
  a2a: {
    createApiKeyAuthenticator: createA2AApiKeyAuthenticator,
    resolveConfig: resolveA2AConfig,
    handleRequest: handleA2ARequest,
    createAgentCardHandler,
    createHandler: createA2AHandler,
  },
}
