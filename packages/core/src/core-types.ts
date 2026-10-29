/**
 * @h-ai/core — 类型定义
 *
 * 核心模块的公共类型（前后端通用）
 * @module core-types
 */

import type { z } from 'zod'
import type { AccessConditionSchema, RequestAccessConfigSchema, RequestAccessPolicySchema, TrustedProxiesSchema } from './core-access-config.js'
import type { CoreConfigSchema, EnvSchema, LogFormatSchema, LoggingConfigSchema, LogLevelSchema } from './core-config.js'
import type { config as browserConfig } from './functions/core-function-config.browser.js'
import type { config as nodeConfig } from './functions/core-function-config.node.js'
import type { id } from './functions/core-function-id.js'
import type { i18n } from './i18n/core-i18n-utils.js'
import type { array } from './utils/core-util-array.js'
import type { async } from './utils/core-util-async.js'
import type { requiresSharedState } from './utils/core-util-module.js'
import type { object } from './utils/core-util-object.js'
import type { createRuntime } from './utils/core-util-runtime.js'
import type { sanitize } from './utils/core-util-sanitize.js'
import type { string } from './utils/core-util-string.js'
import type { time } from './utils/core-util-time.js'
import type { typeUtils } from './utils/core-util-type.js'

import { error } from './functions/core-function-error.js'

/**
 * Zod 校验错误使用的稳定消息键。
 * @example
 * ```ts
 * import type { ZodValidationMessageKey } from '@h-ai/core'
 * const value: ZodValidationMessageKey = 'validationRequired'
 * ```
 */
export type ZodValidationMessageKey
  = | 'validationFailed'
    | 'validationRequired'
    | 'validationInvalid'
    | 'validationInvalidType'
    | 'validationUnexpectedFields'
    | 'validationStringMin'
    | 'validationStringMax'
    | 'validationNumberMin'
    | 'validationNumberMax'
    | 'validationArrayMin'
    | 'validationArrayMax'
    | 'validationTooSmall'
    | 'validationTooBig'
    | 'validationEmail'
    | 'validationUrl'
    | 'validationUuid'
    | 'validationEnum'

/**
 * 把校验消息键及插值参数转换为显示文本的函数。
 * @example
 * ```ts
 * import type { ZodMessageGetter } from '@h-ai/core'
 * const message: ZodMessageGetter = (key, params) => key === 'validationRequired' ? 'Required' : `${key}: ${String(params?.field ?? '')}`
 * message('validationRequired')
 * ```
 */
export type ZodMessageGetter = (
  key: ZodValidationMessageKey,
  params?: Record<string, string | number>,
) => string

/**
 * 可绑定表单字段路径的本地化错误。
 * @example
 * ```ts
 * import type { ValidationFormError } from '@h-ai/core'
 * const value: ValidationFormError = { field: 'email', message: 'Enter an email address' }
 * ```
 */
export interface ValidationFormError {
  field: string
  message: string
}

/**
 * 共享 Zod 错误映射契约；业务自定义消息保持原文。
 * @example
 * ```ts
 * import { core, type ZodValidationFn } from '@h-ai/core'
 * import { z } from 'zod'
 * const validator: ZodValidationFn = core.zodValidation
 * const input = z.object({ email: z.email() }).safeParse({ email: 'invalid' })
 * if (!input.success) validator.mapZodErrorToFormErrors(input.error, key => key)
 * ```
 */
export interface ZodValidationFn {
  readonly createPrefixedZodMessageGetter: <TMessageKey extends string>(
    prefix: string,
    getMessage: (messageKey: TMessageKey, params?: Record<string, string | number>) => string,
  ) => ZodMessageGetter
  readonly mapZodErrorToFormErrors: (
    error: unknown,
    getMessage: ZodMessageGetter,
  ) => ValidationFormError[]
}

const UnknownErrorDef: HaiErrorDef = {
  code: '_:_:599',
  httpStatus: 500,
  system: '_',
  module: '_',
}

// ─── 1. 基础类型 - HaiResult / Option ───

/**
 * 业务操作的成功数据或标准失败；访问 data/error 前必须按 success 收窄。
 * @example
 * ```ts
 * import { ok, type HaiResult } from '@h-ai/core'
 * const result: HaiResult<{ id: string }> = ok({ id: 'order-1' })
 * const label = result.success ? result.data.id : result.error.message
 * ```
 */
export type HaiResult<T>
  = | { success: true, data: T }
    | { success: false, error: HaiError }

/**
 * 创建成功结果；不会自动捕获后续操作异常。
 * @param data - 成功分支的数据；保留原类型和对象引用。
 * @returns success 为 true、data 为输入值的结果。
 * @example
 * ```ts
 * import { ok } from '@h-ai/core'
 * const result = ok({ id: 'order-1' })
 * if (result.success) result.data.id.toUpperCase()
 * ```
 */
export function ok<T>(data: T): HaiResult<T> {
  return { success: true, data }
}

