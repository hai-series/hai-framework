/**
 * @h-ai/serv — 内部 RPC 访问控制 middleware
 * @module pipelines/serv-pipeline-require-internal-rpc
 */

import type { Context } from 'hono'
import type { ServRpcHttpConfig } from '../serv-config.js'
import type { ServMiddleware } from './serv-pipeline-types.js'
import { core, HaiCommonError } from '@h-ai/core'
import { readRemoteAddress } from '../serv-client-ip.js'
import { servM } from '../serv-i18n.js'
import { resolveRequestLocale } from '../serv-validation.js'
import { buildHaiErrorBody } from './serv-pipeline-helper.js'

const pipelineLogger = core.logger.child({ module: 'serv', scope: 'pipeline' })

/**
 * 内部 Node 连接信息读取器；按需加载平台子路径，缺失时内部 RPC 失败关闭，不信任转发头补造对端。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function peer(read: GetConnInfoFn, context: Context): string | undefined {
 *   return read(context).remote.address
 * }
 * // 地址来自平台 socket；缺失时内部 RPC 失败关闭。
 * ```
 */
type GetConnInfoFn = (c: Context) => { remote: { address?: string } }
let cachedGetConnInfo: GetConnInfoFn | null | undefined

async function resolveGetConnInfo(): Promise<GetConnInfoFn | null> {
  if (cachedGetConnInfo !== undefined)
    return cachedGetConnInfo
  try {
    const mod = await import('@hono/node-server/conninfo')
    cachedGetConnInfo = mod.getConnInfo as GetConnInfoFn
  }
  catch (cause) {
    pipelineLogger.warn('getConnInfo unavailable in this runtime; loopback/private-network access modes will fail closed', { error: cause })
    cachedGetConnInfo = null
  }
  return cachedGetConnInfo
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

/**
 * 限制内部 RPC 入口来源。
 *
 * 应用层兜底校验；生产仍应优先依赖内网、服务网格或网关策略。
 *
 * @param config - RPC 访问控制配置
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const middleware = requireInternalRPC({ prefix: '/rpc', access: 'loopback' })
 * // createApp 在内部 RPC handler 前挂载；连接信息缺失时拒绝，不能采信转发头。
 * ```
 */
export function requireInternalRPC(config: ServRpcHttpConfig): ServMiddleware {
  return async (c, next) => {
    // Step 1：先解析 locale，确保拒绝访问时也能返回本地化错误消息。
    const locale = resolveRequestLocale(c.req.raw.headers)

    // Step 2：若是 gateway-only 模式，直接校验网关注入的共享密钥 header。
    if (config.access === 'gateway-only') {
      const headerName = config.gatewayHeader ?? 'x-hai-internal-rpc'
      const received = c.req.header(headerName)
      if (!config.gatewaySecret || !received || !core.string.constantTimeEqual(received, config.gatewaySecret))
        return c.json(buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale })), 403)
      return next()
    }

    // Step 3：其余模式依赖远端 IP 判定来源是否合法；取不到 IP 时按 fail closed 处理。
    const ip = await getRequestRemoteAddress(c) ?? ''

    // Step 4：loopback 模式只允许本机来源。
    if (config.access === 'loopback' && !isLoopbackIP(ip))
      return c.json(buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale })), 403)

    // Step 5：private-network 模式允许内网来源（含 loopback）。
    if (config.access === 'private-network' && !isPrivateNetworkIP(ip))
      return c.json(buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale })), 403)

    // Step 6：通过校验后，请求才会真正进入内部 RPC handler。
    return next()
  }
}

async function getRequestRemoteAddress(c: Context): Promise<string | undefined> {
  // serv adapter 提供真实连接对端；内部 RPC 不使用转发后的客户端 IP。
  const remoteAddress = readRemoteAddress(c.env)
  if (remoteAddress)
    return remoteAddress
  const getConnInfo = await resolveGetConnInfo()
  if (!getConnInfo)
    return undefined
  try {
    return getConnInfo(c).remote.address
  }
  catch {
    return undefined
  }
}

function normalizeIpAddress(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
}

function isLoopbackIP(ip: string): boolean {
  const normalized = normalizeIpAddress(ip)
  return LOOPBACK_IPS.has(ip) || LOOPBACK_IPS.has(normalized)
}

function isPrivateNetworkIP(ip: string): boolean {
  const normalized = normalizeIpAddress(ip)
  if (isLoopbackIP(ip))
    return true
  if (normalized.startsWith('10.') || normalized.startsWith('192.168.'))
    return true
  const second = Number(normalized.split('.')[1])
  return normalized.startsWith('172.') && Number.isInteger(second) && second >= 16 && second <= 31
}
