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

/**
 * Scalar UI 脚本的默认路径；createApp 按文档所在目录挂载，并使用相对资源地址。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const scriptUrl = SCALAR_ROUTE
 * // createApp 自动挂载本地 bundle；这是内部资源路径，不是公开根常量。
 * ```
 */
export const SCALAR_ROUTE = '/_hai/scalar.js'

/** Scalar browser bundle 兜底路径；优先使用 package.json 的 browser 字段。 */
const SCALAR_BROWSER_ENTRY_FALLBACK = './dist/browser/standalone.js'

/** 缓存 Scalar UI 脚本内容（启动后不变，缓存避免重复读取）。 */
let scalarScriptCache: string | undefined

/**
 * OpenAPI spec 生成配置。
 *
 * @example
 * ```ts
 * import type { GenerateOpenAPISpecOptions } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const options: GenerateOpenAPISpecOptions = { title: 'Reports API', version: '1.0.0', apiPrefix: '/api/v1' }
 * ```
 */
export interface GenerateOpenAPISpecOptions {
  readonly title?: string
  readonly version?: string
  readonly apiPrefix?: string
  readonly description?: string
}

/**
 * 由真实应用 contract 生成 OpenAPI 3.1 文档。
 *
 * @param contract - 应用 contract
 * @param options - 标题、版本、描述与服务前缀
 * @returns OpenAPI 文档
 * @throws 底层转换器不能处理该 Schema 时 reject，调用方在启动或导出边界处理。
 *
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import { serv } from '@h-ai/serv'
 *
 * const spec = await serv.generateSpec(apiContract.create({}), { title: 'Reports API', version: '1.0.0', apiPrefix: '/api/v1' })
 * const title = spec.info.title
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

/**
 * 文档页面创建配置。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const options: CreateDocsPageOptions = { title: 'Reports API', specUrl: '/openapi.json', scriptUrl: SCALAR_ROUTE }
 * const spec = await generateSpec({}, { title: options.title })
 * const html = createDocsPage(spec, options)
 * ```
 */
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
 * 供 `createApp()` 在 docs 所在目录按需挂载 `_hai/scalar.js` 使用。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const script = await getScalarScript()
 * const available = script !== undefined
 * // 资源加载失败返回 undefined，由文档路由处理，不假定有外网兜底。
 * ```
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
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const spec = await generateSpec({}, { title: 'Reports API' })
 * const html = createDocsPage(spec, { specUrl: '/openapi.json' })
 * ```
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