/**
 * 创建失败结果；支持标准错误定义、已有 HaiError 与原生 Error。
 * @param errorOrDef - 已定义的错误、已有业务错误或原生异常。
 * @param message - 从错误定义创建实例时使用的消息。
 * @param cause - 原始原因；对外展示前应按边界脱敏。
 * @param suggestion - 可选的处理建议。
 * @returns success 为 false、error 为标准业务错误的结果。
 * @example
 * ```ts
 * import { err, HaiCommonError } from '@h-ai/core'
 * const result = err(HaiCommonError.NOT_FOUND, 'Order not found')
 * if (!result.success) result.error.httpStatus
 * ```
 */
export function err(
  errorOrDef: HaiErrorDef | HaiError | Error,
  message?: string,
  cause?: unknown,
  suggestion?: string,
): HaiResult<never> {
  if (errorOrDef instanceof Error) {
    return {
      success: false,
      error: error.buildHaiErrorInst(
        UnknownErrorDef,
        message || errorOrDef.message,
        cause ?? errorOrDef,
        suggestion,
      ),
    }
  }
  const nonNativeError: HaiErrorDef | HaiError = errorOrDef
  if ('message' in nonNativeError) {
    return {
      success: false,
      error: nonNativeError,
    }
  }
  return {
    success: false,
    error: error.buildHaiErrorInst(nonNativeError, message || '', cause, suggestion),
  }
}

/**
 * HaiResult 模式匹配处理器。
 *
 * 提供对 HaiResult 的模式匹配能力，分别处理成功和失败两种情况。
 *
 * @template T - 成功数据类型
 * @template R1 - ok 分支返回类型
 * @template R2 - err 分支返回类型
 * @example
 * ```ts
 * import { type MatchHandlers, ok } from '@h-ai/core'
 * const handlers: MatchHandlers<number, string, string> = { ok: n => String(n + 1), err: error => error.message }
 * const result = ok(2)
 * const label = result.success ? handlers.ok(result.data) : handlers.err(result.error)
 * ```
 */
export interface MatchHandlers<T, R1, R2> {
  /** 成功分支处理器 */
  ok: (data: T) => R1
  /** 失败分支处理器 */
  err: (error: HaiError) => R2
}

// ─── 1.5 标准错误类型 ───

/**
 * 错误信息值格式：`错误码数字段:HTTP状态码`，例如 `001:500`。
 * @example
 * ```ts
 * import type { ErrorInfoValue } from '@h-ai/core'
 * const value: ErrorInfoValue = '001:500'
 * ```
 */
export type ErrorInfoValue = `${string}:${string}`

/**
 * 模块错误信息映射。
 * @example
 * ```ts
 * import type { ErrorInfo } from '@h-ai/core'
 * const value: ErrorInfo = { NOT_READY: '001:503' }
 * ```
 */
export type ErrorInfo = Record<string, ErrorInfoValue>

/**
 * 稳定的错误码与 HTTP 映射；消息在创建错误实例时填入。
 * @example
 * ```ts
 * import type { HaiErrorDef } from '@h-ai/core'
 * const value: HaiErrorDef = { code: 'app:orders:001', httpStatus: 409, system: 'app', module: 'orders' }
 * ```
 */
export interface HaiErrorDef {
  code: string | number
  httpStatus: number
  system: string
  module: string
}

/**
 * 可跨业务边界传递的错误；cause/ext 对外展示前仍需脱敏。
 * @example
 * ```ts
 * import type { HaiError } from '@h-ai/core'
 * const value: HaiError = { code: 'app:orders:001', message: 'Order already exists', httpStatus: 409 }
 * ```
 */
export interface HaiError {
  code: string | number
  message: string
  /** 用户提示与前后端诊断共用的关联标识。 */
  traceId?: string
  httpStatus?: number
  system?: string
  module?: string
  cause?: unknown
  suggestion?: string
  ext?: Record<string, unknown>
  /** 由服务端明确批准公开的业务进度；边界转换为 ext，内部 ext 默认不公开。 */
  publicExt?: Record<string, unknown>
}

// ─── 标准错误码常量 ───
const CommonErrorInfo = {
  // 001-099: 初始化和配置
  NOT_INITIALIZED: '001:500',
  INIT_FAILED: '002:500',
  INIT_IN_PROGRESS: '004:500',

  // 100-199: 认证 & 授权
  UNAUTHORIZED: '100:401',
  FORBIDDEN: '101:403',
  TOKEN_EXPIRED: '102:401',
  TOKEN_INVALID: '103:401',
  REQUEST_ACCESS_DENIED: '104:403',

  // 200-299: 校验 & 参数
  VALIDATION_ERROR: '200:400',
  INVALID_REQUEST: '201:400',
  PARAMETER_MISSING: '202:400',

  // 300-399: 资源操作
  NOT_FOUND: '300:404',
  ALREADY_EXISTS: '301:409',
  CONFLICT: '302:409',

  // 400-499: 外部依赖
  API_ERROR: '400:502',
  NETWORK_ERROR: '401:502',
  TIMEOUT: '402:504',
  SERVICE_UNAVAILABLE: '403:503',

  // 500-599: 内部错误
  INTERNAL_ERROR: '500:500',
  DATABASE_ERROR: '501:500',
  UNKNOWN_ERROR: '599:500',
} as const satisfies ErrorInfo
/**
 * 跨模块通用错误定义及 HTTP 状态映射。
 * @example
 * ```ts
 * import { err, HaiCommonError } from '@h-ai/core'
 * const result = err(HaiCommonError.UNAUTHORIZED, 'Authentication required')
 * if (!result.success) result.error.code
 * ```
 */
