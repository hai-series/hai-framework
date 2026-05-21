/**
 * @h-ai/serv — 校验工具
 *
 * 为 API service 提供与 kit 对等的校验 i18n 能力：
 * - {@link resolveRequestLocale}：从请求头（`x-hai-locale` / `Accept-Language`）解析语言。
 * - {@link buildServZodMessageGetter}：基于请求 locale 构造注入式 `ZodMessageGetter`。
 * - {@link validateInputOrFail}：在 procedure 内显式校验数据，失败返回 `HaiResult` 错误。
 * - oRPC contract 输入校验失败的自动本地化由 `serv-app.ts` 中的 oRPC 响应拦截器处理。
 *
 * @module serv-validation
 */

import type {
  HaiResult,
  ValidationFormError,
  ZodMessageGetter,
  ZodValidationMessageKey,
} from '@h-ai/core'
import type { ServMessageKey } from './serv-i18n.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { servM } from './serv-i18n.js'

/** 支持的 locale 列表（与 messages/ 目录对齐）。 */
const SUPPORTED_LOCALES: readonly string[] = ['zh-CN', 'en-US']
const DEFAULT_LOCALE = 'zh-CN'

/**
 * 校验失败响应体（含 i18n 错误列表）。
 *
 * 复用 `HaiResult` 失败分支结构，额外携带 `errors` 字段供前端定位字段错误。
 */
export interface ServValidationFailureBody {
  readonly success: false
  readonly error: {
    readonly code: string | number
    readonly message: string
    readonly httpStatus: number
    readonly system: string
    readonly module: string
  }
  readonly errors: readonly ValidationFormError[]
}

/**
 * 从请求头解析客户端期望 locale。
 *
 * 优先级：`x-hai-locale` > `Accept-Language` 第一个匹配项 > 默认值（`zh-CN`）。
 * 仅返回 {@link SUPPORTED_LOCALES} 中的语言，未匹配时返回默认值。
 *
 * @param headers - 请求头（`Headers` 或与之等价的对象）
 * @returns 解析得到的 locale
 */
export function resolveRequestLocale(headers: Headers | Record<string, string | undefined>): string {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers)
      return headers.get(name) ?? undefined
    return headers[name] ?? headers[name.toLowerCase()]
  }

  const explicit = get('x-hai-locale')
  if (explicit && SUPPORTED_LOCALES.includes(explicit))
    return explicit

  const acceptLanguage = get('accept-language') ?? get('Accept-Language')
  if (!acceptLanguage)
    return DEFAULT_LOCALE

  // 解析 Accept-Language 头，例如：`zh-CN,zh;q=0.9,en;q=0.8`
  const tags = acceptLanguage
    .split(',')
    .map(tag => tag.split(';')[0]?.trim())
    .filter((tag): tag is string => Boolean(tag))

  for (const tag of tags) {
    if (SUPPORTED_LOCALES.includes(tag))
      return tag
    // 宽松匹配：`en` → `en-US`
    const matched = SUPPORTED_LOCALES.find(loc => loc.toLowerCase().startsWith(tag.toLowerCase()))
    if (matched)
      return matched
  }

  return DEFAULT_LOCALE
}

/**
 * 构造与 serv 消息表对齐的 `ZodMessageGetter`。
 *
 * 把统一的 {@link ZodValidationMessageKey} 映射到 `serv_*` i18n key，
 * 调用时携带请求 locale，避免多并发请求互相覆盖全局 locale。
 *
 * @param locale - 请求 locale（通常由 {@link resolveRequestLocale} 得到）
 * @returns 注入给 `core.zodValidation.*` 的消息获取器
 */
export function buildServZodMessageGetter(locale: string): ZodMessageGetter {
  const KEY_MAP: Record<ZodValidationMessageKey, ServMessageKey> = {
    validationFailed: 'serv_validationFailed',
    validationRequired: 'serv_validationRequired',
    validationInvalid: 'serv_validationInvalid',
    validationInvalidType: 'serv_validationInvalidType',
    validationStringMin: 'serv_validationStringMin',
    validationStringMax: 'serv_validationStringMax',
    validationNumberMin: 'serv_validationNumberMin',
    validationNumberMax: 'serv_validationNumberMax',
    validationArrayMin: 'serv_validationArrayMin',
    validationArrayMax: 'serv_validationArrayMax',
    validationTooSmall: 'serv_validationTooSmall',
    validationTooBig: 'serv_validationTooBig',
    validationEmail: 'serv_validationEmail',
    validationUrl: 'serv_validationUrl',
    validationUuid: 'serv_validationUuid',
    validationEnum: 'serv_validationEnum',
  }
  return (key, params) => servM(KEY_MAP[key], { locale, params })
}

/**
 * 把 Zod 错误转为本地化的扁平错误列表。
 *
 * @param zodError - Zod `SafeParseError` 或 `ZodError`
 * @param locale - 期望 locale
 */
export function localizeZodError(zodError: unknown, locale: string): ValidationFormError[] {
  return core.zodValidation.mapZodErrorToFormErrors(zodError, buildServZodMessageGetter(locale))
}

/**
 * 在 procedure handler 内显式校验数据。
 *
 * 与 oRPC contract 自动校验不同，本函数用于业务层二次校验（例如对从数据库读到的对象再校验）。
 * 失败时返回 `HaiResult` 错误分支，错误的 `cause` 字段携带 `ValidationFormError[]`。
 *
 * 推荐使用方式：
 * ```ts
 * import { z } from 'zod'
 * import { validateInputOrFail } from '@h-ai/serv'
 *
 * const Schema = z.object({ name: z.string().min(1) })
 *
 * export const handler = serv.mapHaiError(async ({ input, context }) => {
 *   const result = validateInputOrFail(Schema, input, context.locale)
 *   if (!result.success) return result
 *   const { name } = result.data
 *   // ...
 * })
 * ```
 *
 * @param schema - 任意符合 zod `safeParse` 协议的对象
 * @param input - 待校验数据
 * @param locale - 期望 locale（通常来自请求上下文）
 */
export function validateInputOrFail<TSchema extends { safeParse: (input: unknown) => { success: boolean, data?: unknown, error?: unknown } }, TOutput = unknown>(
  schema: TSchema,
  input: unknown,
  locale: string = DEFAULT_LOCALE,
): HaiResult<TOutput> {
  const result = schema.safeParse(input)
  if (result.success)
    return ok(result.data as TOutput)
  const errors = localizeZodError(result.error, locale)
  const message = servM('serv_validationFailed', { locale })
  return err(HaiCommonError.VALIDATION_ERROR, message, errors)
}

/**
 * 构造与 `HaiResult` 失败分支对齐的校验失败响应体。
 *
 * 由 serv-app 内的 oRPC 响应拦截器使用，把 oRPC 默认 400 错误重写为带 i18n
 * 与 `errors[]` 的响应体。
 */
export function buildValidationFailureBody(
  locale: string,
  errors: readonly ValidationFormError[],
): ServValidationFailureBody {
  return {
    success: false,
    error: {
      code: HaiCommonError.VALIDATION_ERROR.code,
      message: servM('serv_validationFailed', { locale }),
      httpStatus: HaiCommonError.VALIDATION_ERROR.httpStatus,
      system: HaiCommonError.VALIDATION_ERROR.system,
      module: HaiCommonError.VALIDATION_ERROR.module,
    },
    errors,
  }
}
