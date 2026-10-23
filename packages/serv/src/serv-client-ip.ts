/**
 * 可信客户端地址解析。只信任运行时提供的对端地址与显式配置的代理。
 * @module serv-client-ip
 */
import { BlockList, isIP } from 'node:net'

/**
 * Hono runtime bindings 是 unknown，先收敛可信元数据的形状。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const peer = readRemoteAddress({ remoteAddress: '192.0.2.10' })
 * const untrusted = readRemoteAddress({ 'x-forwarded-for': '192.0.2.20' })
 * ```
 */
export function readRemoteAddress(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || !('remoteAddress' in metadata) || typeof metadata.remoteAddress !== 'string')
    return undefined
  return normalizeClientIp(metadata.remoteAddress)
}

/**
 * 校验并规范化 IP；拒绝主机名、端口和其它非地址值。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const mapped = normalizeClientIp('::ffff:192.0.2.10')
 * const invalid = normalizeClientIp('example.com:443')
 * ```
 */
export function normalizeClientIp(value?: string): string | undefined {
  if (!value)
    return undefined
  const address = value.trim()
  if (!isIP(address))
    return undefined
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  return mapped?.[1] ?? address
}

function addProxy(blockList: BlockList, entry: string): void {
  const [address, prefix, extra] = entry.split('/')
  const family = address ? isIP(address) : 0
  if (!family || extra !== undefined)
    throw new Error('trustedProxies entries must be IP addresses or CIDRs')
  const type = family === 4 ? 'ipv4' : 'ipv6'
  if (prefix === undefined) {
    blockList.addAddress(address!, type)
    return
  }
  const bits = Number(prefix)
  if (!/^\d+$/.test(prefix) || bits < 0 || bits > (family === 4 ? 32 : 128))
    throw new Error('Invalid trustedProxies CIDR prefix')
  blockList.addSubnet(address!, bits, type)
}

/**
 * 配置 Schema 使用相同规则，启动时拒绝无效 IP/CIDR。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const cidr = isTrustedProxyEntry('192.0.2.0/24')
 * const invalid = isTrustedProxyEntry('192.0.2.0/99')
 * ```
 */
export function isTrustedProxyEntry(entry: string): boolean {
  try {
    addProxy(new BlockList(), entry)
    return true
  }
  catch {
    return false
  }
}

/**
 * 每个 app 编译一次代理规则；请求只执行地址检查，不重建规则。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const resolveIp = createClientIpResolver(['192.0.2.0/24'])
 * const request = new Request('https://example.com', { headers: { 'x-forwarded-for': '198.51.100.12' } })
 * const ip = resolveIp(request, '192.0.2.10')
 * // 第二参必须来自 socket/平台，不能从请求头复制。
 * ```
 */
export function createClientIpResolver(trustedProxies: readonly string[]): (request: Request, remoteAddress?: string) => string | undefined {
  const proxies = new BlockList()
  for (const entry of trustedProxies)
    addProxy(proxies, entry)
  const trusted = (address: string): boolean => proxies.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6')

  return (request, remoteAddress) => {
    const peer = normalizeClientIp(remoteAddress)
    if (!peer || !trusted(peer))
      return peer
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded === null) {
      const realIp = request.headers.get('x-real-ip')
      return realIp === null ? peer : normalizeClientIp(realIp)
    }
    const chain = forwarded.split(',')
    // 无法确认客户端时保留未知状态，不能将代理地址提升为客户端身份。
    if (chain.length > 32)
      return undefined
    let current = peer
    for (let index = chain.length - 1; index >= 0 && trusted(current); index--) {
      const address = normalizeClientIp(chain[index])
      if (!address)
        return undefined
      current = address
    }
    return current
  }
}