export const HaiCommonError = error.buildHaiErrorsDef('common', CommonErrorInfo)

const ConfigErrorInfo = {
  CONFIG_FILE_NOT_FOUND: '010:500',
  CONFIG_PARSE_ERROR: '011:500',
  CONFIG_VALIDATION_ERROR: '012:500',
  CONFIG_ENV_VAR_MISSING: '013:500',
  CONFIG_NOT_LOADED: '014:500',
} as const satisfies ErrorInfo

/**
 * 文件配置加载、校验、环境缺失及缓存读取的错误定义。
 * @example
 * ```ts
 * import { err, HaiConfigError } from '@h-ai/core'
 * const result = err(HaiConfigError.CONFIG_NOT_LOADED, 'App configuration is unavailable')
 * if (!result.success) result.error.message
 * ```
 */
export const HaiConfigError = error.buildHaiErrorsDef('core', ConfigErrorInfo)

// ─── 2 分页类型 ───

/**
 * 分页参数输入（可选字段，未提供时使用默认值）。
 * @example
 * ```ts
 * import type { PaginationOptionsInput } from '@h-ai/core'
 * const value: PaginationOptionsInput = { page: 2, pageSize: 20 }
 * ```
 */
export interface PaginationOptionsInput {
  /** 页码（从 1 开始，默认 1） */
  page?: number
  /** 每页数量（默认由业务层决定） */
  pageSize?: number
}

/**
 * 分页参数（必填，已确定具体值）。
 * @example
 * ```ts
 * import type { PaginationOptions } from '@h-ai/core'
 * const value: PaginationOptions = { page: 1, pageSize: 20 }
 * ```
 */
export interface PaginationOptions {
  /** 页码（从 1 开始） */
  page: number
  /** 每页数量 */
  pageSize: number
}

/**
 * 分页结果。
 *
 * @template T - 数据项类型
 * @example
 * ```ts
 * import type { PaginatedResult } from '@h-ai/core'
 * const page: PaginatedResult<{ id: string }> = { items: [{ id: 'order-1' }], total: 1, page: 1, pageSize: 20 }
 * const ids = page.items.map(item => item.id)
 * ```
 */
export interface PaginatedResult<T> {
  /** 当前页数据 */
  items: T[]
  /** 总数量 */
  total: number
  /** 页码（从 1 开始） */
  page: number
  /** 每页数量 */
  pageSize: number
}

// ─── 3. 日志类型 ───

/**
 * 日志上下文。
 * @example
 * ```ts
 * import type { LogContext } from '@h-ai/core'
 * const value: LogContext = { requestId: 'request-1', level: 'info' }
 * ```
 */
export interface LogContext {
  timestamp?: Date
  level?: LogLevel
  message?: string
  [key: string]: unknown
}

/**
 * 可信关联范围，不包含访问令牌。Node 异步请求/任务隔离，浏览器仅同步作用域。
 * @example
 * ```ts
 * import type { RequestContext } from '@h-ai/core'
 * const context: RequestContext = { requestId: 'request-1', scopeId: 'tenant-1', userId: 'user-1' }
 * ```
 */
export interface RequestContext {
  readonly requestId?: string
  readonly traceId?: string
  readonly scopeId?: string
  readonly userId?: string
  readonly jobId?: string
  /** 内部采集/存储路径可暂停观察回调，常规日志输出仍执行。 */
  readonly suppressLogObservers?: boolean
}

/**
 * 经过当前级别和脱敏策略的日志，不代表日志已持久化。
 * @example
 * ```ts
 * import type { LogRecord } from '@h-ai/core'
 * const record: LogRecord = { timestamp: 1, level: 'error', message: 'Request failed', context: { requestId: 'request-1' } }
 * ```
 */
export interface LogRecord {
  readonly timestamp: number
  readonly level: LogLevel
  readonly message: string
  readonly context: Readonly<LogContext>
}

/**
 * 同步日志观察者；只做有界内存收集，I/O 由消费者异步处理。
 * @example
 * ```ts
 * import { core, type LogObserver } from '@h-ai/core'
 * const observer: LogObserver = record => { const requestId = record.context.requestId }
 * const unsubscribe = core.logger.observe(observer)
 * unsubscribe()
 * ```
 */
export type LogObserver = (record: LogRecord) => void

/**
 * 日志选项。
 * @example
 * ```ts
 * import type { LoggerOptions } from '@h-ai/core'
 * const value: LoggerOptions = { name: 'orders', level: 'debug', context: { service: 'api' } }
 * ```
 */
