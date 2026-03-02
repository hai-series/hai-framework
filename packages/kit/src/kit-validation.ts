/**
 * @h-ai/kit — 请求数据验证
 *
 * 基于 Zod 的请求数据验证工具，支持表单/JSON Body、URL 查询参数和路由参数的 解析与校验。每种数据源提供安全返回（FormValidationResult）与抛出控制流 （OrFail / throw Response）两种变体。
 * @module kit-validation
 */

import type { z } from 'zod'
import type { FormError, FormValidationResult } from './kit-types.js'
import { z as zod } from 'zod'
import { kitM } from './kit-i18n.js'
import { badRequest } from './kit-response.js'

// ─── 内部工具 ───

/**
 * Zod 错误 issue 类型
 *
 * 用于从 Zod v3/v4 SafeParseError 中统一提取错误信息。
 */
interface ZodIssue {
  path: (string | number)[]
  message: string
}

/**
 * 从 Zod SafeParseError 提取 issues 列表
 *
 * 兼容 Zod v3（`errors`）和 v4（`issues`）。
 *
 * @param error - Zod 校验错误对象
 * @returns 平坦化的 issue 列表
 */
function extractZodIssues(error: z.ZodError): ZodIssue[] {
  // Zod v4 使用 issues，兼容旧版 errors
  const zodError = error as unknown as { issues?: ZodIssue[], errors?: ZodIssue[] }
  return zodError.issues ?? zodError.errors ?? []
}

/**
 * 将 Zod issues 转换为 `FormError` 列表
 *
 * 字段路径用点号拼接（如 `'address.city'`）。
 *
 * @param issues - Zod issue 数组
 * @returns FormError 数组
 */
function zodIssuesToFormErrors(issues: ZodIssue[]): FormError[] {
  return issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))
}

/**
 * 创建验证失败结果
 *
 * @param error - Zod 校验错误
 * @returns `{ valid: false, errors: FormError[] }`
 */
function createValidationResult<T>(error: z.ZodError): FormValidationResult<T> {
  return {
    valid: false,
    errors: zodIssuesToFormErrors(extractZodIssues(error)),
  }
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

    const result = schema.safeParse(data)

    if (result.success) {
      return { valid: true, data: result.data, errors: [] }
    }

    return createValidationResult(result.error)
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
  const result = schema.safeParse(data)

  if (result.success) {
    return { valid: true, data: result.data, errors: [] }
  }

  return createValidationResult(result.error)
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
  const result = schema.safeParse(params)

  if (result.success) {
    return { valid: true, data: result.data, errors: [] }
  }

  return createValidationResult(result.error)
}

// ─── OrFail 变体 — 校验失败时 throw Response（SvelteKit 控制流） ───

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
 *   const data = await kit.validate.formOrFail(request, CreateUserSchema)
 *   // data 类型安全，校验已通过
 * })
 * ```
 */
export async function validateFormOrFail<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const result = await validateForm(request, schema)
  if (!result.valid || !result.data) {
    throw badRequest(
      result.errors[0]?.message ?? 'Validation failed',
      undefined,
      { errors: result.errors },
    )
  }
  return result.data
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
 * const query = kit.validate.queryOrFail(event.url, PaginationSchema)
 * ```
 */
export function validateQueryOrFail<T extends z.ZodType>(
  url: URL,
  schema: T,
): z.infer<T> {
  const result = validateQuery(url, schema)
  if (!result.valid || !result.data) {
    throw badRequest(
      result.errors[0]?.message ?? 'Validation failed',
      undefined,
      { errors: result.errors },
    )
  }
  return result.data
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
 * const { id } = kit.validate.paramsOrFail(event.params, IdParamSchema)
 * ```
 */
export function validateParamsOrFail<T extends z.ZodType>(
  params: Record<string, string>,
  schema: T,
): z.infer<T> {
  const result = validateParams(params, schema)
  if (!result.valid || !result.data) {
    throw badRequest(
      result.errors[0]?.message ?? 'Validation failed',
      undefined,
      { errors: result.errors },
    )
  }
  return result.data
}

// ─── 通用 Schema ───

/**
 * 路径参数 id 校验 Schema
 *
 * 验证 `event.params.id` 为非空字符串。
 *
 * @example
 * ```ts
 * const { id } = kit.validate.paramsOrFail(event.params, IdParamSchema)
 * ```
 */
export const IdParamSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
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
 * const { page, pageSize, search } = kit.validate.queryOrFail(url, PaginationQuerySchema)
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
