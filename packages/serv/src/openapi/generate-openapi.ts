/**
 * @h-ai/serv — OpenAPI spec 生成
 *
 * 基于 oRPC contract 和 `ZodToJsonSchemaConverter`，自动生成符合 OpenAPI 3.1 规范的文档。
 * 主要被 `createApp` 内部调用，也可单独执行以自定义方式输出 spec。
 * @module openapi/generate-openapi
 */

import type { AnyContractRouter, OpenAPI } from '@orpc/contract'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'

/** OpenAPI spec 生成配置。 */
export interface GenerateOpenAPISpecOptions {
  readonly title?: string
  readonly version?: string
  readonly apiPrefix?: string
  readonly description?: string
}

/**
 * 从应用级 contract 生成 OpenAPI spec。
 *
 * @param contract - 已组合完成的应用级 oRPC contract
 * @param options - 文档元信息
 * @returns OpenAPI 文档对象
 *
 * @example
 * ```ts
 * const spec = await generateSpec(apiServiceContract, {
 *   title: 'My API',
 *   version: '1.0.0',
 *   apiPrefix: '/api/v1',
 *   description: 'hai-framework API service',
 * })
 * ```
 */
export async function generateSpec(
  contract: AnyContractRouter,
  options: GenerateOpenAPISpecOptions = {},
): Promise<OpenAPI.Document> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  })

  return generator.generate(contract, {
    info: {
      title: options.title ?? 'hai-framework API',
      version: options.version ?? '0.1.0',
      description: options.description,
    },
    servers: options.apiPrefix ? [{ url: options.apiPrefix }] : undefined,
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  })
}
