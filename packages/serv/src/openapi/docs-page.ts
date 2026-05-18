/**
 * @h-ai/serv — API 文档 HTML 生成
 *
 * 生成内嵌 Scalar UI 的单页 HTML，默认使用 createApp 自动挂载的本地脚本路由，无 CDN 依赖。
 * @module openapi/docs-page
 */

import type { OpenAPI } from '@orpc/contract'

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
  const scriptUrl = escapeHtml(options.scriptUrl ?? '/_hai/scalar.js')

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
