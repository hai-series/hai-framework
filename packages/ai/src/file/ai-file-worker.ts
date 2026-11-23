import type { HaiResult, Locale } from '@h-ai/core'
import type { OutputFormat } from './ai-file-types.js'
import { Buffer } from 'node:buffer'
import { parentPort } from 'node:worker_threads'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { verifyDocxArchive } from './ai-file-archive.js'
import { parseHtmlFile } from './ai-file-html.js'
import { parseDocxContent, parsePdfContent } from './ai-file-native.js'

/**
 * 本地解析任务仅携带文件内容、格式和调用语言。
 * @example 模块内部上下文
 * ```ts
 * const job: FileParseJob = { type: 'html', content: '<p>Report</p>', format: 'text', locale: 'en-US' }
 * ```
 */
export type FileParseJob = {
  format: OutputFormat
  locale: Locale
  limits?: { maxTextLength: number, maxZipEntries: number, maxExpandedBytes: number }
} & (
  | { type: 'text', content: string | Uint8Array }
  | { type: 'html', content: string | Uint8Array }
  | { type: 'pdf', content: Uint8Array, maxPages?: number }
  | { type: 'docx', content: Uint8Array }
)

/**
 * 本地解析成功后附带正文和 PDF 页数。
 * @example 模块内部上下文
 * ```ts
 * const reply: FileParseReply = core.ok({ text: 'Report', pageCount: 1 })
 * ```
 */
export type FileParseReply = HaiResult<{ text: string, pageCount?: number, truncated?: boolean }>

async function extract(job: FileParseJob): Promise<FileParseReply> {
  if (job.type === 'text' || job.type === 'html') {
    const source = typeof job.content === 'string'
      ? job.content
      : new TextDecoder('utf-8', {
          fatal: Boolean(job.limits),
        }).decode(job.content)
    if (job.limits) {
      for (const character of source) {
        const code = character.charCodeAt(0)
        if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127)
          return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileLocalInvalid'))
      }
    }
    return core.ok({
      text: job.type === 'html'
        ? parseHtmlFile(source, job.format)
        : source.replace(/\r\n?/g, '\n'),
    })
  }
  if (job.type === 'pdf') {
    if (job.limits && Buffer.from(job.content.subarray(0, 5)).toString('ascii') !== '%PDF-')
      return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileLocalInvalid'))
    return parsePdfContent(job.content, job.format, job.maxPages, job.limits?.maxTextLength)
  }
  if (job.limits)
    await verifyDocxArchive(job.content, job.limits.maxZipEntries, job.limits.maxExpandedBytes)
  const result = await parseDocxContent(job.content, job.format)
  return result.success
    ? core.ok({ text: result.data })
    : result
}

async function parse(job: FileParseJob): Promise<FileParseReply> {
  if (!job.limits)
    return extract(job)
  try {
    const result = await extract(job)
    if (!result.success) {
      // 解析器异常可能附带输入或本机路径，严格模式不把这些信息带出线程。
      return result.error.code === HaiAIError.FILE_INVALID_CONTENT.code
        ? result
        : core.err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileLocalFailed'))
    }
    const text = result.data.text.trim()
    if (!text)
      return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileLocalNoText'))
    const limit = job.limits.maxTextLength
    if (!result.data.truncated && text.length <= limit)
      return core.ok({ ...result.data, text })
    const suffix = limit > 1
      ? '\n…'
      : '…'
    const excerpt = text.slice(0, limit - suffix.length).replace(/\p{Surrogate}$/u, '').trimEnd()
    return core.ok({
      ...result.data,
      text: excerpt
        ? `${excerpt}${suffix}`
        : '…',
      truncated: true,
    })
  }
  catch {
    return core.err(HaiAIError.FILE_INVALID_CONTENT, aiM('ai_fileLocalInvalid'))
  }
}

parentPort?.on('message', async (job: FileParseJob) => {
  const result = await core.i18n.runWithLocale(job.locale, () => parse(job))
  parentPort?.postMessage(result)
})
