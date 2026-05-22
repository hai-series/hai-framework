/**
 * @h-ai/serv — OpenAPI 文档
 *
 * 由 oRPC contract 生成 OpenAPI 3.1 spec，并集中处理 Scalar 文档页 HTML
 * 与本地脚本资源读取逻辑。
 * @module serv-openapi
 */

import type { AnyContractRouter, OpenAPI } from '@orpc/contract'
import { readFile } from 'node:fs/promises'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'

/** Scalar UI 脚本本地路由，由 createApp 自动挂载，无需外网 CDN。 */
export const SCALAR_ROUTE = '/_hai/scalar.js'

/** Scalar browser bundle 兜底路径；优先使用 package.json 的 browser 字段。 */
const SCALAR_BROWSER_ENTRY_FALLBACK = './dist/browser/standalone.js'

/** 缓存 Scalar UI 脚本内容（启动后不变，缓存避免重复读取）。 */
let scalarScriptCache: string | undefined

/** OpenAPI spec 生成配置。 */
export interface GenerateOpenAPISpecOptions {
  readonly title?: string
  readonly version?: string
  readonly apiPrefix?: string
  readonly description?: string
}

/**
 * 由应用级 contract 生成 OpenAPI 3.1 spec。
 *
 * @param contract - 已组合完成的应用级 oRPC contract
 * @param options - 文档元信息
 * @returns OpenAPI 文档对象
 *
 * @example
 * ```ts
 * const spec = await serv.generateSpec(contract, {
 *   title: 'My API',
 *   version: '1.0.0',
 *   apiPrefix: '/api/v1',
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
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  })
}

/** 文档页面创建配置。 */
export interface CreateDocsPageOptions {
  readonly title?: string
  readonly specUrl?: string
  /**
   * Scalar UI 脚本 URL。
   *
   * 默认为 `/_hai/scalar.js`（由 `createApp` 自动挂载的本地路由），无需访问外网 CDN。
   * 如需指向 CDN，可设为 `https://cdn.jsdelivr.net/npm/@scalar/api-reference`。
   */
  readonly scriptUrl?: string
}

/**
 * 读取本地 Scalar browser bundle。
 *
 * 供 `createApp()` 在 docs 路由中按需挂载 `/_hai/scalar.js` 使用。
 */
export async function getScalarScript(): Promise<string | undefined> {
  if (scalarScriptCache !== undefined)
    return scalarScriptCache || undefined
  try {
    const fileUrl = await resolveScalarBrowserScriptUrl()
    scalarScriptCache = await readFile(fileUrl, 'utf8')
  }
  catch {
    scalarScriptCache = ''
  }
  return scalarScriptCache || undefined
}

/**
 * 创建轻量 API 文档 HTML。
 *
 * 默认使用本地路由 `/_hai/scalar.js` 加载 Scalar UI 脚本，无 CDN 依赖。
 *
 * @param spec - OpenAPI spec，可用于离线内嵌
 * @param options - 文档页选项
 * @returns HTML 字符串
 */
export function createDocsPage(spec: OpenAPI.Document, options: CreateDocsPageOptions = {}): string {
  const title = escapeHtml(options.title ?? spec.info.title)
  const specUrl = options.specUrl
  const scriptUrl = escapeHtml(options.scriptUrl ?? SCALAR_ROUTE)

  if (specUrl) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><script id="api-reference" data-url="${escapeHtml(specUrl)}"></script><script src="${scriptUrl}"></script></body></html>`
  }

  const encodedSpec = escapeScript(JSON.stringify(spec))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><script id="api-reference" type="application/json">${encodedSpec}</script><script src="${scriptUrl}"></script></body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(String.fromCharCode(39), '&#39;')
}

function escapeScript(value: string): string {
  return value.replaceAll('</script', '<\\/script')
}

async function resolveScalarBrowserScriptUrl(): Promise<URL> {
  const packageEntryUrl = import.meta.resolve('@scalar/api-reference')
  const packageJsonUrl = new URL('../package.json', packageEntryUrl)
  const packageInfo: unknown = JSON.parse(await readFile(packageJsonUrl, 'utf8'))
  const browserEntry = readScalarBrowserEntry(packageInfo) ?? SCALAR_BROWSER_ENTRY_FALLBACK
  return new URL(browserEntry, packageJsonUrl)
}

function readScalarBrowserEntry(packageInfo: unknown): string | undefined {
  if (typeof packageInfo !== 'object' || packageInfo === null || Array.isArray(packageInfo))
    return undefined
  const browser = (packageInfo as Record<string, unknown>).browser
  return typeof browser === 'string' ? browser : undefined
}
