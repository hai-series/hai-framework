/**
 * @h-ai/core — 核心配置 Schema
 *
 * 定义 _core.yml 的应用设置，以及 Serv、Kit 与 Core 访问检查共用的 HTTP 策略校验规则。
 * @module core-config
 */

import { z } from 'zod'
import { DEFAULT_HTTP_CORS_HEADERS, DEFAULT_HTTP_CORS_MAX_AGE, DEFAULT_HTTP_CORS_METHODS, isHttpCorsOrigin, isHttpEndpointPath, isHttpToken, splitHttpCorsOrigins } from './functions/core-function-cors.js'

// ─── 环境与基础配置 Schema ───

/**
 * 检查 `_core.yml` 的 `env` 字段，用来区分开发、生产、测试和预发布设置。
 * @example
 * ```ts
 * import { type CoreConfig, core } from '@h-ai/core'
 * core.init({ configDir: './config' })
 * const env = core.config.getOrThrow<CoreConfig>('core').env
 * ```
 */
export const EnvSchema = z.enum([
  'development',
  'production',
  'test',
  'staging',
])

/**
 * 日志级别 Schema。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * core.logger.setLevel('warn')
 * const level = core.logger.getLevel() // 'warn'
 * ```
 */
export const LogLevelSchema = z.enum([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
])

/**
 * 日志格式 Schema。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * core.init({ logging: { format: 'json' } })
 * ```
 */
export const LogFormatSchema = z.enum(['json', 'pretty'])

// ─── 日志配置 Schema ───

/**
 * 日志配置 Schema。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * core.init({ logging: { level: 'warn', format: 'json', redact: ['customer.email'] } })
 * ```
 */
export const LoggingConfigSchema = z.object({
  /** 日志级别（默认 'info'） */
  level: LogLevelSchema.default('info'),
  /** 日志格式：默认 'pretty'，需要由日志系统按行采集时可显式选择 'json'。 */
  format: LogFormatSchema.default('pretty'),
  /** 默认上下文，会自动添加到每条日志 */
  context: z.record(z.string(), z.unknown()).optional(),
  /** 额外业务隐私的日志字段路径，如 customer.email、recipients[*].phone；* 匹配一层，区分大小写，默认 []。已知密码/令牌始终脱敏。 */
  redact: z.array(z.string()).default([]),
})

// ─── Core 配置 Schema ───

/**
 * Core 配置 Schema。
 *
 * `core.init()` 读取 `_core.yml` 时检查应用名称、版本、运行环境、默认语言和日志配置。
 * 发现其他字段时拒绝加载该文件。业务配置放在独立的 `app.yml`，由应用提供自己的校验规则。
 * ID 长度与前缀随每次 `core.id` 调用传入。
 * @example
 * ```ts
 * import { type CoreConfig, core } from '@h-ai/core'
 * core.init({ configDir: './config' })
 * const config = core.config.getOrThrow<CoreConfig>('core')
 * ```
 */
export const CoreConfigSchema = z.strictObject({
  /** 应用名称（默认 'hai Admin'） */
  name: z.string().default('hai Admin'),
  /** 应用版本（默认 '0.1.0'） */
  version: z.string().default('0.1.0'),
  /** 运行环境（默认 'development'） */
  env: EnvSchema.default('development'),
  /** 日志配置（可选） */
  logging: LoggingConfigSchema.optional(),
  /** 默认语言（默认 'zh-CN'） */
  defaultLocale: z.string().default('zh-CN'),
})

// ─── HTTP 请求访问配置 Schema ───

/**
 * 可信代理列表；auto 仅在受管的私有容器入口中使用本容器网段，普通宿主忽略转发头。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * // 只信任从此代理地址接入的请求所携带的转发头。
 * const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])
 * ```
 */
export const TrustedProxiesSchema = z.union([
  z.literal('auto'),
  z.array(z.union([
    z.ipv4(),
    z.ipv6(),
    z.cidrv4(),
    z.cidrv6(),
  ])).max(1000),
]).describe('可信代理 IP/CIDR；默认 auto 在普通宿主忽略转发头，仅受管私有 Compose 采用容器网段')

/**
 * 可复用的可信 IP 与时间窗口条件；空列表不限制对应维度。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const check = core.access.createConditionCheck({
 *   allowIps: ['192.0.2.0/24'], denyIps: [], timezone: 'UTC', windows: [],
 * })
 * const decision = check('192.0.2.10') // { allowed: true }
 * ```
 */