export interface LoggerOptions {
  name?: string
  /** 显式级别保持不变；未指定时动态继承全局配置。 */
  level?: LogLevel
  /** 显式格式保持不变；未指定时动态继承全局配置。 */
  format?: LogFormat
  /** 固定上下文覆盖当前全局上下文，调用时上下文可进一步覆盖。 */
  context?: Record<string, unknown>
}

/**
 * Logger 接口。
 * 统一的日志记录接口，具体实现由 Provider 提供。
 * @example
 * ```ts
 * import { core, type Logger } from '@h-ai/core'
 * const logger: Logger = core.logger.child({ service: 'orders' })
 * logger.info('Order created', { orderId: 'order-1' })
 * ```
 */
export interface Logger {
  trace: (message: string, context?: LogContext) => void
  debug: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, context?: LogContext) => void
  fatal: (message: string, context?: LogContext) => void
  child: (context: Record<string, unknown>) => Logger
}

/**
 * Core 公共 Logger — Logger 实例 + 管理方法。
 * @example
 * ```ts
 * import { core, type CoreLogger } from '@h-ai/core'
 * const logger: CoreLogger = core.logger
 * logger.configure({ level: 'warn', redact: ['password'] })
 * logger.child({ component: 'worker' }).warn('Retry scheduled')
 * ```
 */
export interface CoreLogger extends Logger {
  /**
   * 观察通过日志级别与脱敏策略的记录，返回取消函数；异常与同步重入被隔离。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const records: string[] = []
   * const unsubscribe = core.logger.observe(record => { records.push(record.message) })
   * core.logger.info('Application ready')
   * unsubscribe()
   * ```
   */
  observe: (observer: LogObserver) => () => void
  /** 创建新的 Logger 实例 */
  create: (options?: LoggerOptions) => Logger
  /** 配置全局 Logger 选项，后续输出同时应用到已有默认、模块与 child Logger。 */
  configure: (config: Partial<LoggingConfig>) => void
  /** 设置全局日志级别 */
  setLevel: (level: LogLevel) => void
  /** 获取当前全局日志级别 */
  getLevel: () => LogLevel
}

/**
 * Logger 函数组合（平台实现依赖）。
 *
 * 由各平台（Node.js / Browser）提供具体实现，通过 `createCore()` 注入。
 * @example
 * ```ts
 * import { core, type LoggerFunctions } from '@h-ai/core'
 * const platform: LoggerFunctions = { createLogger: options => core.logger.create(options), getLogger: name => core.logger.create({ name }), configureLogger: config => core.logger.configure(config), setLogLevel: level => core.logger.setLevel(level), getLogLevel: () => core.logger.getLevel() }
 * platform.createLogger({ name: 'worker' }).info('Worker ready')
 * ```
 */
export interface LoggerFunctions {
  /** 创建新的 Logger 实例 */
  createLogger: (options?: LoggerOptions) => Logger
  /** 获取默认或命名 Logger 实例（单例） */
  getLogger: (name?: string) => Logger
  /** 配置全局 Logger 选项（级别、格式、上下文等） */
  configureLogger: (config: Partial<LoggingConfig>) => void
  /** 设置全局日志级别 */
  setLogLevel: (level: LogLevel) => void
  /** 获取当前全局日志级别 */
  getLogLevel: () => LogLevel
}

/**
 * Core 配置选项。
 * @example
 * ```ts
 * import type { CoreOptions } from '@h-ai/core'
 * const value: CoreOptions = { configDir: './config', watchConfig: false }
 * ```
 */
export interface CoreOptions {
  /** 日志配置 */
  logging?: Partial<LoggingConfig>
  /**
   * 配置目录（约定优于配置模式）
   *
   * 指定后会自动扫描目录中的 yml/yaml 文件：
   * - `_core.yml` → 自动使用 CoreConfigSchema 校验
   * - `_xx.yml` → 加载为 'xx'（各模块自行调用 `config.validate` 校验）
   * - `app.yml` → 加载为 'app'（需使用方自行校验）
   * 项目构建和部署配置位于根目录 hai.json，不参与运行时 YAML 扫描。
   *
   * 单项加载返回失败时记日志并继续；必需配置须检查 `config.validate` 的 success。
   * 目录扫描等文件系统异常仍可能向调用方传播。
   *
   * @example
   * ```ts
   * core.init({ configDir: './config' })
   * ```
   */
  configDir?: string
  /** 是否启用配置文件监听（默认 false） */
  watchConfig?: boolean
}

// ─── 5. i18n 公共类型 ───

/**
 * 语言代码（ISO 639-1 + 地区代码）。
 * @example
 * ```ts
 * import type { Locale } from '@h-ai/core'
 * const value: Locale = 'en-US'
 * ```
 */
export type Locale = string

/**
 * 语言信息。
 * @example
 * ```ts
 * import type { LocaleInfo } from '@h-ai/core'
 * const value: LocaleInfo = { code: 'en-US', label: 'English' }
 * ```
 */
