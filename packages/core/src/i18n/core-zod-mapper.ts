import type {
  ValidationFormError,
  ZodMessageGetter,
} from '../core-types.js'

/**
 * @h-ai/core — Zod 校验错误的 i18n 映射工具
 *
 * 把 Zod (v3/v4) 的 issue 列表转换为带本地化消息的扁平错误列表。
 *
 * 设计原则：
 * - 不依赖 Zod 类型（接口结构体即可），避免在 core 引入 zod 运行时依赖。
 * - 不绑定具体的 i18n 字典；调用方注入 `ZodMessageGetter`，由 kit / serv / api-client
 *   各自映射到自己的消息表。
 * - 只翻译 Zod 默认英文消息；schema 中显式传入的业务消息原样保留。
 *
 * 适合在表单校验、接口入参校验、配置校验等场景下，把 Zod 默认英文错误统一映射为
 * 调用方模块自己的本地化消息。
 *
 * @example
 * ```ts
 * import type { ZodMessageGetter } from '@h-ai/core'
 * import { core } from '@h-ai/core'
 * import { z } from 'zod'
 *
 * const LoginSchema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * })
 *
 * const getMessage: ZodMessageGetter
 *   = core.zodValidation.createPrefixedZodMessageGetter('serv', (messageKey, params) => {
 *     if (messageKey === 'serv_validationEmail')
 *       return '请输入合法邮箱地址'
 *     if (messageKey === 'serv_validationStringMin')
 *       return `至少输入 ${params?.min} 个字符`
 *     return '输入不合法'
 *   })
 *
 * const result = LoginSchema.safeParse({ email: 'bad', password: '123' })
 * if (!result.success) {
 *   const errors = core.zodValidation.mapZodErrorToFormErrors(result.error, getMessage)
 *   // errors => [
 *   //   { field: 'email', message: '请输入合法邮箱地址' },
 *   //   { field: 'password', message: '至少输入 8 个字符' },
 *   // ]
 * }
 * ```
 *
 * @module core-zod-mapper
 */

// ─── 类型 ───

/**
 * Zod issue 的结构子集（同时兼容 Zod v3 / v4）。
 *
 * 没有引入 `zod` 类型依赖，避免 core 拖入 zod 运行时；只声明读取所需的字段。
 *
 * @example
 * ```ts
 * const issue: ZodIssueLike = {
 *   path: ['profile', 'email'],
 *   code: 'invalid_format',
 *   format: 'email',
 *   message: 'Invalid email address',
 * }
 * ```
 */
interface ZodIssueLike {
  /** 字段路径片段；后续通常会被拼接为 `profile.email` 这类点号路径。 */
  path: (string | number)[]
  /** Zod 生成的原始消息；若是业务自定义消息，会被原样保留。 */
  message: string
  /** Zod issue code，例如 `invalid_type`、`too_small`、`invalid_format`。 */
  code?: string
  /** 期望类型（常见于 `invalid_type` 场景）。 */
  expected?: string
  /** 实际收到的类型（例如 `undefined`、`string`）。 */
  received?: string
  /** Zod v4 中的目标类别，例如 `string`、`number`、`array`。 */
  origin?: string
  /** Zod v3 中的目标类别补充字段。 */
  type?: string
  /** Zod v4 中的格式标识，例如 `email`、`url`、`uuid`。 */
  format?: string
  /** Zod v3/v4 兼容的格式信息字段。 */
  validation?: unknown
  /** 最小限制值；用于 `too_small` 错误映射。 */
  minimum?: number | bigint
  /** 最大限制值；用于 `too_big` 错误映射。 */
  maximum?: number | bigint
}

/**
 * 校验消息 key 集合（locale 无关的标识符）。
 *
 * 调用方负责把每个 key 映射到自己模块的 i18n 字典（例如 kit 的
 * `kit_validationStringMin`、serv 的 `serv_validationStringMin`）。
 *
 * @example
 * ```ts
 * const key: ZodValidationMessageKey = 'validationRequired'
 * ```
 */

/**
 * 创建按固定前缀派生消息 key 的 `ZodMessageGetter`。
 *
 * 适用于模块消息键遵循 `{prefix}_{ZodValidationMessageKey}` 命名约定的场景，
 * 例如 `serv_validationRequired`、`kit_validationEmail`。
 *
 * @param prefix - 模块消息前缀，如 `serv`、`kit`
 * @param getMessage - 实际消息获取函数，接收带前缀的消息 key
 * @returns 可注入给 `core.zodValidation.*` 的 `ZodMessageGetter`
 *
 * @example
 * ```ts
 * const getMessage = createPrefixedZodMessageGetter<string>(
 *   'serv',
 *   (messageKey, params) => `${messageKey}:${params?.min ?? ''}`,
 * )
 *
 * getMessage('validationStringMin', { min: 3 })
 * // 'serv_validationStringMin:3'
 * ```
 */
