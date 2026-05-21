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
 * @module core-zod-mapper
 */

// ─── 类型 ───

/**
 * Zod issue 的结构子集（同时兼容 Zod v3 / v4）。
 *
 * 没有引入 `zod` 类型依赖，避免 core 拖入 zod 运行时；只声明读取所需的字段。
 */
export interface ZodIssueLike {
  path: (string | number)[]
  message: string
  code?: string
  expected?: string
  received?: string
  origin?: string
  type?: string
  format?: string
  validation?: unknown
  minimum?: number | bigint
  maximum?: number | bigint
}

/**
 * 校验消息 key 集合（locale 无关的标识符）。
 *
 * 调用方负责把每个 key 映射到自己模块的 i18n 字典（例如 kit 的
 * `kit_validationStringMin`、serv 的 `serv_validationStringMin`）。
 */
export type ZodValidationMessageKey
  = | 'validationFailed'
    | 'validationRequired'
    | 'validationInvalid'
    | 'validationInvalidType'
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
 * 注入式消息获取器；调用方实现把 `key + params` 渲染为本地化字符串。
 *
 * 推荐用 `core.i18n.createMessageGetter()` 创建底层 getter 后做一层适配器。
 */
export type ZodMessageGetter = (
  key: ZodValidationMessageKey,
  params?: Record<string, string | number>,
) => string

/**
 * 扁平化校验错误项；与 kit 的 `FormError` 形状对齐。
 *
 * `field` 为点号拼接的字段路径（例如 `'address.city'`），全局错误使用 `'_'`。
 */
export interface ValidationFormError {
  field: string
  message: string
}

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
 */
export function extractZodIssues(error: unknown): ZodIssueLike[] {
  if (!error || typeof error !== 'object')
    return []
  const obj = error as { issues?: ZodIssueLike[], errors?: ZodIssueLike[] }
  return obj.issues ?? obj.errors ?? []
}

/**
 * 判断 issue.message 是否为 Zod 自带默认英文消息。
 *
 * 仅默认英文消息会被替换为本地化文案；schema 显式传入的业务消息保留原样。
 */
export function isDefaultZodMessage(message: string): boolean {
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
 */
export function localizeZodIssue(
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
 */
export function mapZodIssuesToFormErrors(
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
 */
export function mapZodErrorToFormErrors(
  error: unknown,
  getMessage: ZodMessageGetter,
): ValidationFormError[] {
  return mapZodIssuesToFormErrors(extractZodIssues(error), getMessage)
}

// ─── 命名空间出口 ───

/** Zod 校验 i18n 工具集合（通过 `core.zodValidation` 暴露）。 */
export const zodValidation = {
  extractZodIssues,
  isDefaultZodMessage,
  localizeZodIssue,
  mapZodIssuesToFormErrors,
  mapZodErrorToFormErrors,
}

/** `core.zodValidation` 子工具类型。 */
export type ZodValidationFn = typeof zodValidation