export interface LocaleInfo {
  /** 语言代码（如 'zh-CN'、'en-US'） */
  code: Locale
  /** 显示名称（如 '简体中文'、'English'） */
  label: string
  /** 是否为从右到左书写的语言（如阿拉伯语），默认 false */
  rtl?: boolean
}

/**
 * 插值参数类型。
 *
 * 用于 i18n 消息模板中的 `{key}` 占位符替换。
 * @example
 * ```ts
 * import type { InterpolationParams } from '@h-ai/core'
 * const value: InterpolationParams = { name: 'Alice', count: 2 }
 * ```
 */
export type InterpolationParams = Record<string, string | number | boolean>

/**
 * 消息字典类型（单语言的 key-value 映射）。
 * @example
 * ```ts
 * import type { MessageDictionary } from '@h-ai/core'
 * const value: MessageDictionary = { greeting: 'Hello, {name}!' }
 * ```
 */
export type MessageDictionary = Record<string, string>

/**
 * 多语言消息集合。
 *
 * 以 locale 为键，每个 locale 下包含该语言的所有消息 key-value。
 *
 * @template K - 消息 key 的联合类型
 * @example
 * ```ts
 * import { core, type LocaleMessages } from '@h-ai/core'
 * const messages: LocaleMessages<'hello'> = { 'en-US': { hello: 'Hello, {name}!' }, 'zh-CN': { hello: '你好，{name}！' } }
 * const message = core.i18n.createMessageGetter(messages)
 * message('hello', { locale: 'en-US', params: { name: 'Alice' } })
 * ```
 */
export type LocaleMessages<K extends string = string> = Record<Locale, Record<K, string>>

/**
 * 消息获取选项。
 * @example
 * ```ts
 * import type { MessageOptions } from '@h-ai/core'
 * const value: MessageOptions = { locale: 'en-US', params: { name: 'Alice' } }
 * ```
 */
export interface MessageOptions {
  /** 指定 locale（不传时依次读取 Node 请求上下文、应用默认语言） */
  locale?: Locale
  /** 插值参数 */
  params?: InterpolationParams
}

// ─── 6. Core 服务接口 ───

/**
 * Core 服务聚合接口（createCore 返回类型）
 * @example
 * ```ts
 * import { core, type CoreFunctions } from '@h-ai/core'
 * function createRequestId(tools: CoreFunctions): string { return tools.id.request() }
 * const requestId = createRequestId(core)
 * ```
 */
export interface CoreFunctions {
  /**
   * Node 中跨 await 隔离请求关联，浏览器仅同步作用域；不向下游注入任何凭据。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * await core.context.run({ requestId: 'request-1' }, async () => {
   *   await Promise.resolve()
   *   core.logger.info('Work completed')
   * })
   * const outside = core.context.get()
   * ```
   */
  readonly context: {
    readonly get: () => Readonly<RequestContext>
    readonly run: <T>(context: RequestContext, operation: () => T) => T
  }
  /** 默认 Logger（懒加载单例），同时提供日志管理方法 */
  readonly logger: CoreLogger
  /** 国际化工具 */
  readonly i18n: I18nFn
  /** Zod 校验错误 → i18n 消息映射工具（kit / serv / api-client 共享） */
  readonly zodValidation: typeof import('./i18n/core-zod-mapper.js').zodValidation
  /** ID 生成工具 */
  readonly id: IdFn
  /** 类型检查工具 */
  readonly typeUtils: TypeUtilFn
  /** 对象操作工具 */
  readonly object: ObjectFn
  /** 脱敏工具 */
  readonly sanitize: SanitizeFn
  /** 字符串操作工具 */
  readonly string: StringFn
  /** 数组操作工具 */
  readonly array: ArrayFn
  /** 异步操作工具 */
  readonly async: AsyncFn
  /** 时间操作工具 */
  readonly time: TimeFn
  /** 错误工具 */
  readonly error: ErrorFn
  /** 模块基础工具 */
  readonly module: ModuleFn
}

/**
 * Node 专属访问工具，通过 core.access 调用；浏览器不提供该能力。
 * @example
 * ```ts
 * import { core, type AccessFunctions } from '@h-ai/core'
 * const tools: AccessFunctions = core.access
 * const check = tools.createRequestCheck(false)
 * const decision = check('/api/v1/sync', 'POST', '192.0.2.10')
 * ```
 */
export interface AccessFunctions {
  /** 规范化可信宿主地址；非法 IP 返回 undefined。 */
  normalizeClientIp: (value?: string) => string | undefined
  /** 启动编译可信代理；第二参数必须来自 socket 或受信平台。auto 只在受管私有代理部署生效。 */
  createClientIpResolver: (trustedProxies?: TrustedProxies | readonly string[]) => (request: Request, remoteAddress?: string) => string | undefined
  /** 编译共享的 IP/时间条件，供登录许可和其他可信服务端流程使用。 */
  createConditionCheck: (condition: AccessCondition) => (ip?: string) => AccessDecision
  /** 启动读取和编译请求策略；检查期间无文件 I/O、CIDR 解析或全规则扫描。 */
  createRequestCheck: (input?: RequestAccessConfigInput) => RequestAccessCheck
  /** 启动读取最大 1 MiB 的 YAML；相对路径按服务工作目录或显式目录解析，配置失败抛出安全错误。 */
  loadPolicy: (input?: RequestAccessConfigInput, baseDirectory?: string) => RequestAccessPolicy | false
}

