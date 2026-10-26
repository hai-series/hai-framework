/** 登录许可只依赖配置、服务端时间和宿主可信地址；规则在初始化时编译。 */
import type { HaiResult } from '@h-ai/core'
import type { IamConfig } from '../iam-config.js'
import type { AuthRequestContext } from './iam-authn-types.js'
import { BlockList, isIP } from 'node:net'
import { err, ok } from '@h-ai/core'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

function addresses(entries: string[]): BlockList {
  const list = new BlockList()
  for (const entry of entries) {
    const [address, prefix] = entry.split('/')
    const family = isIP(address!) === 4 ? 'ipv4' : 'ipv6'
    if (prefix === undefined)
      list.addAddress(address!, family)
    else
      list.addSubnet(address!, Number(prefix), family)
  }
  return list
}

/**
 * 创建单个 IAM 实例的登录许可检查器。
 * @param policy - 已由 Schema 校验的策略。
 * @returns 使用可信上下文与服务端时钟的检查函数。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const check = createLoginAccessCheck(undefined)
 * const allowed = check({ ip: '192.0.2.10' })
 * ```
 */
export function createLoginAccessCheck(policy: IamConfig['loginAccess']): (context?: AuthRequestContext) => HaiResult<void> {
  if (!policy?.enabled)
    return () => ok(undefined)
  const allow = addresses(policy.allowIps)
  const deny = addresses(policy.denyIps)
  const format = new Intl.DateTimeFormat('en-US', { timeZone: policy.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (context) => {
    const rejected = () => err(HaiIamError.LOGIN_ACCESS_DENIED, iamM('iam_loginAccessDenied'))
    if (policy.allowIps.length || policy.denyIps.length) {
      const raw = context?.ip?.trim()
      const ip = raw?.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1] ?? raw
      if (!ip || !isIP(ip))
        return rejected()
      const family = isIP(ip) === 4 ? 'ipv4' : 'ipv6'
      if (deny.check(ip, family) || (policy.allowIps.length && !allow.check(ip, family)))
        return rejected()
    }
    if (policy.windows.length) {
      const parts = Object.fromEntries(format.formatToParts(new Date()).map(part => [part.type, part.value]))
      const day = weekdays.indexOf(parts.weekday!) + 1
      const previousDay = day === 1 ? 7 : day - 1
      const time = `${parts.hour}:${parts.minute}`
      const permitted = policy.windows.some(window => window.start < window.end
        ? window.days.includes(day) && time >= window.start && time < window.end
        : (window.days.includes(day) && time >= window.start) || (window.days.includes(previousDay) && time < window.end))
      if (!permitted)
        return rejected()
    }
    return ok(undefined)
  }
}
