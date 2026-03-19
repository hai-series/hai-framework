/**
 * @h-ai/kit — A2A 路由处理器
 *
 * 提供 SvelteKit 路由工厂：Agent Card 端点和 JSON-RPC 处理端点。
 * @module kit-a2a-helpers
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit'

import type { KitA2AHandlerConfig } from './kit-a2a-types.js'
import { createA2AApiKeyAuthenticator } from './kit-a2a-auth.js'

/**
 * 创建 Agent Card GET 处理器
 *
 * 返回当前 Agent 的 Agent Card（JSON），通常挂载在 `/.well-known/agent.json`。
 *
 * @param getAgentCard - 获取 Agent Card 的回调（通常调用 `ai.a2a.getAgentCard()`）
 * @returns SvelteKit GET 处理器
 *
 * @example
 * ```ts
 * // src/routes/.well-known/agent.json/+server.ts
 * import { ai } from '@h-ai/ai'
 * import { createAgentCardHandler } from '@h-ai/kit/a2a'
 *
 * export const GET = createAgentCardHandler(() => {
 *   const result = ai.a2a.getAgentCard()
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * })
 * ```
 */
export function createAgentCardHandler(
  getAgentCard: () => Record<string, unknown>,
): RequestHandler {
  return async () => {
    const card = getAgentCard()
    return new Response(JSON.stringify(card), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * 创建 A2A JSON-RPC POST 处理器
 *
 * 将 SvelteKit Request 转换为 JSON-RPC body，委托给 `handleRequest` 回调处理。
 * 支持单条响应和流式（SSE）响应。
 *
 * @param handleRequest - JSON-RPC 请求处理回调（通常调用 `ai.a2a.handleRequest()`）
 * @param config - 可选配置（认证等）
 * @returns SvelteKit POST 处理器
 *
 * @example
 * ```ts
 * // src/routes/a2a/+server.ts
 * import { ai } from '@h-ai/ai'
 * import { createA2AHandler } from '@h-ai/kit/a2a'
 *
 * export const POST = createA2AHandler(
 *   (body, context) => ai.a2a.handleRequest(body, context),
 * )
 * ```
 */
export function createA2AHandler(
  handleRequest: (body: unknown, context?: Record<string, unknown>) => Promise<{
    streaming: boolean
    body?: unknown
    stream?: AsyncGenerator<unknown, void, undefined>
  }>,
  config?: KitA2AHandlerConfig,
): RequestHandler {
  return async (event: RequestEvent) => {
    // 可选认证
    let context: Record<string, unknown> | undefined
    if (config?.authenticate) {
      try {
        const authFn = typeof config.authenticate === 'function'
          ? config.authenticate
          : createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })
        const authResult = await authFn(event)
        if (authResult === null) {
          return new Response(
            JSON.stringify({ error: { code: 'A2A_UNAUTHORIZED', message: 'A2A authentication required' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (authResult !== undefined) {
          context = authResult
        }
      }
      catch {
        return new Response(
          JSON.stringify({ error: { code: 'A2A_FORBIDDEN', message: 'A2A authentication failed' } }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    // 解析 JSON-RPC 请求体
    const requestBody = await event.request.json()
    const result = await handleRequest(requestBody, context)

    if (result.streaming && result.stream) {
      // 流式响应：SSE 格式
      const stream = result.stream
      const readableStream = new ReadableStream({
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

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // 单条响应
    return new Response(JSON.stringify(result.body), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