/**
 * Node 入口的完整 Core 形态；访问检查和文件配置不属于浏览器运行时。
 * @example
 * ```ts
 * import { core, type NodeCoreFunctions } from '@h-ai/core'
 * const tools: NodeCoreFunctions = core
 * tools.init({ logging: { level: 'info' } })
 * ```
 */
export interface NodeCoreFunctions extends CoreFunctions {
  readonly access: AccessFunctions
  readonly config: ConfigFn
  readonly init: (options?: CoreOptions) => void
}

/**
 * 浏览器 Core 形态；文件配置方法明确返回不可用，不包含 Node 的 access 能力。
 * @example
 * ```ts
 * import type { BrowserCoreFunctions } from '@h-ai/core'
 * function nextId(tools: BrowserCoreFunctions) { return tools.id.request() }
 * ```
 */
export interface BrowserCoreFunctions extends CoreFunctions {
  readonly config: BrowserConfigFn
  readonly init: (options?: CoreOptions) => void
}

// ─── 配置与公共操作类型 ───

/**
 * 运行环境标识；不会自行设置进程环境或初始化模块。
 * @example
 * ```ts
 * import type { Env } from '@h-ai/core'
 * const value: Env = 'production'
 * ```
 */
export type Env = z.infer<typeof EnvSchema>

/**
 * 日志输出级别；未显式配置的 Logger 动态继承全局级别。
 * @example
 * ```ts
 * import type { LogLevel } from '@h-ai/core'
 * const value: LogLevel = 'warn'
 * ```
 */
export type LogLevel = z.infer<typeof LogLevelSchema>

/**
 * 日志输出格式：JSON 或适合终端阅读的 pretty。
 * @example
 * ```ts
 * import type { LogFormat } from '@h-ai/core'
 * const value: LogFormat = 'json'
 * ```
 */
export type LogFormat = z.infer<typeof LogFormatSchema>

/**
 * 经过默认值填充的 Logger 配置；redact 是输出脱敏路径。
 * @example
 * ```ts
 * import { LoggingConfigSchema, type LoggingConfig } from '@h-ai/core'
 * const config: LoggingConfig = LoggingConfigSchema.parse({})
 * ```
 */
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>

/**
 * 严格校验后的 Core 配置；业务配置使用独立 Schema。
 * @example
 * ```ts
 * import { CoreConfigSchema, type CoreConfig } from '@h-ai/core'
 * const config: CoreConfig = CoreConfigSchema.parse({})
 * ```
 */
export type CoreConfig = z.infer<typeof CoreConfigSchema>

/**
 * 可信代理配置；空数组显式忽略全部转发头。
 * @example
 * ```ts
 * import type { TrustedProxies } from '@h-ai/core'
 * const proxies: TrustedProxies = []
 * ```
 */
export type TrustedProxies = z.infer<typeof TrustedProxiesSchema>

/**
 * 已补齐默认值的 IP/时间条件。
 * @example
 * ```ts
 * import { AccessConditionSchema, type AccessCondition } from '@h-ai/core'
 * const condition: AccessCondition = AccessConditionSchema.parse({})
 * ```
 */
export type AccessCondition = z.infer<typeof AccessConditionSchema>

/**
 * 已验证的请求策略。
 * @example
 * ```ts
 * import { RequestAccessPolicySchema, type RequestAccessPolicy } from '@h-ai/core'
 * const policy: RequestAccessPolicy = RequestAccessPolicySchema.parse({ rules: [] })
 * ```
 */
export type RequestAccessPolicy = z.infer<typeof RequestAccessPolicySchema>

/**
 * 请求访问策略的输入；默认关闭由宿主配置决定。
 * @example
 * ```ts
 * import type { RequestAccessConfigInput } from '@h-ai/core'
 * const input: RequestAccessConfigInput = { rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.10'] }] }
 * ```
 */
export type RequestAccessConfigInput = z.input<typeof RequestAccessConfigSchema>

/**
 * 路径的应用层加解密要求；不改变 TLS、身份鉴别或访问条件。
 * @example
 * ```ts
 * import type { RequestEncryptionMode } from '@h-ai/core'
 * const mode: RequestEncryptionMode = 'disabled'
 * ```
 */
export type RequestEncryptionMode = NonNullable<RequestAccessPolicy['rules'][number]['encryption']>

/**
 * 启动编译后的请求检查器；加密选择只查路径索引，不重新计算 IP 或时间条件。
 * @example
 * ```ts
 * import { core, type RequestAccessCheck } from '@h-ai/core'
 * const check: RequestAccessCheck = core.access.createRequestCheck({ rules: [{ id: 'partner', paths: ['/api/v1/partner/**'], encryption: 'disabled' }] })
 * const mode = check.encryption('/api/v1/partner/sync', 'POST')
 * const decision = check('/api/v1/partner/sync', 'POST', '192.0.2.10')
 * ```
 */
