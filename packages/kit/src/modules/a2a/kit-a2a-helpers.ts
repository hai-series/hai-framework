/**
 * @h-ai/kit — A2A 路由处理器
 *
 * 提供 SvelteKit 路由工厂：Agent Card 端点和 JSON-RPC 处理端点。
 * @module kit-a2a-helpers
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit'

import type { KitA2AHandlerConfig } from './kit-a2a-types.js'
import { kitM } from '../../kit-i18n.js'
import { createA2AApiKeyAuthenticator } from './kit-a2a-auth.js'

/**
 * 创建 Agent Card GET 处理器
 *
 * 返回当前 Agent 的 Agent Card（JSON），通常挂载在 `/.well-known/agent-card.json`。
 *
 * @param getAgentCard - 获取 Agent Card 的回调（通常调用 `ai.a2a.getAgentCard()`）
 * @returns SvelteKit GET 处理器
 *
 * @example
 * ```ts
 * // src/routes/.well-known/agent-card.json/+server.ts
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
  getAgentCard: () => object,
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
      const authFn = typeof config.authenticate === 'function'
        ? config.authenticate
        : createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })
      const authResult = await authFn(event)
      if (!authResult)
        return Response.json({ error: { code: 'A2A_AUTH_FAILED', message: kitM('kit_a2aAuthFailed') } }, { status: 401 })
      context = authResult
    }

    // 解析 JSON-RPC 请求体
    let requestBody: unknown
    try {
      requestBody = await event.request.json()
    }
    catch {
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: kitM('kit_a2aParseError') } }, { status: 400 })
    }
    const result = await handleRequest(requestBody, context)

    if (result.streaming && result.stream) {
      // 流式响应：SSE 格式
      const stream = result.stream
      const readableStream = new ReadableStream({
        // 按下游拉取推进迭代，避免 start 中无界预读；断开时释放生成器。
        async pull(controller) {
          try {
            const chunk = await stream.next()
            if (chunk.done)
              controller.close()
            else
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk.value)}\n\n`))
          }
          catch (error) {
            controller.error(error)
          }
        },
        async cancel() {
          await stream.return()
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
