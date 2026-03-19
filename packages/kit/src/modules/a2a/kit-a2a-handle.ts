/**
 * @h-ai/kit — A2A Handle 拦截器
 *
 * 在 SvelteKit Handle Hook 中拦截 A2A 端点（Agent Card 发现 + JSON-RPC 处理），
 * 自动处理请求并返回 Response，不匹配时返回 null 由 Handle 继续后续流程。
 * @module kit-a2a-handle
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { HandleA2AConfig, HandleA2AOperations, HandleConfig } from '../../kit-types.js'
import { createA2AApiKeyAuthenticator } from './kit-a2a-auth.js'

// ─── 解析后的 A2A 内部配置 ───

/** A2A 解析后的内部配置 */
export interface ResolvedA2AConfig {
  operations: HandleA2AOperations
  cardPath: string
  rpcPath: string
  authenticate?: (event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>
}

interface A2AApiKeySecurityConfig {
  in: 'header' | 'query'
  name: string
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
    const operations = input as HandleA2AOperations
    return {
      operations,
      cardPath: '/.well-known/agent.json',
      rpcPath: '/a2a',
      authenticate: createAgentCardSecurityAuthenticator(operations),
    }
  }

  // 配置模式：带 operations 字段
  const cfg = input as HandleA2AConfig
  return {
    operations: cfg.operations,
    cardPath: cfg.cardPath ?? '/.well-known/agent.json',
    rpcPath: cfg.rpcPath ?? '/a2a',
    authenticate: resolveAuthenticate(cfg.authenticate, cfg.operations),
  }
}

/**
 * 解析 authenticate 配置
 *
 * - `undefined` → 无认证
 * - `'apiKey'` → 在请求时根据 Agent Card security 配置创建 API Key 认证器
 * - 函数 → 直接使用
 */
function resolveAuthenticate(
  authenticate: HandleA2AConfig['authenticate'],
  operations: HandleA2AOperations,
): ResolvedA2AConfig['authenticate'] {
  if (typeof authenticate === 'function')
    return authenticate

  if (authenticate !== 'apiKey')
    return undefined

  return async (event: RequestEvent) => {
    const apiKeyCfg = getApiKeySecurityFromAgentCard(operations)
    const auth = createA2AApiKeyAuthenticator({
      in: apiKeyCfg?.in ?? 'header',
      name: apiKeyCfg?.name ?? 'x-api-key',
    })
    return auth(event)
  }
}

function createAgentCardSecurityAuthenticator(
  operations: HandleA2AOperations,
): ResolvedA2AConfig['authenticate'] {
  return async (event: RequestEvent) => {
    const apiKeyCfg = getApiKeySecurityFromAgentCard(operations)
    if (!apiKeyCfg)
      return undefined

    const auth = createA2AApiKeyAuthenticator(apiKeyCfg)
    return auth(event)
  }
}

function getApiKeySecurityFromAgentCard(
  operations: HandleA2AOperations,
): A2AApiKeySecurityConfig | undefined {
  const cardResult = operations.getAgentCard()
  if (!cardResult.success || !cardResult.data)
    return undefined

  const security = (cardResult.data as Record<string, unknown>).security as { apiKey?: A2AApiKeySecurityConfig } | undefined
  return security?.apiKey
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
      JSON.stringify({ error: { code: 'A2A_NOT_CONFIGURED', message: 'Agent card not available' } }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    )
  }

  // A2A JSON-RPC 端点
  if (pathname === config.rpcPath && event.request.method === 'POST') {
    // 可选认证
    let context: Record<string, unknown> | undefined
    if (config.authenticate) {
      try {
        const authResult = await config.authenticate(event)
        if (authResult === null) {
          return new Response(
            JSON.stringify({ error: { code: 'A2A_UNAUTHORIZED', message: 'A2A authentication required' } }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
          )
        }
        if (authResult !== undefined) {
          context = authResult
        }
      }
      catch {
        return new Response(
          JSON.stringify({ error: { code: 'A2A_FORBIDDEN', message: 'A2A authentication failed' } }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
        )
      }
    }

    const body = await event.request.json()
    const result = await config.operations.handleRequest(body, context)

    if (result.streaming && result.stream) {
      const stream = result.stream
      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          try {
            for await (const chunk of stream) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            }
          }
          finally {
            controller.close()
          }
        },
      })
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Request-Id': requestId,
        },
      })
    }

    return new Response(JSON.stringify(result.body), {
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    })
  }

  return null
}
