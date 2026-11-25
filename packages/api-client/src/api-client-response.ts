import type { AnySchema } from '@orpc/contract'
import { HaiErrorSchema } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { TransportBodyTooLargeError, TransportTimeError } from '@h-ai/crypto'
import { ORPCError } from '@orpc/client'
import { getEventIteratorSchemaDetails } from '@orpc/contract'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { z } from 'zod'
import { apiClientM } from './api-client-i18n.js'
import { HaiApiClientError } from './api-client-types.js'

const converter = new ZodToJsonSchemaConverter({
  unsupportedJsonSchema: {},
  // oRPC 在浏览器中保留 File 实例；JSON Schema 的字符串描述只适用于文档。
  interceptors: [
    ({ schema, next }) => schema._zod.def.type === 'file'
      ? [true, {}]
      : next(),
  ],
})
const validators = new WeakMap<AnySchema, { schema: z.ZodType, required: boolean } | null>()

/**
 * 校验可表示为 HTTP JSON Schema 的响应。保留线上的原值，不执行服务端转换。
 *
 * @example 模块内部上下文
 * ```ts
 * const valid = conformsToResponseSchema(z.object({ sentAt: z.date() }), {
 *   sentAt: '2026-05-20T10:00:00.000Z',
 * })
 * ```
 */
export function conformsToResponseSchema(schema: AnySchema | undefined, output: unknown): boolean {
  if (!schema)
    return true
  if (getEventIteratorSchemaDetails(schema))
    return typeof output === 'object' && output !== null && typeof Reflect.get(output, Symbol.asyncIterator) === 'function'
  let validator = validators.get(schema)
  if (validator === undefined) {
    validator = null
    if (converter.condition(schema)) {
      try {
        const [required, wireSchema] = converter.convert(schema, { strategy: 'output' })
        // oRPC 的 Schema 类型允许多种方言；转换器产出与 Zod 支持的 JSON Schema 2020-12 结构兼容。
        validator = {
          schema: z.fromJSONSchema(wireSchema as Parameters<typeof z.fromJSONSchema>[0]),
          required,
        }
      }
      catch {
        // 自定义 Schema 可能包含客户端无法表达的关键字，继续由服务端执行完整校验。
      }
    }
    validators.set(schema, validator)
  }
  return !validator || (output === undefined && !validator.required) || validator.schema.safeParse(output).success
}

/**
 * 将 oRPC 状态、AbortError 与其它传输异常映射为稳定客户端错误；保留 oRPC code/status/data 详情。
 * @param error - procedure 抛出的未知异常。
 * @returns 失败 HaiResult，不包含虚构的成功数据。
 *
 * @example 模块内部上下文
 * ```ts
 * const result = mapClientError(new DOMException('Request aborted', 'AbortError'))
 * if (!result.success) { const code = result.error.code }
 * ```
 */
export function mapClientError(error: unknown) {
  const time = error instanceof TransportTimeError
    ? error
    : error instanceof Error && error.cause instanceof TransportTimeError
      ? error.cause
      : undefined
  if (time)
    return core.err(HaiApiClientError.VALIDATION_FAILED, time.message, { transportCode: time.code, serverTime: time.serverTime })
  const capacity = error instanceof TransportBodyTooLargeError
    ? error
    : error instanceof Error && error.cause instanceof TransportBodyTooLargeError
      ? error.cause
      : undefined
  if (capacity) {
    return core.err(HaiApiClientError.PAYLOAD_TOO_LARGE, capacity.message, {
      direction: capacity.direction,
      stage: capacity.stage,
      limitBytes: capacity.limitBytes,
      actualBytes: capacity.actualBytes,
    })
  }
  if (error instanceof ORPCError) {
    // Kit 等 HTTP 宿主使用非 2xx HaiResult；oRPC 将该包络放在 data.body 中。
    // 恢复已校验的业务错误，HTTP 状态优先，不能让正文把 5xx 降为可公开的 4xx。
    const body: unknown = error.data && typeof error.data === 'object' && 'body' in error.data
      ? error.data.body
      : undefined
    if (body && typeof body === 'object' && 'success' in body && body.success === false && 'error' in body) {
      const parsed = HaiErrorSchema.safeParse(body.error)
      if (parsed.success)
        return core.err({ ...parsed.data, httpStatus: error.status })
    }
    // 保留 ORPCError 的原始 code / status / data，供上层区分具体业务异常（不仅是 HTTP 状态码）。
    const detail = { orpcCode: error.code, status: error.status, data: error.data }
    if (error.status === 413)
      return core.err(HaiApiClientError.PAYLOAD_TOO_LARGE, error.message, detail)
    if (error.status === 400 || error.status === 422)
      return core.err(HaiApiClientError.VALIDATION_FAILED, error.message, detail)
    if (error.status === 401)
      return core.err(HaiApiClientError.UNAUTHORIZED, error.message, detail)
    if (error.status === 403)
      return core.err(HaiApiClientError.FORBIDDEN, error.message, detail)
    if (error.status === 404)
      return core.err(HaiApiClientError.NOT_FOUND, error.message, detail)
    return core.err(HaiApiClientError.SERVER_ERROR, error.message, detail)
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return core.err(HaiApiClientError.TIMEOUT, apiClientM('apiClient_timeout'), error)
  }
  return core.err(HaiApiClientError.NETWORK_ERROR, apiClientM('apiClient_networkError'), error)
}
