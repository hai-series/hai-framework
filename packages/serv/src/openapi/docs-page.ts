import type { OpenAPI } from '@orpc/contract'

/** 文档页面创建配置。 */
export interface CreateDocsPageOptions {
  readonly title?: string
  readonly specUrl?: string
}

/**
 * 创建轻量 API 文档 HTML。
 *
 * 默认使用 Scalar CDN；如生产环境不允许 CDN，可由应用关闭 docs endpoint 或替换静态资源策略。
 *
 * @param spec - OpenAPI spec，可用于离线内嵌
 * @param options - 文档页选项
 * @returns HTML 字符串
 */
export function createDocsPage(spec: OpenAPI.Document, options: CreateDocsPageOptions = {}): string {
  const title = escapeHtml(options.title ?? spec.info.title)
  const specUrl = options.specUrl

  if (specUrl) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><script id="api-reference" data-url="${escapeHtml(specUrl)}"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`
  }

  const encodedSpec = escapeScript(JSON.stringify(spec))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><script id="api-reference" type="application/json">${encodedSpec}</script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`
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
