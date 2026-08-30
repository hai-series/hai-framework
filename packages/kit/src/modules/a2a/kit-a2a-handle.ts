/**
 * @h-ai/kit — A2A Handle 拦截器
 *
 * 在 SvelteKit Handle Hook 中拦截 A2A 端点（Agent Card 发现 + JSON-RPC 处理），
 * 自动处理请求并返回 Response，不匹配时返回 null 由 Handle 继续后续流程。
 * @module kit-a2a-handle
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { HandleA2AConfig, HandleA2AOperations, HandleConfig } from '../../kit-types.js'
import { kitM } from '../../kit-i18n.js'
import { createA2AApiKeyAuthenticator } from './kit-a2a-auth.js'
import { createA2AHandler } from './kit-a2a-helpers.js'

// ─── 解析后的 A2A 内部配置 ───

/** A2A 解析后的内部配置 */
export interface ResolvedA2AConfig {
  operations: HandleA2AOperations
  cardPath: string
  rpcPath: string
  authenticate?: (event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>
}

// ─── A2A 配置解析 ───

/**
 * 解析 A2A 配置（简单模式 / 配置模式）
 *
 * - 简单模式：直接传入 `ai.a2a` 操作对象，使用默认路径
 * - 配置模式：传入 `{ operations, rpcPath?, cardPath?, authenticate? }`
 *
 * @param input - HandleConfig.a2a 配置
 * @returns 解析后的配置，或 `null` 表示未配置
 */
export function resolveA2AConfig(
  input: HandleConfig['a2a'],
): ResolvedA2AConfig | null {
  if (!input)
    return null

  // 简单模式：直接传入操作对象
  if ('getAgentCard' in input && 'handleRequest' in input) {
    return {
      operations: input as HandleA2AOperations,
      cardPath: '/.well-known/agent-card.json',
      rpcPath: '/a2a',
    }
  }

  // 配置模式：带 operations 字段
  const cfg = input as HandleA2AConfig
  return {
    operations: cfg.operations,
    cardPath: cfg.cardPath ?? '/.well-known/agent-card.json',
    rpcPath: cfg.rpcPath ?? '/a2a',
    authenticate: resolveAuthenticate(cfg.authenticate, cfg.operations),
  }
}

/**
 * 解析 authenticate 配置
 *
 * - `undefined` → 无认证
 * - `'apiKey'` → 从 Agent Card security 配置创建 API Key 认证器
 * - 函数 → 直接使用
 */
function resolveAuthenticate(
  authenticate: HandleA2AConfig['authenticate'],
  operations: HandleA2AOperations,
): ResolvedA2AConfig['authenticate'] {
  if (!authenticate)
    return undefined

  if (typeof authenticate === 'function')
    return authenticate

  // 'apiKey' 快捷方式：从 Agent Card 获取 security 配置
  const cardResult = operations.getAgentCard()
  const securitySchemes = cardResult.success && cardResult.data
    ? (cardResult.data as { securitySchemes?: Record<string, { type: string, in?: string, name?: string }> }).securitySchemes
    : undefined
  const apiKeyCfg = securitySchemes?.apiKey

  return createA2AApiKeyAuthenticator({
    in: apiKeyCfg?.in === 'query' ? 'query' : 'header',
    name: apiKeyCfg?.name ?? 'x-api-key',
  })
}

// ─── A2A 请求处理 ───

/**
 * 处理 A2A 端点请求
 *
 * 匹配 Agent Card GET 和 JSON-RPC POST 端点，返回 Response。
 * 不匹配时返回 `null`，由 Handle 继续后续流程。
 *
 * @param event - SvelteKit RequestEvent
 * @param requestId - 当前请求 ID（用于响应头）
 * @param config - 解析后的 A2A 配置
 * @returns 匹配时返回 Response，不匹配返回 null
 */
export async function handleA2ARequest(
  event: RequestEvent,
  requestId: string,
  config: ResolvedA2AConfig,
): Promise<Response | null> {
  const { pathname } = event.url

  // Agent Card 发现端点
  if (pathname === config.cardPath && event.request.method === 'GET') {
    const result = config.operations.getAgentCard()
    if (result.success) {
      return new Response(JSON.stringify(result.data), {
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      })
    }
    return new Response(
      JSON.stringify({ error: { code: 'A2A_NOT_CONFIGURED', message: kitM('kit_a2aCardUnavailable') } }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    )
  }

  // A2A JSON-RPC 端点
  if (pathname === config.rpcPath && event.request.method === 'POST') {
    // Hook 与显式路由共享认证、JSON-RPC 错误和流式生命周期逻辑。
    const handler = createA2AHandler(
      (body, context) => config.operations.handleRequest(body, context),
      { authenticate: config.authenticate },
    )
    const response = await handler(event)
    response.headers.set('X-Request-Id', requestId)
    return response
  }

  return null
}
