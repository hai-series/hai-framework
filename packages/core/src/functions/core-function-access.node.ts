/**
 * @h-ai/core — Node 端可信地址解析与编译后的访问检查。
 * @module core-function-access.node
 */
import type { AccessCondition, AccessDecision, AccessFunctions, RequestAccessCheck, RequestAccessConfigInput, RequestAccessPolicy, RequestEncryptionMode, TrustedProxies } from '../core-types.js'
import { Buffer } from 'node:buffer'
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { BlockList, isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import { AccessConditionSchema, RequestAccessConfigSchema, RequestAccessPolicySchema } from '../core-access-config.js'

const allowed: AccessDecision = Object.freeze({ allowed: true })
const invalidPath: AccessDecision = Object.freeze({ allowed: false, reason: 'path' })
const maximumPolicyBytes = 1024 * 1024

/**
 * 规范化可信宿主给出的 IP；不接受端口、主机名或带区域的地址。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const ip = core.access.normalizeClientIp('::ffff:192.0.2.10')
 * ```
 */
function normalizeClientIp(value?: string): string | undefined {
  if (!value)
    return undefined
  const address = value.trim()
  if (address.includes('%') || !isIP(address))
    return undefined
  return address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1] ?? address
}

function addAddress(list: BlockList, entry: string): void {
  const [address, prefix, extra] = entry.split('/')
  const family = address ? isIP(address) : 0
  if (!family || address?.includes('%') || extra !== undefined)
    throw new Error('Expected an IP address or CIDR')
  const type = family === 4 ? 'ipv4' : 'ipv6'
  if (prefix === undefined) {
    list.addAddress(address!, type)
    return
  }
  const bits = Number(prefix)
  if (!/^\d+$/.test(prefix) || bits < 0 || bits > (family === 4 ? 32 : 128))
    throw new Error('Invalid CIDR prefix')
  list.addSubnet(address!, bits, type)
}

/**
 * 启动编译可信代理；仅从可信对端接收 XFF，由右向左取首个非可信地址。
 * @param trustedProxies - 代理 IP/CIDR；auto 在受管私有 Compose 中编译本容器网段，其他宿主不信任转发头。
 * @returns 第二参数必须来自 socket/受信平台的解析函数；无效转发链返回 undefined。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const resolve = core.access.createClientIpResolver(['192.0.2.10'])
 * const ip = resolve(new Request('https://example.test', { headers: { 'x-forwarded-for': '198.51.100.2' } }), '192.0.2.10')
 * ```
 */
function createClientIpResolver(trustedProxies: TrustedProxies | readonly string[] = 'auto'): (request: Request, remoteAddress?: string) => string | undefined {
  const entries = trustedProxies === 'auto'
    ? process.env.HAI_DEPLOY_PRIVATE_PROXY === '1'
      ? Object.values(networkInterfaces()).flatMap(interfaces => interfaces?.filter(value => !value.internal && value.cidr && !value.cidr.includes('%')).map(value => value.cidr!) ?? [])
      : []
    : trustedProxies
  if (trustedProxies === 'auto' && process.env.HAI_DEPLOY_PRIVATE_PROXY === '1' && !entries.length)
    throw new Error('Private proxy mode requires an isolated container network')
  const proxies = new BlockList()
  for (const entry of entries)
    addAddress(proxies, entry)
  const trusted = (address: string): boolean => proxies.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6')
  return (request, remoteAddress) => {
    const peer = normalizeClientIp(remoteAddress)
    if (!peer || !entries.length || !trusted(peer))
      return peer
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded === null) {
      const realIp = request.headers.get('x-real-ip')
      return realIp === null ? peer : normalizeClientIp(realIp)
    }
    if (forwarded.length > 2048)
      return undefined
    const chain = forwarded.split(',')
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

/**
 * 时区转换后用于窗口比较的星期和分钟。
 * @example 模块内部上下文
 * ```ts
 * const minute: LocalMinute = { day: 1, time: '09:00' }
 * ```
 */
interface LocalMinute { day: number, time: string }

/**
 * 按 UTC 分钟缓存转换结果的读取函数。
 * @example 模块内部上下文
 * ```ts
 * const read: TimeReader = timeReader('UTC')
 * const minute = read(Date.now())
 * ```
 */
type TimeReader = (now: number) => LocalMinute

function timeReader(timezone: string): TimeReader {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let lastMinute = Number.NaN
  let local: LocalMinute
  return (now) => {
    const minute = Math.floor(now / 60_000)
    if (minute !== lastMinute) {
      const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]))
      local = { day: weekdays.indexOf(parts.weekday!) + 1, time: `${parts.hour}:${parts.minute}` }
      lastMinute = minute
    }
    return local
  }
}