function createPrefixedZodMessageGetter<TMessageKey extends string>(
  prefix: string,
  getMessage: (messageKey: TMessageKey, params?: Record<string, string | number>) => string,
): ZodMessageGetter {
  return (key, params) => getMessage(`${prefix}_${key}` as TMessageKey, params)
}

/**
 * 扁平化校验错误项；与 kit 的 `FormError` 形状对齐。
 *
 * `field` 为点号拼接的字段路径（例如 `'address.city'`），全局错误使用 `'_'`。
 *
 * @example
 * ```ts
 * const formError: ValidationFormError = {
 *   field: 'address.city',
 *   message: '请输入城市',
 * }
 * ```
 */

// ─── 私有工具 ───

/** Zod 默认英文消息的正则模式列表（模块级，避免每次调用重新编译）。 */
const ZOD_DEFAULT_MESSAGE_PATTERNS: RegExp[] = [
  /^Too small:/,
  /^Too big:/,
  /^Invalid input:/,
  /^Invalid option:/,
  /^Invalid string:/,
  /^Invalid email$/,
  /^Invalid email address$/,
  /^Invalid url$/i,
  /^Invalid UUID$/,
  /^Invalid enum value/,
  /^Required$/,
  /^String must contain/,
  /^Number must be/,
  /^Array must contain/,
]

/**
 * 从 Zod SafeParseError / ZodError 中提取 issue 列表。
 *
 * 兼容 Zod v3（`errors`）和 v4（`issues`）。
 *
 * @param error - Zod `SafeParseError`、`ZodError` 或任意未知对象
 * @returns 提取后的 issue 数组；若不是 Zod 风格错误对象则返回空数组
 *
 * @example
 * ```ts
 * const issues = extractZodIssues({
 *   issues: [
 *     { path: ['email'], code: 'invalid_format', format: 'email', message: 'Invalid email address' },
 *   ],
 * })
 * ```
 */
function extractZodIssues(error: unknown): ZodIssueLike[] {
  if (!error || typeof error !== 'object')
    return []
  const obj = error as { issues?: ZodIssueLike[], errors?: ZodIssueLike[] }
  return obj.issues ?? obj.errors ?? []
}

/**
 * 判断 issue.message 是否为 Zod 自带默认英文消息。
 *
 * 仅默认英文消息会被替换为本地化文案；schema 显式传入的业务消息保留原样。
 *
 * @param message - `issue.message` 原始内容
 * @returns `true` 表示可以按默认规则本地化；`false` 表示应原样保留
 *
 * @example
 * ```ts
 * isDefaultZodMessage('Invalid email address') // true
 * isDefaultZodMessage('邮箱格式不正确') // false
 * ```
 */
function isDefaultZodMessage(message: string): boolean {
  return ZOD_DEFAULT_MESSAGE_PATTERNS.some(pattern => pattern.test(message))
}

function formatLimit(value: number | bigint | undefined): string | undefined {
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value)
  return undefined
}

function getIssueTarget(issue: ZodIssueLike): string | undefined {
  return issue.origin ?? issue.type
}

function getIssueFormat(issue: ZodIssueLike): string | undefined {
  if (typeof issue.format === 'string')
    return issue.format
  if (typeof issue.validation === 'string')
    return issue.validation
  return undefined
}

// ─── 公开 API ───

/**
 * 把单条 Zod issue 转为本地化消息。
 *
 * 如果 issue 携带自定义消息（非 Zod 默认英文），直接返回原消息。
 *
 * @param issue - 单条 Zod issue
 * @param getMessage - 调用方注入的消息获取器
 * @returns 本地化后的消息；若 issue.message 为业务自定义消息则原样返回
 *
 * @example
 * ```ts
 * const message = localizeZodIssue(
 *   {
 *     path: ['email'],
 *     code: 'invalid_format',
 *     format: 'email',
 *     message: 'Invalid email address',
 *   },
 *   key => key === 'validationEmail' ? '请输入合法邮箱地址' : '输入不合法',
 * )
 * ```
 */