export const AccessConditionSchema = z.strictObject({
  /** 允许的 IPv4/IPv6 地址或 CIDR；非空时只允许匹配的可信客户端地址。 */
  allowIps: z.array(z.union([
    z.ipv4(),
    z.ipv6(),
    z.cidrv4(),
    z.cidrv6(),
  ])).max(1000).default([]).describe('允许的 IPv4/IPv6 地址或 CIDR；空数组不限，最多 1000 项'),
  /** 拒绝的 IP/CIDR；与 allowIps 同时命中时拒绝优先。 */
  denyIps: z.array(z.union([
    z.ipv4(),
    z.ipv6(),
    z.cidrv4(),
    z.cidrv6(),
  ])).max(1000).default([]).describe('拒绝的 IP/CIDR；拒绝优先，空数组不限，最多 1000 项'),
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
  const path = value.endsWith('/**')
    ? value.slice(0, -3) || '/'
    : value
  // eslint-disable-next-line no-control-regex -- 配置边界必须拒绝控制字符，避免路径匹配和代理解释产生差异。
  return path.startsWith('/') && !/[\\%?#*\u0000-\u0020\u007F]/.test(path) && !path.includes('//')
    && !path.split('/').some(segment => segment === '.' || segment === '..')
}, 'Expected an absolute path, optionally ending in /**')

/**
 * 每次请求的访问策略：全局条件与所有命中规则必须同时满足；未命中规则不受该规则限制。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const policy = core.access.loadPolicy({
 *   rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }],
 * })
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
    methods: z.array(z.enum([
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
      'CONNECT',
      'TRACE',
    ])).max(9).default([]).describe('受该规则约束的 HTTP 方法；空数组全部方法，GET 不隐含 HEAD'),
    /** 省略沿用宿主；required 强制应用层加密，disabled 要求普通明文请求，HTTPS 仍须启用。 */
    encryption: z.enum(['required', 'disabled']).optional().describe('路径的应用层加解密模式；省略沿用宿主，required 强制加密，disabled 明文；重叠路径和方法不得冲突'),
  })).max(1000).default([]).describe('路径访问规则，最多 1000 条；全局和所有匹配规则都必须通过'),
}).refine(value => new Set(value.rules.map(rule => rule.id)).size === value.rules.length, 'Rule ids must be unique')

/**
 * 关闭策略、内联策略或单个独立 YAML 文件；文件与内联规则不能混合。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * // 在 Node 服务启动时读取 YAML 并返回请求检查器；文件有误会抛出配置错误。
 * const check = core.access.createRequestCheck({ file: './config/security/request-access.yml' })
 * const decision = check('/api/orders', 'GET', '192.0.2.10')
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

/**
 * HTTP 固定窗口限流的可序列化设置。默认关闭；对象启用并补齐窗口和请求额度。
 * @example
 * ```ts
 * import { HttpRateLimitConfigSchema } from '@h-ai/core'
 * // 允许同一个限流主体在 10 秒内请求两次；宿主另行注入计数器。
 * const policy = HttpRateLimitConfigSchema.parse({ windowMs: 10000, maxRequests: 2 })
 * if (policy) void policy.maxRequests
 * ```
 */
export const HttpRateLimitConfigSchema = z.union([
  z.literal(false),
  z.strictObject({
    windowMs: z.number().int().min(1).max(2147483647).default(60000).describe('固定窗口时长，单位为毫秒，从首次成功提交计数起算'),
    maxRequests: z.number().int().min(1).default(100).describe('同一主体在窗口内允许的请求数'),
  }),
]).default(false).describe('HTTP 固定窗口限流；false 关闭，启用时由应用注入原子存储')

/**
 * Serv 与 Kit 共用的可信代理、访问和限流配置。
 * 省略代理时使用自动模式，省略访问或限流时关闭对应功能。
 * @example
 * ```ts
 * import { HttpAccessConfigSchema } from '@h-ai/core'
 * const config = HttpAccessConfigSchema.parse({
 *   trustedProxies: ['192.0.2.10'],
 *   rateLimit: { maxRequests: 60 },
 * })
 * // 同一可信来源每个默认的一分钟窗口内可以通过 60 次检查。
 * void config.rateLimit
 * ```
 */
export const HttpAccessConfigSchema = z.object({
  trustedProxies: TrustedProxiesSchema.default('auto'),
  access: RequestAccessConfigSchema.default(false),
  rateLimit: HttpRateLimitConfigSchema,
})

