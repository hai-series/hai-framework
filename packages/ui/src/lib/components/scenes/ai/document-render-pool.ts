import type { MarkdownRenderResult } from './document-parse.js'
import type { DocumentRenderJob } from './document-render-worker.js'
import { core } from '@h-ai/core'

/**
 * 浏览器长文档共用解析池。SSR 和短文档直接使用已有渲染器。
 * @example 模块内部上下文
 * ```ts
 * const result = await documentRenderPool.run({ content: '# Report', locale: 'en-US' })
 * if (result.success) void result.data.outline
 * ```
 */
export const documentRenderPool = core.worker.createPool<DocumentRenderJob, MarkdownRenderResult>(
  () => new Worker(new URL('./document-render-worker.js', import.meta.url), { type: 'module' }),
  { maxWorkers: 2, maxQueuedJobs: 4, idleTimeoutMs: 15_000 },
)

/**
 * 小文档同步渲染，以便在一次更新内保留 DOM 和选区行为。
 * @example 模块内部上下文
 * ```ts
 * const eligible = useDocumentRenderWorker('# Article')
 * ```
 */
export function useDocumentRenderWorker(content: string): boolean {
  return typeof Worker !== 'undefined' && content.length >= 32 * 1024
}
