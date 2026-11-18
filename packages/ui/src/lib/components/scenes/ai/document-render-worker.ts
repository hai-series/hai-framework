import type { MarkdownDocumentParseOptions, MarkdownRenderResult } from './document-parse.js'
import { core } from '@h-ai/core'
import { renderMarkdownDocument } from './document-parse.js'

/**
 * 文档 Worker 只接收 Markdown、宿主语言及渲染选项。
 * @example 模块内部上下文
 * ```ts
 * const job: DocumentRenderJob = { content: '# Report', locale: 'en-US', options: { enableHighlight: true } }
 * ```
 */
export interface DocumentRenderJob {
  content: string
  locale: string
  options?: MarkdownDocumentParseOptions
}

globalThis.addEventListener('message', ({ data }: MessageEvent<DocumentRenderJob>) => {
  core.i18n.setGlobalLocale(data.locale)
  const result: MarkdownRenderResult = renderMarkdownDocument(data.content, data.options)
  globalThis.postMessage(result)
})
