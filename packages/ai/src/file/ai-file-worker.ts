import type { HaiResult, Locale } from '@h-ai/core'
import type { OutputFormat } from './ai-file-types.js'
import { Buffer } from 'node:buffer'
import { parentPort } from 'node:worker_threads'
import { core, ok } from '@h-ai/core'
import { parseHtmlFile } from './ai-file-html.js'
import { parseDocxContent, parsePdfContent } from './ai-file-native.js'

/**
 * 本地解析任务仅携带文件内容、格式和调用语言。
 * @example 模块内部上下文
 * ```ts
 * const job: FileParseJob = { type: 'html', content: '<p>Report</p>', format: 'text', locale: 'en-US' }
 * ```
 */
export type FileParseJob = { format: OutputFormat, locale: Locale } & (
  | { type: 'html', content: string | Uint8Array }
  | { type: 'pdf', content: Uint8Array, maxPages?: number }
  | { type: 'docx', content: Uint8Array }
)

/**
 * 本地解析成功后附带正文和 PDF 页数。
 * @example 模块内部上下文
 * ```ts
 * const reply: FileParseReply = ok({ text: 'Report', pageCount: 1 })
 * ```
 */
export type FileParseReply = HaiResult<{ text: string, pageCount?: number }>

async function parse(job: FileParseJob): Promise<FileParseReply> {
  if (job.type === 'html') {
    const markup = typeof job.content === 'string'
      ? job.content
      : Buffer.from(job.content.buffer, job.content.byteOffset, job.content.byteLength).toString('utf8')
    return ok({
      text: parseHtmlFile(markup, job.format),
    })
  }
  if (job.type === 'pdf')
    return parsePdfContent(job.content, job.format, job.maxPages)
  const result = await parseDocxContent(job.content, job.format)
  return result.success
    ? ok({ text: result.data })
    : result
}

parentPort?.on('message', async (job: FileParseJob) => {
  const result = await core.i18n.runWithLocale(job.locale, () => parse(job))
  parentPort?.postMessage(result)
})