export interface RequestAccessCheck {
  (pathname: string, method: string, ip?: string): AccessDecision
  /** 是否存在强制加密的规则；宿主未装配加密时必须拒绝启动。 */
  readonly requiresEncryption: boolean
  /** 选取路径及方法对应的模式；undefined 表示沿用宿主；无请求期 I/O 或全规则扫描。 */
  readonly encryption: (pathname: string, method: string) => RequestEncryptionMode | undefined
}

/**
 * 安全判断只携带原因类别及规则编号，不向调用方复制策略内容。
 * @example
 * ```ts
 * import type { AccessDecision } from '@h-ai/core'
 * const decision: AccessDecision = { allowed: false, reason: 'address', ruleId: 'external' }
 * ```
 */
export type AccessDecision = Readonly<{ allowed: true } | { allowed: false, reason: 'address' | 'time' | 'path', ruleId?: string }>

/**
 * id 子工具类型
 * @example
 * ```ts
 * import { core, type IdFn } from '@h-ai/core'
 * const tools: IdFn = core.id
 * tools.withPrefix('order_')
 * ```
 */
export type IdFn = typeof id

/**
 * error 子工具类型
 * @example 模块内部上下文
 * ```ts
 * const tools: ErrorFn = error
 * tools.buildHaiErrorsDef('orders', { NOT_FOUND: '001:404' })
 * ```
 */
export type ErrorFn = typeof error

/**
 * 监听回调类型。
 *
 * @template T - 配置数据类型
 * @example 模块内部上下文
 * ```ts
 * const callback: WatchCallback<{ enabled: boolean }> = (config, failure) => {
 *   if (failure) { messages.push(failure.message); return }
 *   if (config) messages.push(String(config.enabled))
 * }
 * const messages: string[] = []
 * ```
 */
export type WatchCallback<T = unknown> = (config: T | null, error?: HaiError) => void

/**
 * config 子工具类型
 * @example
 * ```ts
 * import { core, type ConfigFn } from '@h-ai/core'
 * const result = core.config.load('app', '/srv/app/config/app.yml')
 * if (!result.success) result.error.message
 * ```
 */
export type ConfigFn = typeof nodeConfig

/**
 * config 子工具类型
 * @example
 * ```ts
 * import { core, type BrowserConfigFn } from '@h-ai/core'
 * const result = core.config.load('app', '/srv/app/config/app.yml')
 * if (!result.success) result.error.message
 * ```
 */
export type BrowserConfigFn = typeof browserConfig

/**
 * i18n 子工具类型
 * @example
 * ```ts
 * import { core, type I18nFn } from '@h-ai/core'
 * const tools: I18nFn = core.i18n
 * const message = tools.createMessageGetter({ 'en-US': { hello: 'Hello' }, 'zh-CN': { hello: '你好' } })
 * message('hello', { locale: 'en-US' })
 * ```
 */
export type I18nFn = typeof i18n

/**
 * array 子工具类型
 * @example
 * ```ts
 * import { core, type ArrayFn } from '@h-ai/core'
 * const tools: ArrayFn = core.array
 * tools.chunk([1, 2, 3], 2)
 * ```
 */
export type ArrayFn = typeof array

/**
 * async 子工具类型
 * @example
 * ```ts
 * import { core, type AsyncFn } from '@h-ai/core'
 * const tools: AsyncFn = core.async
 * await tools.retry(async () => 'ready', { maxRetries: 2 })
 * ```
 */
export type AsyncFn = typeof async

/**
 * object 子工具类型
 * @example
 * ```ts
 * import { core, type ObjectFn } from '@h-ai/core'
 * const tools: ObjectFn = core.object
 * tools.pick({ id: 'order-1', password: 'example-only' }, ['id'])
 * ```
 */
export type ObjectFn = typeof object

/**
 * string 子工具类型
 * @example
 * ```ts
 * import { core, type StringFn } from '@h-ai/core'
 * const tools: StringFn = core.string
 * tools.camelCase('order-created')
 * ```
 */
export type StringFn = typeof string

/**
 * time 子工具类型
 * @example
 * ```ts
 * import { core, type TimeFn } from '@h-ai/core'
 * const tools: TimeFn = core.time
 * tools.addDays(new Date('2026-01-01T00:00:00Z'), 1)
 * ```
 */
export type TimeFn = typeof time

/**
 * typeUtils 子工具类型
 * @example
 * ```ts
 * import { core, type TypeUtilFn } from '@h-ai/core'
 * const tools: TypeUtilFn = core.typeUtils
 * const value: unknown = 'order-1'
 * if (tools.isString(value)) value.toUpperCase()
 * ```
 */
export type TypeUtilFn = typeof typeUtils

// ─── 未初始化工具集 ───

