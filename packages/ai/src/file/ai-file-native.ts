import type { HaiResult } from '@h-ai/core'
import type { OutputFormat } from './ai-file-types.js'
import { Buffer } from 'node:buffer'
import { err, ok } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { parseHtmlFile } from './ai-file-html.js'

/**
 * 使用 pdfjs-dist 解析 PDF 内容。
 * @example 模块内部上下文
 * ```ts
 * const pdfResult = await parsePdfContent(new Uint8Array(), 'text', 1)
 * if (pdfResult.success) void pdfResult.data.pageCount
 * ```
 */
export async function parsePdfContent(content: Uint8Array, outputFormat: OutputFormat = 'text', maxPages?: number): Promise<HaiResult<{ text: string, pageCount: number }>> {
  try {
    const pdfjs = await import(

      // @ts-expect-error — pdfjs-dist is an optional peer dependency
      'pdfjs-dist/legacy/build/pdf.mjs',
    ) as { getDocument: (...args: unknown[]) => { promise: Promise<unknown>, destroy: () => Promise<void> } }
    const loadingTask = pdfjs.getDocument({ data: content })
    try {
      const pdf = await loadingTask.promise as {
        numPages: number
        getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>
      }
      const totalPages = pdf.numPages
      const pagesToProcess = maxPages
        ? Math.min(maxPages, totalPages)
        : totalPages
      const textParts: string[] = []

      for (let i = 1; i <= pagesToProcess; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map(item => item.str ?? '')
          .join(' ')
        textParts.push(pageText)
      }

      // markdown 模式用页分隔线区分每页
      const separator = outputFormat === 'markdown'
        ? '\n\n---\n\n'
        : '\n\n'
      return ok({
        text: textParts.join(separator),
        pageCount: totalPages,
      })
    }
    finally { await loadingTask.destroy() }
  }
  catch (error) {
    return err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
      params: {
        error: String(error),
      },
    }), error)
  }
}

/**
 * 使用 mammoth 解析 DOCX 内容
 *
 * - `'text'`：使用 `extractRawText` 提取纯文本
 * - `'markdown'`：使用 `convertToHtml` 后转换为 Markdown
 * @example 模块内部上下文
 * ```ts
 * const docxResult = await parseDocxContent(new Uint8Array(), 'markdown')
 * if (docxResult.success) void docxResult.data
 * ```
 */
export async function parseDocxContent(content: Uint8Array, outputFormat: OutputFormat = 'text'): Promise<HaiResult<string>> {
  try {
    const mammoth = await import(

      // @ts-expect-error — mammoth is an optional peer dependency
      'mammoth',
    ) as {
      extractRawText: (options: unknown) => Promise<{ value: string }>
      convertToHtml: (options: unknown) => Promise<{ value: string }>
    }
    if (outputFormat === 'markdown') {
      const result = await mammoth.convertToHtml({
        buffer: Buffer.from(content.buffer, content.byteOffset, content.byteLength),
      })
      return ok(parseHtmlFile(result.value, 'markdown'))
    }
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(content.buffer, content.byteOffset, content.byteLength),
    })
    return ok(result.value)
  }
  catch (error) {
    return err(HaiAIError.FILE_PARSE_FAILED, aiM('ai_fileParseFailed', {
      params: {
        error: String(error),
      },
    }), error)
  }
}
