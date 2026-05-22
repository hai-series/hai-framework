/**
 * @h-ai/kit — 请求数据验证
 *
 * 基于 Zod 的请求数据验证工具，支持表单/JSON Body、URL 查询参数与路由参数。
 * Zod 默认错误消息的本地化规则委托给 `core.zodValidation`，避免 kit / serv
 * 等模块重复维护同一套 issue 解析与消息映射逻辑；模块前缀映射也统一交给
 * `core.zodValidation.createPrefixedZodMessageGetter()` 处理。
 * 每种数据源都提供两类 API：
 * - 安全返回：`FormValidationResult`
 * - 失败抛出：`OrFail`（抛出 `Response` 以走 SvelteKit 控制流）
 * @module kit-validation
 */

import type { z } from 'zod'
import type { FormValidationResult } from './kit-types.js'
import { core } from '@h-ai/core'
import { z as zod } from 'zod'
import { kitM } from './kit-i18n.js'
import { badRequest } from './kit-response.js'

// ─── 内部工具 ───

/**
 * 构造与 kit 消息表对齐的 `ZodMessageGetter`。
 *
 * 统一复用 `core.zodValidation` 的 Zod issue 解析与默认消息识别逻辑，
 * kit 仅提供自己的消息获取器。
 */
const getKitZodMessage = core.zodValidation.createPrefixedZodMessageGetter<Parameters<typeof kitM>[0]>(
  'kit',
  (messageKey, params) => kitM(messageKey, { params }),
)

function validateParsedData<T extends z.ZodType>(
  data: unknown,
  schema: T,
): FormValidationResult<z.infer<T>> {
  const result = schema.safeParse(data)
  if (result.success)
    return { valid: true, data: result.data, errors: [] }
  return {
    valid: false,
    errors: core.zodValidation.mapZodErrorToFormErrors(result.error, getKitZodMessage),
  }
}

function unwrapValidationResultOrThrow<T>(result: FormValidationResult<T>): T {
  if (result.valid && result.data !== undefined)
    return result.data

  throw badRequest(
    result.errors[0]?.message ?? kitM('kit_validationFailed'),
    undefined,
    { errors: result.errors },
  )
}

// ─── 公共验证函数 ───

/**
 * 从 Request 解析并验证表单数据
 *
 * 支持 `application/json` 和 `multipart/form-data` / `application/x-www-form-urlencoded`。
 * 其他 Content-Type 返回全局错误 `{ field: '_', message: 'Unsupported content type' }`。
 *
 * @param request - SvelteKit 请求对象
 * @param schema - Zod Schema
 * @returns 验证结果；成功时 `valid: true` 且 `data` 类型安全
 *
 * @example
 * ```ts
 * const { valid, data, errors } = await kit.validate.form(event.request, CreateUserSchema)
 * if (!valid) return kit.response.validationError(errors)
 * ```
 */
export async function validateForm<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<FormValidationResult<z.infer<T>>> {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    let data: unknown

    if (contentType.includes('application/json')) {
      data = await request.json()
    }
    else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      data = Object.fromEntries(formData)
    }
    else {
      return {
        valid: false,
        errors: [{ field: '_', message: kitM('kit_unsupportedContentType') }],
      }
    }

    return validateParsedData(data, schema)
  }
  catch {
    return {
      valid: false,
      errors: [{ field: '_', message: kitM('kit_parseBodyFailed') }],
    }
  }
}

/**
 * 从 URL 查询参数验证
 *
 * 将 `url.searchParams` 转为普通对象后交给 Zod 校验。
 * 适用于 GET 请求的分页、搜索等场景。
 *
 * @param url - 请求 URL 对象
 * @param schema - Zod Schema
 * @returns 验证结果
 *
 * @example
 * ```ts
 * const { valid, data } = kit.validate.query(event.url, PaginationSchema)
 * ```
 */
