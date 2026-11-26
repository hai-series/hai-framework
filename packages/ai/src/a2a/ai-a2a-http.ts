/**
 * @h-ai/ai — 与宿主无关的 A2A Agent Card 和 JSON-RPC HTTP 入口。
 * @module ai-a2a-http
 */

import type { A2AHandleResult, A2AHttpHandler, A2AHttpIdentity, A2AHttpOptions, A2AOperations } from './ai-a2a-types.js'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'a2a-http' })
// 留出 JSON-RPC 信封和编码开销，消息正文仍由 A2A 任务层限制。
const MAX_RPC_REQUEST_BYTES = 2 * 1024 * 1024

function isEndpointPath(path: string): boolean {
  return /^\/[\w.-]+(?:\/[\w.-]+)*$/.test(path) && !path.split('/').some(part => part === '.' || part === '..')
}

async function authenticateRequest(
  request: Request,
  authenticate: Exclude<A2AHttpOptions['authenticate'], false>,
  getAgentCard: A2AOperations['getAgentCard'],
): Promise<A2AHttpIdentity | null | undefined> {
  if (typeof authenticate === 'function')
    return authenticate(request)

  const card = getAgentCard()
  const apiKey = card.success ? card.data.securitySchemes?.apiKey?.apiKeySecurityScheme : undefined
  const name = apiKey?.name ?? 'x-api-key'
  const credential = apiKey?.location === 'query'
    ? new URL(request.url).searchParams.get(name)
    : request.headers.get(name)
  if (!credential)
    return null
  const verified = await authenticate.verifyApiKey(credential)
  if (!verified.success) {
    if (verified.error.httpStatus !== undefined && verified.error.httpStatus >= 500)
      throw new Error(aiM('ai_a2aHttpFailed'))
    return null
  }
  const { userId, id, scopes, permissions } = verified.data
  return {
    agentId: userId,
    apiKeyId: id,
    scopes,
    permissions,
  }
}

/**
 * 读取 RPC 正文后的判定。通过后协议层仍需校验内容。
 *
 * @example 模块内部上下文
 * ```ts
 * async function parseOrdersRpc(request: Request): Promise<RpcBody> {
 *   return readRpcBody(request) // 损坏 JSON 为 400，超过正文容量为 413。
 * }
 * ```
 */
type RpcBody = { success: true, value: unknown } | { success: false, status: 400 | 413 }

async function readRpcBody(request: Request): Promise<RpcBody> {
  const reader = request.body?.getReader()
  if (!reader)
    return { success: false, status: 400 }
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        return {
          success: true,
          value: JSON.parse(text + decoder.decode()),
        }
      }
      bytes += value.byteLength
      if (bytes > MAX_RPC_REQUEST_BYTES) {
        void reader.cancel().catch(() => {})
        return { success: false, status: 413 }
      }
      text += decoder.decode(value, { stream: true })
    }
  }
  catch {
    return { success: false, status: 400 }
  }
  finally {
    reader.releaseLock()
  }
}