function compileCondition(condition: AccessCondition, readTime?: TimeReader, ruleId?: string): (ip?: string) => AccessDecision {
  const allow = new BlockList()
  const deny = new BlockList()
  for (const entry of condition.allowIps)
    addAddress(allow, entry)
  for (const entry of condition.denyIps)
    addAddress(deny, entry)
  const addressDenied: AccessDecision = Object.freeze({ allowed: false, reason: 'address', ruleId })
  const timeDenied: AccessDecision = Object.freeze({ allowed: false, reason: 'time', ruleId })
  const checksAddress = condition.allowIps.length > 0 || condition.denyIps.length > 0
  return (ip) => {
    if (checksAddress) {
      const address = normalizeClientIp(ip)
      if (!address)
        return addressDenied
      const family = isIP(address) === 4 ? 'ipv4' : 'ipv6'
      if (deny.check(address, family) || (condition.allowIps.length && !allow.check(address, family)))
        return addressDenied
    }
    if (readTime) {
      const { day, time } = readTime(Date.now())
      const previous = day === 1 ? 7 : day - 1
      if (!condition.windows.some(window => window.start < window.end
        ? window.days.includes(day) && time >= window.start && time < window.end
        : (window.days.includes(day) && time >= window.start) || (window.days.includes(previous) && time < window.end))) {
        return timeDenied
      }
    }
    return allowed
  }
}

/**
 * 编译单个 IP/时间条件，供登录与请求策略共用；请求期间不再解析 CIDR 或创建格式化器。
 * @example
 * ```ts
 * import { core, AccessConditionSchema } from '@h-ai/core'
 * const check = core.access.createConditionCheck(AccessConditionSchema.parse({ allowIps: ['192.0.2.0/24'] }))
 * const decision = check('192.0.2.10')
 * ```
 */
function createConditionCheck(input: AccessCondition): (ip?: string) => AccessDecision {
  const condition = AccessConditionSchema.parse(input)
  return compileCondition(condition, condition.windows.length ? timeReader(condition.timezone) : undefined)
}

/**
 * 启动时读取并验证独立 YAML 策略，不在请求中访问文件；最大 1 MiB，拒绝 YAML 别名与未知字段。
 * @param input - false、内联策略或 { file }，二者不能混用。
 * @param baseDirectory - 相对文件路径的基准目录，默认服务进程工作目录。
 * @returns 已验证策略或 false；读取/解析失败抛出不含策略正文的配置错误，宿主必须停止启动。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const policy = core.access.loadPolicy({ rules: [] })
 * ```
 */
function loadPolicy(input: RequestAccessConfigInput = false, baseDirectory = process.cwd()): RequestAccessPolicy | false {
  const config = RequestAccessConfigSchema.parse(input)
  if (config === false || !('file' in config))
    return config
  let descriptor: number | undefined
  let content: string
  try {
    // 非阻塞打开保证 FIFO 等特殊文件能先被 fstat 拒绝，不在启动时等候写入者。
    descriptor = openSync(path.resolve(baseDirectory, config.file), constants.O_RDONLY | constants.O_NONBLOCK)
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || stat.size > maximumPolicyBytes)
      throw new Error('Invalid policy file size or type')
    const bytes = Buffer.alloc(Math.min(stat.size + 1, maximumPolicyBytes + 1))
    let length = 0
    while (length < bytes.length) {
      const read = readSync(descriptor, bytes, length, bytes.length - length, null)
      if (!read)
        break
      length += read
    }
    if (length > maximumPolicyBytes || length !== stat.size)
      throw new Error('Policy file changed while reading')
    content = bytes.subarray(0, length).toString('utf8')
  }
  catch {
    throw new Error('Request access policy file could not be read; use a regular YAML file no larger than 1 MiB')
  }
  finally {
    if (descriptor !== undefined)
      closeSync(descriptor)
  }
  let parsed: unknown
  try {
    parsed = parse(content, { maxAliasCount: 0, uniqueKeys: true })
  }
  catch { throw new Error('Request access policy YAML is invalid; aliases and duplicate keys are not allowed') }
  const validated = RequestAccessPolicySchema.safeParse(parsed)
  if (!validated.success)
    throw new Error(`Request access policy is invalid at ${validated.error.issues.map(issue => issue.path.join('.') || 'root').join(', ')}`)
  return validated.data
}