export function validateQuery<T extends z.ZodType>(
  url: URL,
  schema: T,
): FormValidationResult<z.infer<T>> {
  const data = Object.fromEntries(url.searchParams)
  return validateParsedData(data, schema)
}

/**
 * 验证路径参数
 *
 * 将 SvelteKit 路由 `params` 交给 Zod 校验，适用于动态路由段的类型安全校验。
 *
 * @param params - SvelteKit 路由参数（`event.params`）
 * @param schema - Zod Schema
 * @returns 验证结果
 *
 * @example
 * ```ts
 * const { valid, data } = kit.validate.params(event.params, z.object({ id: z.string().uuid() }))
 * ```
 */
export function validateParams<T extends z.ZodType>(
  params: Record<string, string>,
  schema: T,
): FormValidationResult<z.infer<T>> {
  return validateParsedData(params, schema)
}

// ─── OrFail 变体 — 校验失败时抛出 Response（SvelteKit 控制流） ───

/**
 * 从 Request 解析并验证表单数据，失败时 throw Response
 *
 * 与 `validateForm` 功能相同，但校验失败时 throw 400 Response（SvelteKit 控制流），
 * 搭配 `kit.handler()` 使用可精简 handler 代码。
 *
 * @param request - SvelteKit 请求对象
 * @param schema - Zod Schema
 * @returns 校验通过的数据（类型安全）
 * @throws Response - 400 BadRequest（含首条错误消息）
 *
 * @example
 * ```ts
 * export const POST = kit.handler(async ({ request }) => {
 *   const data = await kit.validate.body(request, CreateUserSchema)
 *   // data 类型安全，校验已通过
 * })
 * ```
 */
export async function validateFormOrFail<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  return unwrapValidationResultOrThrow(await validateForm(request, schema))
}

/**
 * 从 URL 查询参数验证，失败时 throw Response
 *
 * @param url - 请求 URL 对象
 * @param schema - Zod Schema
 * @returns 校验通过的数据
 * @throws Response - 400 BadRequest
 *
 * @example
 * ```ts
 * const query = kit.validate.query(event.url, PaginationSchema)
 * ```
 */
export function validateQueryOrFail<T extends z.ZodType>(
  url: URL,
  schema: T,
): z.infer<T> {
  return unwrapValidationResultOrThrow(validateQuery(url, schema))
}

/**
 * 验证路径参数，失败时 throw Response
 *
 * @param params - SvelteKit 路由参数
 * @param schema - Zod Schema
 * @returns 校验通过的数据
 * @throws Response - 400 BadRequest
 *
 * @example
 * ```ts
 * const { id } = kit.validate.params(event.params, IdParamSchema)
 * ```
 */
export function validateParamsOrFail<T extends z.ZodType>(
  params: Record<string, string>,
  schema: T,
): z.infer<T> {
  return unwrapValidationResultOrThrow(validateParams(params, schema))
}

// ─── 通用 Schema ───

/**
 * 路径参数 id 校验 Schema
 *
 * 验证 `event.params.id` 为非空字符串。
 *
 * @example
 * ```ts
 * const { id } = kit.validate.params(event.params, IdParamSchema)
 * ```
 */
export const IdParamSchema = zod.object({
  id: zod.string().min(1, kitM('kit_idRequired')),
})

/** 分页 pageSize 上限 */
const MAX_PAGE_SIZE = 100

/**
 * 通用分页查询参数 Schema
 *
 * 包含 page（默认 1）、pageSize（默认 20，上限 100）、search（可选）。
 * 可通过 `.extend()` 扩展业务字段。
 *
 * @example
 * ```ts
 * // 直接使用
 * const { page, pageSize, search } = kit.validate.query(url, PaginationQuerySchema)
 *
 * // 扩展业务字段
 * const ListUsersSchema = PaginationQuerySchema.extend({
 *   enabled: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
 * })
 * ```
 */
export const PaginationQuerySchema = zod.object({
  page: zod.coerce.number().int().min(1).default(1),
  pageSize: zod.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  search: zod.string().optional(),
})
