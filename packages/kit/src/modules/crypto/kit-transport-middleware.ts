/**
 * @h-ai/kit — 传输加密中间件
 *
 * SvelteKit 中间件，自动对请求/响应进行传输加密解密。
 * @module kit-transport-middleware
 */

import type { Middleware } from '../../kit-types.js'
import type { TransportEncryptionConfig, TransportEncryptionManager } from './kit-crypto-types.js'
import { kitM } from '../../kit-i18n.js'
import { createTransportEncryption, isValidEncryptedPayload } from './kit-transport-encryption.js'

/**
 * 创建传输加密中间件
 *
 * @param config - 传输加密配置
 * @returns SvelteKit 中间件
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * import { kit } from '@h-ai/kit'
 *
 * // 传输加密通过 createHandle 的 crypto 配置自动启用：
 * export const handle = kit.createHandle({
 *   crypto: { crypto, transport: true },
 * })
 * ```
 */
export function transportEncryptionMiddleware(config: TransportEncryptionConfig): Middleware {
  // 未启用时直接透传
  if (!config.enabled) {
    return async (_context, next) => next()
  }

  const keyExchangePath = config.keyExchangePath ?? '/api/kit/key-exchange'
  const excludePaths = config.excludePaths ?? []
  const encryptResponse = config.encryptResponse ?? true
  const requireEncryption = config.requireEncryption ?? true

  // 初始化传输加密管理器
  const result = createTransportEncryption(config.crypto)
  if (!result.success) {
    if (!requireEncryption) {
      // 渐进迁移模式允许降级
      return async (_context, next) => next()
    }

    return async (context, next) => {
      if (shouldExclude(context.event.url.pathname, excludePaths, keyExchangePath)) {
        return next()
      }
      return jsonError(503, kitM('kit_transportKeyGenerationFailed'))
    }
  }
  const manager = result.data

  return async (context, next) => {
    const { event } = context
    const pathname = event.url.pathname

    // 密钥交换端点：委托给 keyExchangeHandler
    if (pathname === keyExchangePath && event.request.method === 'POST') {
      return handleKeyExchange(manager, event.request)
    }

    // 排除路径不做加解密
    if (shouldExclude(pathname, excludePaths, keyExchangePath)) {
      return next()
    }

    // 请求头中无 X-Client-Id 时的处理
    const clientId = event.request.headers.get('X-Client-Id')
    if (!clientId) {
      if (requireEncryption) {
        // 强制加密模式：缺少 X-Client-Id 说明未完成密钥交换，拒绝请求
        return new Response(
          JSON.stringify({ error: kitM('kit_transportClientIdRequired') }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // 非强制模式：透传明文（渐进式迁移兼容）
      return next()
    }

    // 检查客户端是否已注册
    const clientPublicKey = manager.getClientPublicKey(clientId)
    if (!clientPublicKey) {
      return new Response(
        JSON.stringify({ error: kitM('kit_transportClientKeyNotFound') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // ── 解密请求 ──
    try {
      if (hasBody(event.request.method)) {
        const bodyText = await event.request.clone().text()
        if (bodyText) {
          let payload: unknown
          try {
            payload = JSON.parse(bodyText) as unknown
          }
          catch {
            if (requireEncryption) {
              return jsonError(400, kitM('kit_transportInvalidPayload'))
            }
          }

          if (payload !== undefined) {
            if (!isValidEncryptedPayload(payload)) {
              if (requireEncryption) {
                return jsonError(400, kitM('kit_transportInvalidPayload'))
              }
            }
            else {
              const plaintext = manager.decryptRequest(payload)
              // 重建请求，替换为解密后的明文
              const newRequest = new Request(event.request.url, {
                method: event.request.method,
                headers: new Headers(event.request.headers),
                body: plaintext,
              })
              // 将解密后的请求注入 locals，供后续中间件/端点使用
              Object.defineProperty(event, 'request', {
                value: newRequest,
                writable: true,
                configurable: true,
              })
            }
          }
        }
      }
    }
    catch {
      return jsonError(400, kitM('kit_transportDecryptFailed'))
    }

    // ── 执行后续中间件/端点 ──
    const response = await next()

    // ── 加密响应 ──
    if (!encryptResponse) {
      return response
    }

    // 跳过非 JSON 响应和大体积响应（>1MB），避免内存问题
    const contentType = response.headers.get('Content-Type') ?? ''
    const contentLength = response.headers.get('Content-Length')
    const noBodyResponse = response.status === 204 || response.status === 205 || response.status === 304
    if (!contentType.includes('application/json')) {
      if (requireEncryption && !noBodyResponse && contentLength !== '0') {
        return jsonError(500, kitM('kit_transportEncryptFailed'))
      }
      return response
    }
    if (contentLength && Number.parseInt(contentLength, 10) > 1_048_576) {
      if (requireEncryption) {
        return jsonError(500, kitM('kit_transportEncryptFailed'))
      }
      return response
    }

    try {
      const responseBody = await response.text()
      if (!responseBody) {
        return response
      }

      const encryptedPayload = manager.encryptResponse(clientId, responseBody)
      const headers = new Headers(response.headers)
      headers.set('Content-Type', 'application/json')
      headers.set('X-Encrypted', 'true')
      return new Response(
        JSON.stringify(encryptedPayload),
        {
          status: response.status,
          statusText: response.statusText,
          headers,
        },
      )
    }
    catch {
      if (requireEncryption) {
        return jsonError(500, kitM('kit_transportEncryptFailed'))
      }
      return response
    }
  }
}

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * 处理密钥交换 POST 请求
 *
 * 接收客户端公钥，注册并返回服务端公钥与 clientId。
 *
 * @param manager - 传输加密管理器
 * @param request - 原始 Request
 * @returns JSON Response
 */
async function handleKeyExchange(
  manager: TransportEncryptionManager,
  request: Request,
): Promise<Response> {
  try {
    const body = await request.json() as { clientPublicKey?: string }

    if (!body.clientPublicKey || typeof body.clientPublicKey !== 'string') {
      return new Response(
        JSON.stringify({ error: kitM('kit_transportInvalidPayload') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const clientId = manager.registerClientKey(body.clientPublicKey)
    const serverPublicKey = manager.getServerPublicKey()

    return new Response(
      JSON.stringify({ serverPublicKey, clientId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  catch {
    return new Response(
      JSON.stringify({ error: kitM('kit_transportKeyExchangeFailed') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

/**
 * 判断路径是否应排除传输加解密
 *
 * @param pathname - 当前请求路径
 * @param excludePaths - 配置的排除列表
 * @param keyExchangePath - 密钥交换端点路径
 * @returns 是否排除
 */
function shouldExclude(pathname: string, excludePaths: string[], keyExchangePath: string): boolean {
  if (pathname === keyExchangePath)
    return true
  return excludePaths.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * 判断 HTTP 方法是否可能携带请求体
 *
 * @param method - HTTP 方法字符串
 * @returns `true` 表示 POST / PUT / PATCH / DELETE
 */
function hasBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}