function eventStream(
  source: AsyncGenerator<unknown, void, undefined>,
  requestSignal: AbortSignal,
  subscription: AbortController,
  headers: Headers,
): Response {
  const encoder = new TextEncoder()
  let finished = false
  let abort: () => void
  const cleanup = () => {
    finished = true
    requestSignal.removeEventListener('abort', abort)
  }
  const stop = async () => {
    cleanup()
    subscription.abort()
    try {
      await source.return()
    }
    catch {
      logger.warn('A2A stream release failed', {
        requestId: headers.get('X-Request-Id'),
      })
    }
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (finished)
          return
        controller.close()
        void stop()
      }
      if (requestSignal.aborted)
        abort()
      else
        requestSignal.addEventListener('abort', abort, { once: true })
    },
    async pull(controller) {
      try {
        const event = await source.next()
        if (finished)
          return
        if (event.done) {
          cleanup()
          controller.close()
        }
        else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.value)}\n\n`))
        }
      }
      catch {
        if (finished)
          return
        logger.warn('A2A stream failed', {
          requestId: headers.get('X-Request-Id'),
        })
        controller.error(new Error(aiM('ai_a2aHttpFailed')))
        await stop()
      }
    },
    cancel: stop,
  })
  headers.set('Content-Type', 'text/event-stream')
  headers.set('Cache-Control', 'no-cache, no-transform')
  return new Response(body, { headers })
}

/**
 * 将 Agent Card 和 JSON-RPC 挂载到两个明确的 Fetch 路径。
 *
 * @param options - 挂载路径和应用提供的认证策略。省略路径时使用标准发现路径和 /a2a。
 * @param operations - 读取卡片和处理协议的 A2A 操作。
 * @param operations.getAgentCard - 读取当前执行器公布的 Agent Card。
 * @param operations.handleRequest - 处理已核验的请求并接收订阅取消信号。
 * @returns 宿主可调用的请求处理器，路由未匹配时返回 null。
 * @throws 路径无效、重复或缺少认证策略时抛出 TypeError。
 *
 * @example 模块内部上下文
 * ```ts
 * function mountOrders(getAgentCard: A2AOperations['getAgentCard'], handleRequest: A2AOperations['handleRequest'], authenticate: A2AHttpOptions['authenticate']) {
 *   return createA2AHttpHandler({ rpcPath: '/partners/orders', authenticate }, { getAgentCard, handleRequest })
 * }
 * ```
 */
export function createA2AHttpHandler(
  options: A2AHttpOptions,
  operations: {
    getAgentCard: A2AOperations['getAgentCard']
    handleRequest: (body: unknown, caller: A2AHttpIdentity | undefined, signal: AbortSignal) => Promise<A2AHandleResult>
  },
): A2AHttpHandler {
  const { cardPath = '/.well-known/agent-card.json', rpcPath = '/a2a', authenticate } = options
  if (!isEndpointPath(cardPath) || !isEndpointPath(rpcPath) || cardPath === rpcPath)
    throw new TypeError(aiM('ai_a2aHttpInvalidPaths'))
  if (authenticate !== false && typeof authenticate !== 'function' && typeof authenticate?.verifyApiKey !== 'function')
    throw new TypeError(aiM('ai_a2aHttpInvalidAuthentication'))

  return Object.freeze({
    cardPath,
    rpcPath,
    async handleRequest(request: Request, requestId?: string) {
      const path = new URL(request.url).pathname
      const isCard = path === cardPath && request.method === 'GET'
      const isRpc = path === rpcPath && request.method === 'POST'
      if (!isCard && !isRpc)
        return null

      const headers = new Headers()
      if (requestId)
        headers.set('X-Request-Id', requestId)
      if (isCard) {
        const card = operations.getAgentCard()
        return card.success
          ? Response.json(card.data, { headers })
          : Response.json({
              error: {
                code: 'A2A_NOT_CONFIGURED',
                message: aiM('ai_a2aNotConfigured'),
              },
            }, { status: 503, headers })
      }

      let caller: A2AHttpIdentity | undefined
      if (authenticate !== false) {
        try {
          caller = await authenticateRequest(request, authenticate, operations.getAgentCard) ?? undefined
        }
        catch {
          logger.warn('A2A authenticator unavailable', { requestId })
          return Response.json({
            error: {
              code: 'A2A_AUTH_UNAVAILABLE',
              message: aiM('ai_a2aHttpFailed'),
            },
          }, { status: 503, headers })
        }
        if (!caller?.agentId?.trim()) {
          return Response.json({
            error: {
              code: 'A2A_AUTH_FAILED',
              message: aiM('ai_a2aHttpAuthFailed'),
            },
          }, { status: 401, headers })
        }
      }

      const body = await readRpcBody(request)
      if (!body.success) {
        const tooLarge = body.status === 413
        return Response.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: tooLarge
              ? -32600
              : -32700,
            message: aiM(tooLarge ? 'ai_a2aHttpBodyTooLarge' : 'ai_a2aHttpInvalidJson'),
          },
        }, { status: body.status, headers })
      }

      const subscription = new AbortController()
      const signal = AbortSignal.any([request.signal, subscription.signal])
      const result = await operations.handleRequest(body.value, caller, signal)
      if (result.streaming && result.stream)
        return eventStream(result.stream, request.signal, subscription, headers)
      return Response.json(result.body, { headers })
    },
  })
}