/**
 * 固定的完整站点路径；不接受参数、通配符、转义段或相对部分。
 * 校验失败时用 `safeParse()` 读取错误，避免装配到错误的端点。
 * @example
 * ```ts
 * import { HttpEndpointPathSchema } from '@h-ai/core'
 * const path = HttpEndpointPathSchema.safeParse('/partners/orders/a2a')
 * if (!path.success) throw new Error('Invalid orders agent endpoint')
 * void path.data
 * ```
 */
export const HttpEndpointPathSchema = z.custom<`/${string}`>(
  isHttpEndpointPath,
  'Expected a canonical absolute request path',
)

/**
 * A2A 对外端点默认关闭；仅在启用后解析 Agent Card 和 RPC 路径。
 * 自定义路径填写不同的完整站点路径。
 * @example
 * ```ts
 * import { HttpHostA2AConfigSchema } from '@h-ai/core'
 * const a2a = HttpHostA2AConfigSchema.parse({ rpcPath: '/partners/orders/a2a' })
 * // 缺省 cardPath 仍发布在 /.well-known/agent-card.json。
 * if (a2a) void a2a.cardPath
 * ```
 */
export const HttpHostA2AConfigSchema = z.union([
  z.literal(false),
  z.strictObject({
    cardPath: HttpEndpointPathSchema.default('/.well-known/agent-card.json').describe('公开 Agent Card 的完整站点路径'),
    rpcPath: HttpEndpointPathSchema.default('/a2a').describe('JSON-RPC 调用的完整站点路径，应与 Agent Card 公布地址一致'),
  }).refine(value => value.cardPath !== value.rpcPath, {
    path: ['rpcPath'],
    message: 'A2A RPC and Agent Card paths must be different',
  }),
]).default(false).describe('发布 A2A HTTP 发现及 JSON-RPC；默认关闭')

const corsTokenSchema = z.string().refine(isHttpToken, 'Invalid CORS header name or HTTP method').describe('一个 HTTP 方法或响应、请求头名称')
const corsOriginSchema = z.union([
  z.string(),
  z.array(z.string().describe('一个完整的浏览器来源')),
]).default('*')
const corsOptionsSchema = z.strictObject({
  origin: corsOriginSchema.describe('允许访问的完整来源；使用凭据时仅允许明确来源'),
  nativeOrigins: z.string().refine(value => splitHttpCorsOrigins(value).every(isHttpCorsOrigin), 'Expected complete native origins').optional().describe('显式允许的原生 WebView 来源，使用逗号分隔'),
  paths: z.array(z.union([
    z.literal('/'),
    HttpEndpointPathSchema,
  ]).describe('启用跨域策略的一条完整请求路径')).optional().describe('应用跨域策略的完整请求路径；省略匹配全部'),
  methods: z.array(corsTokenSchema).default(() => [...DEFAULT_HTTP_CORS_METHODS]).describe('浏览器预检获准使用的 HTTP 方法'),
  allowedHeaders: z.array(corsTokenSchema).default(() => [...DEFAULT_HTTP_CORS_HEADERS]).describe('浏览器预检获准发送的请求头'),
  exposedHeaders: z.array(corsTokenSchema).default([]).describe('允许跨域页面通过 JavaScript 读取的响应头'),
  credentials: z.boolean().default(false).describe('允许浏览器跨域携带 Cookie 等凭据，默认关闭'),
  maxAge: z.number().int().nonnegative().default(DEFAULT_HTTP_CORS_MAX_AGE).describe('预检响应的浏览器缓存时间，单位为秒'),
}).superRefine(({ origin, credentials }, context) => {
  const origins = typeof origin === 'string'
    ? splitHttpCorsOrigins(origin)
    : origin
  if (origins.includes('*')
    ? credentials || origins.length !== 1
    : !origins.every(isHttpCorsOrigin)) {
    context.addIssue({
      code: 'custom',
      path: ['origin'],
      message: 'Use complete, explicit CORS origins when credentials are enabled',
    })
  }
})

/**
 * 可序列化的共同 CORS 设置，默认关闭。原生来源和跨域凭据均需显式指定；
 * 含凭据的配置使用明确来源，通配符会导致校验失败。
 * @example
 * ```ts
 * import { HttpCorsConfigSchema } from '@h-ai/core'
 * const cors = HttpCorsConfigSchema.safeParse({
 *   origin: 'https://console.orders.example.com',
 *   paths: ['/api/orders'],
 *   credentials: true,
 * })
 * if (!cors.success) throw new Error('Invalid orders console CORS policy')
 * void cors.data
 * ```
 */
export const HttpCorsConfigSchema = z.union([
  z.literal(false),
  corsOptionsSchema,
]).default(false).describe('浏览器跨域访问策略；默认关闭')
