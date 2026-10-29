/**
 * @h-ai/core — 访问条件与请求策略配置；Schema 可在构建工具中使用，不依赖 Node API。
 * @module core-access-config
 */
import { z } from 'zod'

/**
 * 可信代理列表；auto 仅在受管的私有容器入口中使用本容器网段，普通宿主忽略转发头。
 * @example
 * ```ts
 * import { TrustedProxiesSchema } from '@h-ai/core'
 * const proxies = TrustedProxiesSchema.parse(['192.0.2.10'])
 * ```
 */
export const TrustedProxiesSchema = z.union([
  z.literal('auto'),
  z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])).max(1000),
]).describe('可信代理 IP/CIDR；默认 auto 在普通宿主忽略转发头，仅受管私有 Compose 采用容器网段')

/**
 * 可复用的可信 IP 与时间窗口条件；空列表不限制对应维度。
 * @example
 * ```ts
 * import { AccessConditionSchema } from '@h-ai/core'
 * const condition = AccessConditionSchema.parse({ allowIps: ['192.0.2.0/24'], timezone: 'Asia/Shanghai' })
 * ```
 */
export const AccessConditionSchema = z.strictObject({
  /** 允许的 IPv4/IPv6 地址或 CIDR；非空时只允许匹配的可信客户端地址。 */
  allowIps: z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])).max(1000).default([]).describe('允许的 IPv4/IPv6 地址或 CIDR；空数组不限，最多 1000 项'),
  /** 拒绝的 IP/CIDR；与 allowIps 同时命中时拒绝优先。 */
  denyIps: z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])).max(1000).default([]).describe('拒绝的 IP/CIDR；拒绝优先，空数组不限，最多 1000 项'),
  /** 时间窗口的 IANA 时区，默认 UTC；不使用客户端时钟。 */
  timezone: z.string().default('UTC').refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
      return true
    }
    catch { return false }
  }, 'Invalid IANA timezone').describe('访问时间窗口使用的 IANA 时区，默认 UTC，使用服务器时钟'),
  /** 允许的时段；空列表不限时间，跨午夜窗口按开始日归属。 */
  windows: z.array(z.strictObject({
    /** 周一为 1、周日为 7；跨午夜填写开始日。 */
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7).describe('允许窗口的开始日，周一 1 至周日 7，至少一项'),
    /** HH:mm，包含开始时刻。 */
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).describe('允许窗口开始时间 HH:mm，包含开始时刻'),
    /** HH:mm，不包含结束时刻；早于开始表示跨午夜。 */
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).describe('允许窗口结束时间 HH:mm，不含结束；早于开始表示跨午夜，不得与开始相同'),
  }).refine(value => value.start !== value.end, 'Time window start and end must differ')).max(100).default([]).describe('允许的访问时间窗口；空数组不限时间，最多 100 个'),
})

const requestPathSchema = z.string().min(1).max(2048).refine((value) => {
  const path = value.endsWith('/**') ? value.slice(0, -3) || '/' : value
  // eslint-disable-next-line no-control-regex -- 配置边界必须拒绝控制字符，避免路径匹配和代理解释产生差异。
  return path.startsWith('/') && !/[\\%?#*\u0000-\u0020\u007F]/.test(path) && !path.includes('//')
    && !path.split('/').some(segment => segment === '.' || segment === '..')
}, 'Expected an absolute path, optionally ending in /**')

/**
 * 每次请求的访问策略：全局条件与所有命中规则必须同时满足；未命中规则不受该规则限制。
 * @example
 * ```ts
 * import { RequestAccessPolicySchema } from '@h-ai/core'
 * const policy = RequestAccessPolicySchema.parse({ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] })
 * ```
 */
export const RequestAccessPolicySchema = z.strictObject({
  /** 适用于宿主处理的所有请求，包括健康检查；省略则不增加全局条件。 */
  global: AccessConditionSchema.optional().describe('所有宿主请求的共同条件；包含健康检查，省略不增加全局限制'),
  /** 路径规则；仅支持精确路径和末尾 /**，不用正则表达式。 */
  rules: z.array(AccessConditionSchema.extend({
    /** 日志中的稳定规则编号，不包含秘密或个人信息。 */
    id: z.string().min(1).max(64).regex(/^[\w.-]+$/).describe('唯一规则编号，用于日志定位；1–64 个字母数字下划线、点或连字符'),
    /** 完整请求路径；末尾 /** 同时匹配该路径及子路径，大小写敏感。 */
    paths: z.array(requestPathSchema).min(1).max(100).describe('完整请求路径列表，包含部署前缀；精确或末尾 /**，最多 100 项'),
    /** HTTP 方法，空数组表示所有方法；GET 不隐含 HEAD。 */
    methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'])).max(9).default([]).describe('受该规则约束的 HTTP 方法；空数组全部方法，GET 不隐含 HEAD'),
    /** 省略沿用宿主；required 强制应用层加密，disabled 要求普通明文请求，HTTPS 仍须启用。 */
    encryption: z.enum(['required', 'disabled']).optional().describe('路径的应用层加解密模式；省略沿用宿主，required 强制加密，disabled 明文；重叠路径和方法不得冲突'),
  })).max(1000).default([]).describe('路径访问规则，最多 1000 条；全局和所有匹配规则都必须通过'),
}).refine(value => new Set(value.rules.map(rule => rule.id)).size === value.rules.length, 'Rule ids must be unique')

/**
 * 关闭策略、内联策略或单个独立 YAML 文件；文件与内联规则不能混合。
 * @example
 * ```ts
 * import { RequestAccessConfigSchema } from '@h-ai/core'
 * const config = RequestAccessConfigSchema.parse({ file: './config/request-access.yml' })
 * ```
 */
export const RequestAccessConfigSchema = z.union([
  z.literal(false),
  z.strictObject({
    /** 独立 yml/yaml 文件，按服务进程工作目录解析；启动读取一次，变更后重建宿主实例。 */
    file: z.string().trim().min(1).max(4096).regex(/\.ya?ml$/i).describe('独立 yml/yaml 策略文件；按工作目录解析，启动读一次，最大 1 MiB'),
  }),
  RequestAccessPolicySchema,
]).describe('每次请求的路径/IP/时间策略；false 关闭，内联规则与独立 YAML 文件引用不能混用')
