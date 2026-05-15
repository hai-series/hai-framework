/**
 * @h-ai/serv — Hono middleware 集合
 *
 * 提供应用层通用的 Hono middleware：安全响应头、请求 ID 序列化、内部 RPC 源 IP 到网关密钥验证。
 * @module pipeline/hono
 */

import type { MiddlewareHandler } from 'hono'
import type { ServRpcHttpConfig } from '../app/http-config.js'

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

/**
 * 添加基础安全响应头。
 *
 * 设置 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。
 *
 * @returns Hono middleware
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    await next()
  }
}

/**
 * 确保每个请求都有 requestId。
 *
 * 若客户端已传入 `x-request-id`，则保留原值；否则自动生成 UUID v4。
 *
 * @returns Hono middleware
 */
export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const existing = c.req.header('x-request-id')
    if (!existing) {
      c.header('x-request-id', crypto.randomUUID())
    }
    await next()
  }
}

/**
 * 限制内部 RPC 入口来源。
 *
 * 这里是应用层兜底校验；生产仍应优先依赖内网、服务网格或网关策略。
 *
 * @param config - RPC 访问控制配置
 * @returns Hono middleware
 */
export function requireInternalRPC(config: ServRpcHttpConfig): MiddlewareHandler {
  return async (c, next) => {
    if (config.access === 'gateway-only') {
      const headerName = config.gatewayHeader ?? 'x-hai-internal-rpc'
      const secret = config.gatewaySecret
      const received = c.req.header(headerName)

      if (!secret || received !== secret) {
        return c.json({ success: false, error: 'Forbidden' }, 403)
      }

      return next()
    }

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? c.req.header('x-real-ip')
      ?? ''

    if (config.access === 'loopback' && !LOOPBACK_IPS.has(ip)) {
      return c.json({ success: false, error: 'Forbidden' }, 403)
    }

    if (config.access === 'private-network' && !isPrivateNetworkIP(ip)) {
      return c.json({ success: false, error: 'Forbidden' }, 403)
    }

    return next()
  }
}

function isPrivateNetworkIP(ip: string): boolean {
  if (LOOPBACK_IPS.has(ip)) {
    return true
  }

  if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return true
  }

  const second = Number(ip.split('.')[1])
  return ip.startsWith('172.') && Number.isInteger(second) && second >= 16 && second <= 31
}