/**
 * 已编译方法和访问条件，不在请求期解释配置。
 * @example 模块内部上下文
 * ```ts
 * const rule: CompiledRule = { methods: new Set(['POST']), check: () => allowed }
 * ```
 */
interface CompiledRule {
  methods: ReadonlySet<string>
  check: (ip?: string) => AccessDecision
}
/**
 * 按路径段索引的前缀节点，只访问命中的分支。
 * @example 模块内部上下文
 * ```ts
 * const node: PathNode = { children: new Map(), rules: [] }
 * ```
 */
interface PathNode {
  children: Map<string, PathNode>
  rules: CompiledRule[]
  encryption?: Map<string, RequestEncryptionMode>
  exactEncryption?: Map<string, RequestEncryptionMode>
  /** 仅在启动插入时用于检查子路径冲突，1 表示 required，2 表示 disabled。 */
  encryptionBelow?: Map<string, number>
}

function normalizeRequestPath(value: string): string | undefined {
  if (value.length > 8192)
    return undefined
  let decoded = value
  if (value.includes('%')) {
    if (/%(?:2f|5c|00)/i.test(value))
      return undefined
    try {
      decoded = decodeURIComponent(value)
    }
    catch { return undefined }
  }
  // eslint-disable-next-line no-control-regex -- 运行期拒绝控制字符及编码绕过，不能只校验配置端。
  if (!decoded.startsWith('/') || /[\\%?#\u0000-\u0020\u007F]/.test(decoded) || decoded.includes('//'))
    return undefined
  if (/(?:^|\/)\.\.?(?:\/|$)/.test(decoded))
    return undefined
  return decoded.length > 1 && decoded.endsWith('/') ? decoded.slice(0, -1) : decoded
}

/**
 * 编译按路径索引的请求检查器；全局与所有匹配规则取交集，不进行全规则扫描。
 * @param input - 启动时已装配的访问策略；独立文件也只在此时读取一次。
 * @returns 输入为实际 URL pathname、HTTP 方法和可信 IP 的纯请求检查函数。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const check = core.access.createRequestCheck({ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] })
 * const decision = check('/api/v1/external/sync', 'POST', '192.0.2.10')
 * ```
 */
function createRequestCheck(input: RequestAccessConfigInput = false): RequestAccessCheck {
  const policy = loadPolicy(input)
  if (policy === false)
    return Object.assign(() => allowed, { encryption: () => undefined, requiresEncryption: false })
  const clocks = new Map<string, TimeReader>()
  const compile = (condition: AccessCondition, id?: string) => {
    let readTime: TimeReader | undefined
    if (condition.windows.length) {
      readTime = clocks.get(condition.timezone) ?? timeReader(condition.timezone)
      clocks.set(condition.timezone, readTime)
    }
    return compileCondition(condition, readTime, id)
  }
  const globalCheck = policy.global ? compile(policy.global) : () => allowed
  const exact = new Map<string, CompiledRule[]>()
  const prefixes: PathNode = { children: new Map(), rules: [] }
  const allMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']
  let requiresEncryption = false
  let hasEncryption = false
  for (const rule of policy.rules) {
    const compiled = { methods: new Set(rule.methods), check: compile(rule, rule.id) }
    for (const pattern of new Set(rule.paths)) {
      if (rule.encryption) {
        hasEncryption = true
        requiresEncryption ||= rule.encryption === 'required'
        const prefix = pattern.endsWith('/**')
        const nodes = [prefixes]
        let node = prefixes
        const path = normalizeRequestPath(prefix ? pattern.slice(0, -3) || '/' : pattern)!
        for (const segment of path.split('/').filter(Boolean)) {
          let child = node.children.get(segment)
          if (!child) {
            child = { children: new Map(), rules: [] }
            node.children.set(segment, child)
          }
          node = child
          nodes.push(node)
        }
        const bit = rule.encryption === 'required' ? 1 : 2
        const opposite = bit === 1 ? 2 : 1
        const methods = rule.methods.length ? rule.methods : allMethods
        for (const method of methods) {
          // 冲突与声明顺序无关；不以时间/IP 不同为由接受含糊的传输协议。
          if (nodes.some(parent => parent.encryption?.has(method) && parent.encryption.get(method) !== rule.encryption)
            || (prefix ? (node.encryptionBelow?.get(method) ?? 0) & opposite : node.exactEncryption?.has(method) && node.exactEncryption.get(method) !== rule.encryption)) {
            throw new Error(`Request access encryption conflicts at rule ${rule.id}`)
          }
          const modes = prefix ? node.encryption ??= new Map() : node.exactEncryption ??= new Map()
          modes.set(method, rule.encryption)
          for (const parent of nodes) {
            parent.encryptionBelow ??= new Map()
            parent.encryptionBelow.set(method, (parent.encryptionBelow.get(method) ?? 0) | bit)
          }
        }
      }
      if (pattern.endsWith('/**')) {
        let node = prefixes
        for (const segment of pattern.slice(0, -3).split('/').filter(Boolean)) {
          let child = node.children.get(segment)
          if (!child) {
            child = { children: new Map(), rules: [] }
            node.children.set(segment, child)
          }
          node = child
        }
        node.rules.push(compiled)
      }
      else {
        const path = normalizeRequestPath(pattern)!
        const rules = exact.get(path) ?? []
        rules.push(compiled)
        exact.set(path, rules)
      }
    }
  }
  const check = (pathname: string, method: string, ip?: string): AccessDecision => {
    const global = globalCheck(ip)
    if (!global.allowed)
      return global
    const path = normalizeRequestPath(pathname)
    if (!path)
      return invalidPath
    for (const rule of exact.get(path) ?? []) {
      if (!rule.methods.size || rule.methods.has(method)) {
        const decision = rule.check(ip)
        if (!decision.allowed)
          return decision
      }
    }
    let node: PathNode | undefined = prefixes
    for (const rule of node.rules) {
      if (!rule.methods.size || rule.methods.has(method)) {
        const decision = rule.check(ip)
        if (!decision.allowed)
          return decision
      }
    }
    if (node.children.size) {
      for (const segment of path.split('/').filter(Boolean)) {
        node = node.children.get(segment)
        if (!node)
          break
        for (const rule of node.rules) {
          if (!rule.methods.size || rule.methods.has(method)) {
            const decision = rule.check(ip)
            if (!decision.allowed)
              return decision
          }
        }
      }
    }
    return allowed
  }
  const encryption = (pathname: string, method: string): RequestEncryptionMode | undefined => {
    const path = normalizeRequestPath(pathname)
    if (!path)
      return undefined
    let node: PathNode | undefined = prefixes
    let mode = node.encryption?.get(method)
    for (const segment of path.split('/').filter(Boolean)) {
      node = node.children.get(segment)
      if (!node)
        return mode
      mode ??= node.encryption?.get(method)
    }
    return mode ?? node?.exactEncryption?.get(method)
  }
  return Object.assign(check, { encryption: hasEncryption ? encryption : () => undefined, requiresEncryption })
}

/**
 * Node 访问工具统一由 core-main 注册，不作为包级函数导出。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const decision = core.access.createRequestCheck(false)('/api/v1/example', 'GET')
 * ```
 */
export const access: AccessFunctions = { normalizeClientIp, createClientIpResolver, createConditionCheck, createRequestCheck, loadPolicy }