/**
 * 未初始化工具集返回类型。
 *
 * 提供错误创建、HaiResult 包装和 Proxy 代理等能力，
 * 用于模块未初始化时的安全回退。
 *
 * @template E - 模块错误类型（必须继承 HaiError）
 * @example
 * ```ts
 * import { core, type HaiError, type NotInitializedKit } from '@h-ai/core'
 * const state: NotInitializedKit<HaiError> = core.module.createNotInitializedKit({ code: 'app:orders:001', httpStatus: 503, system: 'app', module: 'orders' }, () => 'Orders unavailable')
 * const result = state.result<string>()
 * if (!result.success) result.error.message
 * ```
 */
export interface NotInitializedKit<E extends HaiError> {
  /** 创建未初始化错误对象 */
  error: () => E
  /** 创建包含未初始化错误的失败 HaiResult */
  result: <T>() => HaiResult<T>
  /**
   * 创建 Proxy 代理，拦截所有方法调用并返回未初始化错误。
   *
   * @param mode - 'async'（默认）所有方法返回 `Promise<HaiResult>`；'sync' 所有方法返回 `HaiResult`
   */
  proxy: <T>(mode?: 'async' | 'sync') => T
}

/** module 子工具类型 */
/**
 * 未初始化代理的两个重载：错误定义或具体错误码。
 * @example
 * ```ts
 * import { core, type CreateNotInitializedKitFn } from '@h-ai/core'
 * const create: CreateNotInitializedKitFn = core.module.createNotInitializedKit
 * const state = create({ code: 'app:orders:001', httpStatus: 503, system: 'app', module: 'orders' }, () => 'Orders unavailable')
 * const result = state.result<string>()
 * if (!result.success) result.error.code
 * ```
 */
export interface CreateNotInitializedKitFn {
  (codeOrDef: HaiErrorDef, messageFn: () => string): NotInitializedKit<HaiError>
  <E extends HaiError>(codeOrDef: E['code'], messageFn: () => string): NotInitializedKit<E>
}

/**
 * 模块初始化占位与生产共享状态要求的工具契约。
 * @example 模块内部上下文
 * ```ts
 * function createHostRuntime(tools: ModuleFn) { return tools.createRuntime([]) }
 * ```
 */
export interface ModuleFn {
  /** 顺序启动和反序关闭真实模块；不持有业务配置。 */
  createRuntime: typeof createRuntime
  createNotInitializedKit: CreateNotInitializedKitFn
  /** 生产共享状态要求；浏览器工具为纯函数，不隐式读取进程环境。 */
  requiresSharedState: typeof requiresSharedState
}

/**
 * 敏感字段匹配器
 * @example
 * ```ts
 * import { core, type SensitiveKeyMatcher } from '@h-ai/core'
 * const matcher: SensitiveKeyMatcher = ['password', 'credential']
 * const safe = core.sanitize.sanitizeSensitiveFields({ credential: 'example-only', id: 'order-1' }, { matcher })
 * ```
 */
export type SensitiveKeyMatcher = RegExp | string[] | ((key: string) => boolean)

/**
 * 敏感字段脱敏选项
 * @example
 * ```ts
 * import { core, type SanitizeSensitiveFieldsOptions } from '@h-ai/core'
 * const options: SanitizeSensitiveFieldsOptions = { matcher: ['credential'], replacement: '[HIDDEN]' }
 * const safe = core.sanitize.sanitizeSensitiveFields({ credential: 'example-only' }, options)
 * ```
 */
export interface SanitizeSensitiveFieldsOptions {
  /** 自定义敏感字段匹配规则 */
  matcher?: SensitiveKeyMatcher
  /** 自定义脱敏替换值 */
  replacement?: unknown
}

/**
 * sanitize 子工具类型
 * @example
 * ```ts
 * import { core, type SanitizeFn } from '@h-ai/core'
 * const tools: SanitizeFn = core.sanitize
 * tools.sanitizeSensitiveFields({ apiKey: 'example-only', id: 'order-1' })
 * ```
 */
export type SanitizeFn = typeof sanitize

/**
 * 单个真实模块或业务钩子的资源所有权；close 应可重试。
 * @example 模块内部上下文
 * ```ts
 * const step: RuntimeStep = { name: 'example', start: () => {}, close: () => {} }
 * ```
 */
export interface RuntimeStep {
  name: string
  enabled?: () => boolean
  start: () => void | HaiResult<unknown> | Promise<void | HaiResult<unknown>>
  close: () => void | HaiResult<unknown> | Promise<void | HaiResult<unknown>>
}

/**
 * 初始化和关闭合并并发调用；失败关闭保留自身及尚未关闭的依赖，供下次重试。
 * @example
 * ```ts
 * import { core, type ModuleRuntime } from '@h-ai/core'
 * const runtime: ModuleRuntime = core.module.createRuntime([])
 * await runtime.close()
 * ```
 */
export interface ModuleRuntime {
  readonly isInitialized: boolean
  start: () => Promise<HaiResult<void>>
  close: () => Promise<HaiResult<void>>
}
