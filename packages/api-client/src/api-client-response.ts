import type { AnySchema } from '@orpc/contract'
import { getEventIteratorSchemaDetails } from '@orpc/contract'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { z } from 'zod'

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