function localizeZodIssue(
  issue: ZodIssueLike,
  getMessage: ZodMessageGetter,
): string {
  if (!isDefaultZodMessage(issue.message))
    return issue.message

  const target = getIssueTarget(issue)
  const format = getIssueFormat(issue)
  const min = formatLimit(issue.minimum)
  const max = formatLimit(issue.maximum)

  if (issue.code === 'too_small') {
    if (target === 'string' && min)
      return getMessage('validationStringMin', { min })
    if ((target === 'number' || target === 'bigint') && min)
      return getMessage('validationNumberMin', { min })
    if (target === 'array' && min)
      return getMessage('validationArrayMin', { min })
    if (min)
      return getMessage('validationTooSmall', { min })
  }

  if (issue.code === 'too_big') {
    if (target === 'string' && max)
      return getMessage('validationStringMax', { max })
    if ((target === 'number' || target === 'bigint') && max)
      return getMessage('validationNumberMax', { max })
    if (target === 'array' && max)
      return getMessage('validationArrayMax', { max })
    if (max)
      return getMessage('validationTooBig', { max })
  }

  if (issue.code === 'invalid_type') {
    if (issue.received === 'undefined' || issue.message.includes('received undefined'))
      return getMessage('validationRequired')
    return getMessage('validationInvalidType')
  }

  if (issue.code === 'invalid_format' || issue.code === 'invalid_string') {
    if (format === 'email')
      return getMessage('validationEmail')
    if (format === 'url')
      return getMessage('validationUrl')
    if (format === 'uuid')
      return getMessage('validationUuid')
    return getMessage('validationInvalid')
  }

  if (issue.code === 'invalid_value' || issue.code === 'invalid_enum_value')
    return getMessage('validationEnum')

  return getMessage('validationInvalid')
}

/**
 * 把 Zod issue 列表转为扁平 `ValidationFormError[]`，字段路径用点号拼接。
 *
 * @param issues - 待转换的 Zod issue 列表
 * @param getMessage - 调用方注入的消息获取器
 * @returns 扁平化后的表单错误列表
 *
 * @example
 * ```ts
 * const errors = mapZodIssuesToFormErrors(
 *   [
 *     {
 *       path: ['profile', 'email'],
 *       code: 'invalid_format',
 *       format: 'email',
 *       message: 'Invalid email address',
 *     },
 *   ],
 *   key => key === 'validationEmail' ? '请输入合法邮箱地址' : '输入不合法',
 * )
 * // [{ field: 'profile.email', message: '请输入合法邮箱地址' }]
 * ```
 */
function mapZodIssuesToFormErrors(
  issues: ZodIssueLike[],
  getMessage: ZodMessageGetter,
): ValidationFormError[] {
  return issues.map(issue => ({
    field: issue.path.join('.') || '_',
    message: localizeZodIssue(issue, getMessage),
  }))
}

/**
 * 一步把 Zod SafeParseError / ZodError 转为扁平 `ValidationFormError[]`。
 *
 * @param error - Zod `SafeParseError`、`ZodError` 或兼容的错误对象
 * @param getMessage - 调用方注入的消息获取器
 * @returns 扁平化后的表单错误列表
 *
 * @example
 * ```ts
 * const errors = mapZodErrorToFormErrors(
 *   {
 *     issues: [
 *       { path: ['email'], code: 'invalid_format', format: 'email', message: 'Invalid email address' },
 *     ],
 *   },
 *   key => key === 'validationEmail' ? '请输入合法邮箱地址' : '输入不合法',
 * )
 * ```
 */
function mapZodErrorToFormErrors(
  error: unknown,
  getMessage: ZodMessageGetter,
): ValidationFormError[] {
  return mapZodIssuesToFormErrors(extractZodIssues(error), getMessage)
}

// ─── 命名空间出口 ───

/**
 * Zod 校验 i18n 工具集合（通过 `core.zodValidation` 暴露）。
 *
 * 按最小知识原则，仅暴露调用方真正需要的两个入口：
 * 1. `createPrefixedZodMessageGetter()`：把模块前缀与消息获取器适配起来
 * 2. `mapZodErrorToFormErrors()`：一步完成 ZodError → 本地化扁平错误列表
 *
 * @example
 * ```ts
 * const getMessage = zodValidation.createPrefixedZodMessageGetter(
 *   'kit',
 *   (messageKey, params) => messageKey === 'kit_validationEmail'
 *     ? '请输入合法邮箱地址'
 *     : `至少输入 ${params?.min} 个字符`,
 * )
 * const errors = zodValidation.mapZodErrorToFormErrors(zodError, getMessage)
 * ```
 */
export const zodValidation = {
  createPrefixedZodMessageGetter,
  mapZodErrorToFormErrors,
}
