/**
 * @h-ai/serv — 校验工具
 *
 * 为 API service 提供与 kit 对等的校验 i18n 能力：
 * - {@link resolveRequestLocale}：从请求头（`x-hai-locale` / `Accept-Language`）解析语言。
 * - {@link validateInputOrFail}：在 procedure 内显式校验数据，失败返回 `HaiResult` 错误。
 * - oRPC contract 输入校验失败的自动本地化由 `serv-app.ts` 中的 oRPC 响应拦截器处理。
 *
 * @module serv-validation
 */

import type { HaiResult, ValidationFormError } from '@h-ai/core'
import type { ZodType } from 'zod'
import type { ServMessageKey } from './serv-i18n.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { normalizeServLocale, servM } from './serv-i18n.js'

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
 * 返回值会被规范化为 serv 当前支持的 locale（如 `en` → `en-US`）。
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
  if (explicit)
    return normalizeServLocale(explicit)

  return normalizeServLocale(get('accept-language') ?? get('Accept-Language') ?? DEFAULT_LOCALE)
}

/**
 * 把 Zod 错误转为本地化的扁平错误列表。
 *
 * @param zodError - Zod `SafeParseError` 或 `ZodError`
 * @param locale - 期望 locale
 */
export function localizeZodError(zodError: unknown, locale: string): ValidationFormError[] {
  const resolvedLocale = normalizeServLocale(locale)
  return core.zodValidation.mapZodErrorToFormErrors(
    zodError,
    core.zodValidation.createPrefixedZodMessageGetter<ServMessageKey>(
      'serv',
      (messageKey, params) => servM(messageKey, { locale: resolvedLocale, params }),
    ),
  )
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
 * import { serv } from '@h-ai/serv'
 *
 * const Schema = z.object({ name: z.string().min(1) })
 *
 * export const handler = serv.mapHaiError(async ({ input, context }) => {
 *   const result = serv.validateInputOrFail(Schema, input, context.locale)
 *   if (!result.success) return result
 *   const { name } = result.data
 *   // ...
 * })
 * ```
 *
 * @param schema - Zod schema
 * @param input - 待校验数据
 * @param locale - 期望 locale（通常来自请求上下文）
 */
export function validateInputOrFail<TOutput>(
  schema: ZodType<TOutput>,
  input: unknown,
  locale: string = DEFAULT_LOCALE,
): HaiResult<TOutput> {
  const resolvedLocale = normalizeServLocale(locale)
  const result = schema.safeParse(input)
  if (result.success)
    return ok(result.data)
  const errors = localizeZodError(result.error, resolvedLocale)
  return err(HaiCommonError.VALIDATION_ERROR, servM('serv_validationFailed', { locale: resolvedLocale }), errors)
}
