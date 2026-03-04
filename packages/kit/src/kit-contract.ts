/**
 * @h-ai/kit — 契约 Handler
 *
 * 基于 EndpointDef 契约创建类型安全的 API handler：
 * - 自动从 request body/query 提取参数
 * - 自动使用契约的 input schema 校验
 * - handler 返回值类型必须匹配 output schema
 * - 自动包装为标准 kit.response.ok() 响应
 * @module kit-contract
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit'
import type { z } from 'zod'
import { handler } from './kit-handler.js'
import { ok, validationError } from './kit-response.js'

/**
 * API 端点契约定义
 *
 * 客户端和服务端共享的唯一真相源，保证路径、入参、出参编译时一致。
 */
export interface EndpointDef<
  TInput = unknown,
  TOutput = unknown,
> {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** 相对路径（相对于 API 前缀，如 '/auth/login'） */
  path: string
  /** 入参 Zod Schema（GET 请求为 query params，其他为 body） */
  input: z.ZodType<TInput>
  /** 出参 Zod Schema */
  output: z.ZodType<TOutput>
  /** 是否需要认证（默认 true） */
  requireAuth?: boolean
  /** OpenAPI 描述元数据（可选） */
  meta?: {
    summary?: string
    tags?: string[]
  }
}

/**
 * 辅助函数：创建端点定义（获得类型推导）
 *
 * @param def - 端点定义对象
 * @returns 同一个对象（类型安全）
 */
export function defineEndpoint<TInput, TOutput>(
  def: EndpointDef<TInput, TOutput>,
): EndpointDef<TInput, TOutput> {
  return def
}

/**
 * 基于契约创建 API handler
 *
 * - 自动从 request body/query 提取参数
 * - 自动使用契约的 input schema 校验
 * - handler 返回值类型必须匹配 output schema
 * - 自动包装为标准 kit.response.ok() 响应
 *
 * @param endpoint - 端点契约定义
 * @param fn - 业务处理函数（接收校验后的 input 和 RequestEvent）
 * @returns SvelteKit RequestHandler
 *
 * @example
 * ```ts
 * import { iamEndpoints } from '@h-ai/iam/api'
 *
 * export const POST = kit.fromContract(iamEndpoints.login, async (input, event) => {
 *   const result = await iam.auth.login(input)
 *   if (!result.success) {
 *     throw kit.response.error('AUTH_FAILED', result.error.message, 401)
 *   }
 *   return result.data
 * })
 * ```
 */
export function fromContract<TInput, TOutput>(
  endpoint: EndpointDef<TInput, TOutput>,
  fn: (input: TInput, event: RequestEvent) => Promise<TOutput>,
): RequestHandler {
  return handler(async (event) => {
    // 从 body 或 query 提取原始数据
    let raw: unknown

    if (endpoint.method === 'GET') {
      raw = Object.fromEntries(event.url.searchParams)
    }
    else {
      try {
        raw = await event.request.json()
      }
      catch {
        raw = {}
      }
    }

    // 用契约的 input schema 校验
    const parsed = endpoint.input.safeParse(raw)
    if (!parsed.success) {
      const errors = parsed.error.issues.map(issue => ({
        field: issue.path.join('.') || '_',
        message: issue.message,
      }))
      return validationError(errors)
    }

    // 执行业务逻辑
    const result = await fn(parsed.data, event)

    // 包装为标准响应
    return ok(result)
  })
}
